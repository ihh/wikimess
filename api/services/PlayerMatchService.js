// api/services/PlayerMatchService.js
module.exports = {

    joinGame: function (info, gameStarted, playerWaiting, error) {
        var player = info.player
        var scenes = Player.getScenes (player)
        var query = Player
            .find ({ id: { '!': player.id } })
        if (info.wantHuman)
            query.where ({ human: true,
                           waiting: true })
        else
            query.where ({ human: false })
        query
            .exec (function (err, eligibleOpponents) {
                if (err)
                    rs (err)
                else {
                    // to be eligible, opponents must share at least one scene
                    eligibleOpponents = eligibleOpponents
                        .filter (function (opp) {
                            var oppScenes = opp.global.scene
                            for (var s = 0; s < scenes.length; ++s)
                                if (Player.hasScene (opp, scenes[s]))
                                    return true
                            return false
                        })
                    PlayerMatchService
                        .tryRandomOpponent (player,
                                            eligibleOpponents,
                                            gameStarted,
                                            playerWaiting,
                                            error)
                }
            })
    },

    playerIsEligible: function (choice, player, role) {
        // can implement more logic here, based on individual Choice parameters
        return true
    },
    
    tryRandomOpponent: function (player, eligibleOpponents, gameStarted, playerWaiting, error) {
        if (eligibleOpponents.length == 0) {
            // no eligible opponents
            // update the 'waiting' field
            Player
                .update ({ id: player.id },
                         { waiting: true },
                         function (err, updated) {
                             if (err)
                                 error (err)
                             else
                                 playerWaiting()
                         })
        } else {
            // pick a random opponent
            var nOpp = Math.floor (Math.random (eligibleOpponents.length))
            var opponent = eligibleOpponents[nOpp]
            eligibleOpponents.splice (nOpp, 1)  // remove from eligibleOpponents
            // find shared scenes
            var sharedScenes = Player.getScenes(player).filter (function (scene) {
                return Player.hasScene (opponent, scene)
            })
            // find choices for this scene
            Choice
                .find ({ scene: sharedScenes })
                .exec (function (err, eligibleChoices) {
                    if (err)
                        error (err)
                    else {
                        eligibleChoices = eligibleChoices.filter (function (choice) {
                            return (PlayerMatchService.playerIsEligible(choice,player,1)
                                    && PlayerMatchService.playerIsEligible(choice,opponent,2))
                                || (PlayerMatchService.playerIsEligible(choice,opponent,1)
                                    && PlayerMatchService.playerIsEligible(choice,player,2))
                        })
                        if (eligibleChoices.length == 0)
                            PlayerMatchService.tryRandomOpponent (player, eligibleOpponents, gameStarted, playerWaiting, error)
                        else {
                            // pick a random Choice
                            var nChoice = Math.floor (Math.random() * eligibleChoices.length)
                            var choice = eligibleChoices[nChoice]
                            // randomly assign player 1 & player 2
                            var eligible12 = PlayerMatchService.playerIsEligible(choice,player,1)
                                && PlayerMatchService.playerIsEligible(choice,opponent,2)
                            var player1, player2
                            if (Math.random() < .5 && eligible12) {
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
			    GameService.createGame (game,
						    function() { 
							// update the 'waiting' fields
							Player.update ( { id: [player1.id, player2.id] },
									{ waiting: false },
									function (err, updated) {
									    if (err)
										error (err)
									    else
										gameStarted (opponent, game)
									})
						    })
                        }
                    }
                })
        }
    },
}

