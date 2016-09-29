// api/services/PlayerMatchService.js
module.exports = {

    joinGame: function (info, gameStarted, playerWaiting, error) {
        var player = info.player
	var event = info.event

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

	if (info.wantHuman)
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
    },

    tryRandomOpponent: function (player, event, weightedOpponents, gameStarted, playerWaiting, error) {
        if (weightedOpponents.length == 0) {
            // no eligible opponents
            // update the Invite table
	    Invite.findOrCreate
	    ({ player: player.id,
	       event: event.id })
		.exec (function (err, invites) {
                    if (err)
                        error (err)
                    else
                        playerWaiting()
                })
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
		 if (MiscPlayerService.eventInvisibleOrLocked (player, event)
		     || MiscPlayerService.eventInvisibleOrLocked (opponent, event))
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
				 // create the game
				 var game = { player1: player1,
                                              player2: player2,
                                              current: choice,
					      mood1: player1.initialMood || 'happy',
					      mood2: player2.initialMood || 'happy' }
				 GameService.createGame
				 (game,
				  function (err, created) {
				      if (err) lockedError(err)
				      else {
					  Invite.destroy ({ id: [player1.id, player2.id],
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
	     },
	     function (game) {
		 if (game)
		     gameStarted (opponent, game)
		 else
                     PlayerMatchService.tryRandomOpponent (player, weightedOpponents, gameStarted, playerWaiting, error)
	     },
	     error)
	}
    },
}

