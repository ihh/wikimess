// api/services/PlayerMatchService.js
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
					      ? Math.sqrt (evalPlayerExpr (player, opponent, event.compatibility)
							   * evalPlayerExpr (opponent, player, event.compatibility))
					      : 1) }
			})
			PlayerMatchService
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
			.exec (function (err, invites) {
			    if (err) error (err)
			    else tryOpponents (invites.map (function (invite) { return invite.player }))
			})
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
	    MiscPlayerService.runWithLock
	    ([ player.id ],
             function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
                 if (MiscPlayerService.unaffordable (player, event.cost))
                     lockedError (new Error("Event unaffordable"))
                 else
	             Invite.findOrCreate
	         ({ player: player.id,
	            event: event.id })
		     .exec (function (err, invites) {
                         if (err)
                             lockedError (err)
                         else {
			     MiscPlayerService.deductCost (player, event.cost)
                             Player.update ({ id: player.id },
                                            { global: player.global },
                                            lockedSuccess,
                                            lockedError)
                         }
                     })
             },
             playerWaiting,
             error)
        } else {
            // pick a random opponent
	    var totalWeight = weightedOpponents.reduce (function (total, wo) { return total + wo.weight }, 0)
	    var nOpp, w = Math.random() * totalWeight
	    for (nOpp = 0; nOpp < weightedOpponents.length - 1; ++nOpp)
		if ((w -= weightedOpponents[nOpp].weight) <= 0)
		    break
            var opponent = weightedOpponents[nOpp].opponent
            weightedOpponents.splice (nOpp, 1)  // remove from weightedOpponents
	    // lock player & opponent, test eligibility & if all is OK, start the Game
	    MiscPlayerService.runWithLock
	    ([ player.id, opponent.id ],
             function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
		 // figure out if costs already deducted (i.e. Invite table entry exists)
                 Invite.find ({ player: player.id,
                                event: event.id })
                     .exec (function (err, invites) {
                         if (err) lockedError(err)
                         else {
                             var costsDeducted = invites.length > 0
                             console.log ("costsDeducted="+costsDeducted)
                             console.log (MiscPlayerService.invisibleOrLocked (player, event, costsDeducted))
		             console.log (MiscPlayerService.invisibleOrLocked (opponent, event, true))

		             if (MiscPlayerService.invisibleOrLocked (player, event, costsDeducted)
		                 || MiscPlayerService.invisibleOrLocked (opponent, event, true))
		                 lockedSuccess (null)
		             else {
		                 Choice.findOneByName (event.choice)
			             .exec (function (err, choice) {
			                 if (err)
				             lockedError (err)
			                 else {
				             // randomly assign player 1 & player 2
				             var p1weight, o1weight
				             if (event.role1weight) {
				                 p1weight = MiscPlayerService.evalPlayerExpr (player, event.role1weight)
				                 o1weight = MiscPlayerService.evalPlayerExpr (opponent, event.role1weight)
				             } else
				                 p1weight = o1weight = 1
				             var p1o2prob = (p1weight + 1) / (p1weight + o1weight + 2)
				             if (Math.random() < p1o2prob) {
                                                 player1 = player
                                                 player2 = opponent
				             } else {
                                                 player1 = opponent
                                                 player2 = player
				             }
                                             // deduct costs, if not already deducted
                                             if (!costsDeducted)
				                 MiscPlayerService.deductCost (player, event.cost)
				             // create the game
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
                     PlayerMatchService.tryRandomOpponent (player, event, weightedOpponents, gameStarted, playerWaiting, error)
	     },
	     error)
	}
    },
}

