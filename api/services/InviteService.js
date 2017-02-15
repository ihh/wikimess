// api/services/InviteService.js

var Promise = require('bluebird')

module.exports = {

  compatibility: function (player1, player2, event) {
    return event.compatibility
      ? (PlayerService.evalPlayerExpr (player1, player2, event.compatibility) || 0)
      : 1
  },

  joinGame: function (info, gameStarted, playerWaiting, error) {
    var player = info.player
    var event = info.event
    var wantRole = parseInt (info.wantRole)
    
    // first check if there's a running Game
    var playerIdQuery = []
    if (wantRole != 2)
      playerIdQuery.push ({ player1: player.id, quit1: false })
    if (wantRole != 1)
      playerIdQuery.push ({ player2: player.id, quit2: false })
    Game.find ({ where: { or: playerIdQuery,
			  event: event.id } })
      .exec (function (err, games) {
	if (err) error(err)
	else if (games.length) {
	  var game = games[0]
	  error (new Error ("Game " + game.id + " already in progress"))
	} else {

	  // prepare a callback for when we find opponents
	  function tryOpponents (potentialOpponents) {
	    var weightedOpponents = potentialOpponents.map (function (info) {
	      return { opponent: info.opponent,
		       role: info.role,
		       weight: InviteService.compatibility (info.role == 1 ? player : info.opponent,
							    info.role == 1 ? info.opponent : player,
							    event) }
	    })
	    InviteService
	      .tryRandomOpponent (player,
				  event,
				  weightedOpponents,
				  wantRole,
				  gameStarted,
				  playerWaiting,
				  error)
	  }

	  // find eligible opponents
	  if (event.botDefaultWait == 0 || !info.wantHuman) {
	    var query = Player.find()
	    if (event.opponent)
	      query = query.where ({ displayName: event.opponent })
	    else
	      query = query.where ({ id: { '!': player.id },
				     human: false })
	    query = query.where ({ partner: player.id })
	    query.exec (function (err, players) {
	      if (err) error (err)
	      else tryOpponents (players.map (function (player) {
		return { opponent: player,
			 role: (wantRole || 1) }
	      }))
	    })
	  } else {
	    var inviteQuery = 
	      Invite.find ({ event: event.id,
			     player: { '!': player.id } })
	    if (wantRole)
	      inviteQuery.where ({ role: { '!': wantRole } })
	    inviteQuery
	      .populate ('player')
              .then (function (invites) {
		return Promise.map (invites, function (invite) {
                  var opponent = invite.player
                  return Follow.find()
                    .where ({ or: [{ follower: player.id, followed: opponent.id },
                                   { follower: opponent.id, followed: player.id }] })
                    .then (function (follows) {
                      follows.forEach (function (follow) {
			if (follow.follower == player.id) player.isFollower = true
			if (follow.follower == opponent.id) opponent.isFollower = true
                      })
                      return { opponent: opponent,
			       role: (wantRole || (invite.role ? (3 ^ invite.role) : 2)) }
                    })
		})
              }).then (tryOpponents)
              .catch (error)
	    }
	}
      })
  },

  tryRandomOpponent: function (player, event, weightedOpponents, inviteRole, gameStarted, playerWaiting, error) {
    if (weightedOpponents.length == 0) {
      // no eligible opponents
      // update the Invite table
      PlayerService.runWithLock
      ([ player.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
         if (LocationService.unaffordable (player, event.cost))
           lockedError (new Error("Event unaffordable"))
         else {
	   var inviteDesc = { player: player.id,
			      event: event.id }
	   if (inviteRole)
	     inviteDesc.role = inviteRole
	   Invite.findOrCreate (inviteDesc)
	     .exec (function (err, invite) {
               if (err)
		 lockedError (err)
               else {
		 LocationService.deductCost (player, event.cost)
		 Player.update ({ id: player.id },
				{ global: player.global },
				function() { lockedSuccess(invite) },
				lockedError)
               }
             })
	 }
       },
       playerWaiting,
       error)
    } else {
      // pick a random opponent
      var weights = weightedOpponents.map (function (wo) { return wo.weight })
      var nOpp = GameService.sampleByWeight (weights)
      var opponent = weightedOpponents[nOpp].opponent
      var role = weightedOpponents[nOpp].role
      weightedOpponents.splice (nOpp, 1)  // remove from weightedOpponents

      InviteService.startGame ({ player1: role == 1 ? player : opponent,
                                 player2: role == 1 ? opponent : player,
                                 event: event,
                                 player1CostsDeducted: (role == 2),
                                 player2CostsDeducted: (role == 1),
                                 testPlayer1CostsDeducted: (role == 1),
                                 testPlayer2CostsDeducted: (role == 2),
                                 successCallback: function (game) {
                                   gameStarted (opponent, game)
                                 },
                                 failureCallback: function() {
                                   InviteService.tryRandomOpponent (player, event, weightedOpponents, inviteRole, gameStarted, playerWaiting, error)
                                 },
                                 errorCallback: error
                               })
    }
  },

  costPromise: function (doTest, defaultValue, playerId, eventId) {
    return doTest ? Invite.find ({ player: playerId, event: eventId }) : Promise.resolve (defaultValue)
  },

  cancelJoinGame: function (info, successCallback, errorCallback) {
    var player = info.player, event = info.event
    Invite.destroy ({ player: player.id, event: event.id })
      .exec (function (err, deleted) {
        if (err)
	  rs (err)
        else {
          if (deleted.length)
            PlayerService.runWithLock
          ([ player.id ],
           function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
	     LocationService.refundCost (player, event)
             lockedSuccess()
           },
           successCallback,
           errorCallback)
          else
            successCallback()
        }
      })
  },
  
  startGame: function (info) {
    var event = info.event
    var player1 = info.player1
    var player2 = info.player2
    var pendingAccept = info.pendingAccept
    var successCallback = info.successCallback
    var failureCallback = info.failureCallback
    var errorCallback = info.errorCallback

    // lock player & opponent, test eligibility & if all is OK, start the Game
    PlayerService.runWithLock
      ([ player1.id, player2.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
         // figure out if costs already deducted (i.e. Invite table entry exists)
         var player1CostPromise = InviteService.costPromise (info.testPlayer1CostsDeducted,
							     info.player1CostsDeducted,
							     player1.id,
							     event.id)
         var player2CostPromise = InviteService.costPromise (info.testPlayer2CostsDeducted,
							     info.player2CostsDeducted,
							     player2.id,
							     event.id)

	 player1CostPromise.then (function (player1CostsDeducted) {
           player2CostPromise.then (function (player2CostsDeducted) {
	     if (LocationService.invisibleOrLocked (player1, event, player1CostsDeducted)
		 || LocationService.invisibleOrLocked (player2, event, player2CostsDeducted))
	       lockedSuccess (null)
	     else {
               Choice.findOneByName (event.choice)
		 .populate('intro')
		 .populate('intro2')
		 .exec (function (err, choice) {
		   if (err)
		     lockedError (err)
                   else if (!choice)
		     lockedError ("Choice " + event.choice + " not found")
		   else {
                     // deduct costs, if not already deducted
                     if (!player1CostsDeducted)
		       LocationService.deductCost (player1, event.cost)
                     if (!player2CostsDeducted)
		       LocationService.deductCost (player2, event.cost)
		     // create the game
		     var game = { player1: player1,
                                  player2: player2,
				  event: event,
                                  current: choice,
                                  pendingAccept: pendingAccept,
				  mood1: player1.initialMood || 'happy',
				  mood2: player2.initialMood || 'happy' }
		     GameService.createGame
		     (game,
		      function (err, created) {
			if (err) lockedError(err)
			else {
			  Invite.destroy ({ player: [player1.id, player2.id],
					    event: event.id })
			    .exec (function (err) {
			      if (err)
				lockedError (err)
			      else
				lockedSuccess (game)
			    })
			}
		      })
		   }
		 })
	     }
           })
         })
       },
       function (game) {
	 if (game)
	   successCallback (game)
	 else
           failureCallback()
       },
       errorCallback)
  },
  
  openInvitation: function (info) {
    var player = info.player
    var other = info.other
    var event = info.event
    var wantRole = parseInt (info.wantRole)
    
    return new Promise (function (resolve, reject) {
      // first check if there's a running Game
      var playerIdQuery = []
      if (wantRole != 2)
        playerIdQuery.push ({ player1: player.id, player2: other.id })
      if (wantRole != 1)
        playerIdQuery.push ({ player2: player.id, player1: other.id })
      
      Game.find ({ where: { or: playerIdQuery,
                            quit1: false,
                            quit2: false,
			    event: event.id } })
        .then (function (games) {
          if (games.length)
	    reject (new Error ("Game " + games[0].id + " already in progress"))
          else
            return true
        }).then (function() {
          InviteService.startGame ({ player1: (wantRole == 2 ? other : player),
                                     player2: (wantRole == 1 ? player : other),
                                     event: event,
                                     player1CostsDeducted: (wantRole == 2),   // player 1 does not pay for chat games they're invited to
                                     player2CostsDeducted: (wantRole != 2),   // player 2 does not pay for chat games they're invited to
                                     testPlayer1CostsDeducted: false,
                                     testPlayer2CostsDeducted: false,
                                     pendingAccept: !event.launch,
                                     successCallback: resolve,
                                     failureCallback: reject,
                                     errorCallback: function (error) { throw error }
                                   })
        })
    })
  },

  cancelInvitations: function (games) {
    return new Promise (function (resolve, reject) {
      PlayerService.runWithLock
      ([ games[0].player1.id, games[0].player2.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
         games.forEach (function (game) {
	   LocationService.refundCost (game.player1, game.event.cost)
         })
	 Game.destroy ({ id: games.map (function (game) { return game.id }) })
           .then (lockedSuccess)
           .catch (lockedError)
       },
       function() { resolve (games.map (function (game) { game.canceled = true; return game })) },
       reject)
    })
  },

  acceptInvitation: function (game) {
    return new Promise (function (resolve, reject) {
      PlayerService.runWithLock
      ([ game.player1.id, game.player2.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
         GameService.startGame (game,
                                function() { lockedSuccess(true) },
                                function () {
	                          LocationService.refundCost (game.player1, game.event.cost)
	                          Game.destroy ({ game: game.id })
                                    .then (function() { lockedSuccess(false) })
                                    .catch (lockedError)
                                      })
       },
       function (started) {
         if (started) resolve(game)
         else reject()
       },
       reject)
    })
  },

}
