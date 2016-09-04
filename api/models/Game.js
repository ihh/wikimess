/**
 * Game.js
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

      player1: {
          model: 'player'
      },

      player2: {
          model: 'player'
      },

      // current state of the game
      finished: {
          type: 'boolean',
          defaultsTo: false
      },

      current: {
          model: 'choice'
      },

      future: {
          type: 'array',
          defaultsTo: []
      },

      moves: {  // number of COMPLETED moves. The index of the moves themselves start at 1
          type: 'integer',
          defaultsTo: 0
      },

      // player choices
      move1: {
          type: 'string',
          enum: ['c', 'd']
      },

      move2: {
          type: 'string',
          enum: ['c', 'd']
      },

      // player state specific to this game
      mood1: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised'],
          defaultsTo: 'happy'
      },

      mood2: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised'],
          defaultsTo: 'happy'
      }
  },

    forRole: function (game, role) {
        var intro, verb, hintc, hintd, self, other, selfMood, otherMood
        var current = game.current
        if (role == 1) {
            intro = current.intro
            verb = current.verb
            hintc = current.hintc
            hintd = current.hintd
            self = game.player1
            other = game.player2
            selfMood = game.mood1
            otherMood = game.mood2
        } else {  // role == 2
            intro = current.intro2 || current.intro
            verb = current.verb2 || current.verb
            hintc = current.hintc2 || current.hintc
            hintd = current.hintd2 || current.hintd
            self = game.player2
            other = game.player1
            selfMood = game.mood2
            otherMood = game.mood1
        }
        intro.replace(/\$player1/g,game.player1.name)
        intro.replace(/\$player2/g,game.player2.name)
        intro.replace(/\$self/g,self.name)
        intro.replace(/\$other/g,other.name)
        return { intro: intro,
                 verb: verb,
                 hintc: hintc,
                 hintd: hintd,
                 self: { mood: selfMood },
                 other: { name: other.name, mood: otherMood },
                 move: game.moves + 1 }
    },

    makeMove: function (info, gotOutcome, playerWaiting, error) {
        var game = moveInfo.game
        var role = moveInfo.role
        var moveNumber = moveInfo.moveNumber
        var move = moveInfo.move
        if (game.moves + 1 != moveNumber)
            error (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
        else {
            var oldSelfMove = role == 1 ? game.move1 : game.move2
            var otherMove = role == 1 ? game.move2 : game.move1
            if (oldSelfMove && oldSelfMove != move)
                error (new Error ("Player " + role + " can't choose '" + move + "' for move " + moveNumber + " in game " + game.id + " as they have already chosen '" + oldSelfMove + "'"))
            else {
                var update = {}
                update["move" + role] = move
                Game.update ( { id: game.id }, update, function (err, updated) {
                    if (err)
                        error (err)
                    else {
                        if (otherMove)
                            Choice.randomOutcome ({ choice: game.current,
                                                    move1: game.move1,
                                                    move2: game.move2 },
                                                  function (err, outcome) {
                                                      if (err)
                                                          error (err)
                                                      else {
                                                          var future = outcome.next
                                                          if (!outcome.flush)
                                                              future = future.concat (game.future)
                                                          // prepare a function to update the state of everything
                                                          var updateGame = function (currentChoiceID, futureChoiceNames) {
                                                              // update game state
                                                              Game.update ( { id: game.id },
                                                                            { move1: null,
                                                                              move2: null,
                                                                              moves: moveNumber,
                                                                              mood1: Outcome.mood1 (outcome),
                                                                              mood2: Outcome.mood2 (outcome),
                                                                              current: currentChoiceID,
                                                                              future: futureChoiceNames,
                                                                              finished: !currentChoiceID
                                                                            },
                                                                        function (err, updatedGame) {
                                                                            if (err)
                                                                                error (err)
                                                                            else {
                                                                                // update player
                                                                                Player.update ( { id: player.id },
                                                                                                { cash: player.cash + (role == 1 ? outcome.cash1 : outcome.cash2) },
                                                                                                function (err, updatedPlayer) {
                                                                                                    if (err)
                                                                                                        error (err)
                                                                                                    else {
                                                                                                        // update opponent
                                                                                                        Player.update ( { id: opponent.id },
                                                                                                                        { cash: opponent.cash + (role == 1 ? outcome.cash2 : outcome.cash1) },
                                                                                                                        function (err, updatedOpponent) {
                                                                                                                            if (err)
                                                                                                                                error (err)
                                                                                                                            else
                                                                                                                                gotOutcome (outcome, updatedGame, updatedPlayer, updatedOpponent)
                                                                                                                        })
                                                                                                    }
                                                                                                })
                                                                            }
                                                                        })
                                                          }
                                                          // find the ID of the next scene, if there is one
                                                          if (future.length)
                                                              Choice.findOne ({ name:future[0] }).exec (function (err, choice) {
                                                                  if (err)
                                                                      error (err)
                                                                  else
                                                                      updateGame (choice.id, future.slice(1))
                                                              })
                                                          else
                                                              updateGame (null, [])
                                                      }
                                                  })
                        else
                            playerWaiting()
                    }
                })
            }
        }
    },
};

