/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
      id: {
          type: 'integer',
          autoIncrement: true,
          unique: true,
          primaryKey: true
      },

      name: {
          type: 'string',
          unique: true,
          required: true
      },

      // global stats for this player
      cash: {
          type: 'integer',
          defaultsTo: 0
      },
      
      // references to games
      player1games: {
          collection: 'game',
          via: 'player1'
      },

      player2games: {
          collection: 'game',
          via: 'player2'
      },

      // attributes to manage joining games
      waiting: {  // true if waiting to join a game
          type: 'boolean',
          defaultsTo: false
      }
  },

    joinGame: function (player, gameStarted, playerWaiting, error) {
        Player
            .find ( { waiting: true,
                      id: { '!': player.id } } )
            .exec (function (err, eligibleOpponents) {
                if (err)
                    rs (err)
                else {
                    if (eligibleOpponents.length) {
                        // pick a random opponent
                        var nOpp = Math.floor (Math.random (eligibleOpponents.length))
                        var opponent = eligibleOpponents[nOpp]
                        // pick a random choice
                        Choice
                            .find ( { root: true })
                            .exec (function (err, eligibleChoices) {
                                if (err)
                                    error (err)
                                else if (eligibleChoices.length == 0) {
                                    // for now, throw an error if no eligible choice nodes are found
                                    // longer term, should remove opponent from eligibleOpponents list and retry
                                    error (new Error ("No available root choices"))
                                } else {
                                    var choice = eligibleChoices[0]
                                    // randomly assign player 1 & player 2
                                    var player1id, player2id
                                    if (Math.random() < .5) {
                                        player1id = player.id
                                        player2id = opponent.id
                                    } else {
                                        player1id = opponent.id
                                        player2id = player.id
                                    }
                                    // create the game
                                    Game.create ( { player1: player1id,
                                                    player2: player2id,
                                                    current: choice },
                                                  function (err, game) {
                                                      if (err)
                                                          error (err)
                                                      else {
                                                          // update the 'waiting' fields
                                                          Player.update ( { where: { or: [ { id: player1id }, { id: player2id } ] } },
                                                                          { waiting: false },
                                                                          function (err, updated) {
                                                                              if (err)
                                                                                  error (err)
                                                                              else
                                                                                  gameStarted (opponent, game)
                                                                          })
                                                      }
                                                  })
                                }
                            })

                    } else {  // no eligible opponents
                        // update the 'waiting' field
                        Player.update ( { id: player.id }, { waiting: true }, function (err, updated) {
                            if (err)
                                error (err)
                            else
                                playerWaiting()
                        })
                    }
                }
            })
    },

};
