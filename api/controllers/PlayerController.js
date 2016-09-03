/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    findOrDie: function (req, res, makeJson) {
        Player.findById (req.params.player)
            .exec (function (err, players) {
                if (err)
                    res.status(500).send(err)
                else if (players.length != 1)
                    res.status(404).send("Player " + req.params.player + " not found")
                else
                    makeJson (players[0], function (err, json) {
                        if (err)
                            res.status(500).send(err)
                        else
                            res.json (json)
                    })
        })

    },

    games: function (req, res) {
        this.findOrDie (req, res, function (player, cb) {
            var games = player.player1games.concat (player.player2games)
            cb (null, games.map (function (game) {
                return { game: game.id }
            }))
        })
    },

    stats: function (req, res) {
        this.findOrDie (req, res, function (player, cb) {
            cb (null, { player: player.id,
                        name: player.name,
                        cash: player.cash })
        })
    },

    join: function (req, res) {
        this.findOrDie (req, res, function (player, cb) {
            Player
                .find ( { waiting: true,
                          id: { '!': player.id } } )
                .exec (function (err, eligibleOpponents) {
                    if (err)
                        cb (err)
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
                                        cb (err)
                                    else if (eligibleChoices.length == 0) {
                                        // for now, just bail if no eligible choice nodes are found
                                        // longer term, should remove opponent from eligibleOpponents list and retry
                                        cb (new Error ("No available root choices"))
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
                                                              cb (err)
                                                          else {
                                                              // update the 'waiting' fields
                                                              Player.update ( { where: { or: [ { id: player1id }, { id: player2id } ] } },
                                                                              { waiting: false },
                                                                              function (err, updated) {
                                                                                  if (err)
                                                                                      cb (err)
                                                                                  else {
                                                                                      // return game info
                                                                                      cb (null, { player: player.id,
                                                                                                  game: game.id,
                                                                                                  waiting: false })
                                                                                  }
                                                                              } )
                                                          }
                                                      })
                                    }
                                })

                        } else {  // no eligible opponents
                            // update the 'waiting' field
                            Player.update ( { id: player.id }, { waiting: true }, function (err, updated) {
                                if (err)
                                    cb (err)
                                else
                                    cb (null, { player: player.id,
                                                waiting: true })
                            })
                        }
                    }
                })
        })
    },

    cancelJoin: function (req, res) {
        this.findOrDie (req, res, function (player, cb) {
            // update the 'waiting' field
            Player.update ( { id: player.id }, { waiting: false }, function (err, updated) {
                if (err)
                    cb (err)
                else
                    cb (null, { player: player.id,
                                waiting: false })
            })
        })
    },

};

