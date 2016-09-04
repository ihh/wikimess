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

    expandText: function (text, playerNames, role) {
        var self, other
        if (role == 1) {
            self = playerNames[0]
            other = playerNames[1]
        } else {
            self = playerNames[1]
            other = playerNames[0]
        }
        return text.replace(/\$player1/g,playerNames[0])
            .replace(/\$player2/g,playerNames[1])
            .replace(/\$self/g,self)
            .replace(/\$other/g,other)
    },

    swapTextRoles: function (text) {
        return text.replace(/\$player1/g,"$TMP_PLAYER1")  // placeholder
            .replace(/\$player2/g,"$player1")
            .replace(/\$TMP_PLAYER1/g,"$player2")
    },
    
    forRole: function (game, role) {
        var intro, verb, hintc, hintd, self, other, selfMood, otherMood, waiting
        var current = game.current
        if (role == 1) {
            if (current) {
                intro = current.intro
                verb = current.verb
                hintc = current.hintc
                hintd = current.hintd
            }
            self = game.player1
            other = game.player2
            selfMood = game.mood1
            otherMood = game.mood2
            waiting = game.move1 ? true : false
        } else {  // role == 2
            if (current) {
                intro = current.intro2 || current.intro
                verb = current.verb2 || current.verb
                hintc = current.hintc2 || current.hintc
                hintd = current.hintd2 || current.hintd
            }
            self = game.player2
            other = game.player1
            selfMood = game.mood2
            otherMood = game.mood1
            waiting = game.move1 ? true : false
        }
        if (intro)
            intro = this.expandText (intro, [game.player1.name, game.player2.name], role)
        return { finished: game.finished,
                 waiting: waiting,
                 intro: intro,
                 verb: verb,
                 hintc: hintc,
                 hintd: hintd,
                 self: { mood: selfMood },
                 other: { name: other.name, mood: otherMood },
                 step: game.moves + 1 }
    },

    makeMove: function (info, gotOutcome, playerWaiting, error) {
        var game = info.game
        var role = info.role
        var moveNumber = info.moveNumber
        var move = info.move
        var player = role == 1 ? game.player1 : game.player2
        var opponent = role == 1 ? game.player2 : game.player1
        if (game.finished)
            error (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is finished"))
        else if (game.moves + 1 != moveNumber)
            error (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
        else {
            var oldPlayerMove = role == 1 ? game.move1 : game.move2
            var opponentMove = role == 1 ? game.move2 : game.move1
            if (oldPlayerMove && oldPlayerMove != move)
                error (new Error ("Player " + role + " can't choose '" + move + "' for move " + moveNumber + " in game " + game.id + " as they have already chosen '" + oldPlayerMove + "'"))
            else {
                var update = {}
                update["move" + role] = move
                Game.update ( { id: game.id }, update, function (err, updated) {
                    if (err)
                        error (err)
                    else {
                        if (opponentMove)
                            Choice.randomOutcome ({ choice: game.current.id,
                                                    move1: role == 1 ? move : opponentMove,
                                                    move2: role == 1 ? opponentMove : move },
                                                  function (err, outcome) {
                                                      if (err)
                                                          error (err)
                                                      else if (!outcome)
                                                          error (new Error ("No outcome found"))
                                                      else {
                                                          var future = outcome.next
                                                          if (!outcome.flush)
                                                              future = future.concat (game.future)
                                                          // prepare a function to update the state of everything
                                                          var updateGame = function (currentChoiceID, futureChoiceNames) {
                                                              // update game state
                                                              Game.update ( { id: game.id },
                                                                            { move1: undefined,
                                                                              move2: undefined,
                                                                              moves: moveNumber,
                                                                              mood1: Outcome.mood1 (outcome),
                                                                              mood2: Outcome.mood2 (outcome),
                                                                              current: currentChoiceID,
                                                                              future: futureChoiceNames,
                                                                              finished: currentChoiceID ? false : true
                                                                            },
                                                                        function (err, updatedGames) {
                                                                            if (err)
                                                                                error (err)
                                                                            else if (updatedGames.length != 1)
                                                                                error ("Couldn't update Game")
                                                                            else {
                                                                                // update player
                                                                                Player.update ( { id: player.id },
                                                                                                { cash: player.cash + (role == 1 ? outcome.cash1 : outcome.cash2) },
                                                                                                function (err, updatedPlayers) {
                                                                                                    if (err)
                                                                                                        error (err)
                                                                                                    else if (updatedPlayers.length != 1)
                                                                                                        error ("Couldn't update player")
                                                                                                    else {
                                                                                                        // update opponent
                                                                                                        Player.update ( { id: opponent.id },
                                                                                                                        { cash: opponent.cash + (role == 1 ? outcome.cash2 : outcome.cash1) },
                                                                                                                        function (err, updatedOpponents) {
                                                                                                                            if (err)
                                                                                                                                error (err)
                                                                                                                            else if (updatedOpponents.length != 1)
                                                                                                                                error ("Couldn't update opponent")
                                                                                                                            else
                                                                                                                                gotOutcome (outcome, updatedGames[0], updatedPlayers[0], updatedOpponents[0])
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

