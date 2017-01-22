// api/services/InviteService.js

var Promise = require('bluebird')

module.exports = {

  joinGame: function (info, gameStarted, playerWaiting, error) {
    var player = info.player
    var event = info.event

    // first check if there's a running Game
    Game.find ({ where: { or: [ { player1: player.id, quit1: false },
				{ player2: player.id, quit2: false } ],
			  event: event.id } })
      .exec (function (err, games) {
	if (err) rs(err)
	else if (games.length) {
	  var game = games[0]
	  error (new Error ("Game " + game.id + " already in progress"))
	} else {

	  // prepare a callback for when we find opponents
	  function tryOpponents (potentialOpponents) {
	    var weightedOpponents = potentialOpponents.map (function (opponent) {
	      return { opponent: opponent,
		       weight: (event.compatibility
				? (PlayerService.evalPlayerExpr (opponent, player, event.compatibility) || 0)
				: 1) }
	    })
	    InviteService
	      .tryRandomOpponent (player,
				  event,
				  weightedOpponents,
				  gameStarted,
				  playerWaiting,
				  error)
	  }

	  // find eligible opponents
	  if (event.opponent)
	    Player.find ({ name: event.opponent })
	    .exec (function (err, players) {
	      if (err) error (err)
	      else tryOpponents (players)
	    })
	  else if (info.wantHuman)
	    Invite.find ({ event: event.id,
			   player: { '!': player.id } })
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
                    return opponent
                  })
              })
            }).then (tryOpponents)
            .catch (error)
	  else
	    Player.find ({ id: { '!': player.id },
			   human: false })
	    .exec (function (err, players) {
	      if (err) error (err)
	      else tryOpponents (players)
	    })
	}
      })
  },

  tryRandomOpponent: function (player, event, weightedOpponents, gameStarted, playerWaiting, error) {
    if (weightedOpponents.length == 0) {
      // no eligible opponents
      // update the Invite table
      PlayerService.runWithLock
      ([ player.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
         if (LocationService.unaffordable (player, event.cost))
           lockedError (new Error("Event unaffordable"))
         else
	   Invite.findOrCreate
	 ({ player: player.id,
	    event: event.id })
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
       },
       playerWaiting,
       error)
    } else {
      // pick a random opponent
      var weights = weightedOpponents.map (function (wo) { return wo.weight })
      var nOpp = GameService.sampleByWeight (weights)
      var opponent = weightedOpponents[nOpp].opponent
      weightedOpponents.splice (nOpp, 1)  // remove from weightedOpponents
      // lock player & opponent, test eligibility & if all is OK, start the Game
      PlayerService.runWithLock
      ([ player.id, opponent.id ],
       function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
	 // figure out if costs already deducted (i.e. Invite table entry exists)
         Invite.find ({ player: player.id,
                        event: event.id })
           .exec (function (err, invites) {
             if (err) lockedError(err)
             else {
               var costsDeducted = invites.length > 0
	       if (LocationService.invisibleOrLocked (player, event, costsDeducted)
		   || LocationService.invisibleOrLocked (opponent, event, true))
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
                       if (!costsDeducted)
			 LocationService.deductCost (player, event.cost)
		       // create the game
                       var player1 = opponent  // the player who created the Invite table entry is player 1
                       var player2 = player
		       var game = { player1: player1,
                                    player2: player2,
				    event: event,
                                    current: choice,
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
	     }
           })
       },
       function (game) {
	 if (game)
	   gameStarted (opponent, game)
	 else
           InviteService.tryRandomOpponent (player, event, weightedOpponents, gameStarted, playerWaiting, error)
       },
       error)
    }
  },
}

