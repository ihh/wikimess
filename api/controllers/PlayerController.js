/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    responseSender: function (res) {
        return function (err, json) {
            if (err)
                res.status(500).send(err)
            else
                res.json (json)
        }
    },

    findPlayer: function (req, res, makeJson, assocs) {
        var rs = this.responseSender (res)
        var query = Player.findById (req.params.player)
        if (assocs)
            assocs.forEach (function (assoc) {
                query.populate (assoc)
            })
        query.exec (function (err, players) {
                if (err)
                    rs(err)
                else if (players.length != 1)
                    res.status(404).send("Player " + req.params.player + " not found")
                else
                    makeJson (players[0], rs)
        })
    },

    findGame: function (req, res, makeJson) {
        var rs = this.responseSender (res)
        this.findPlayer (req, res, function (player, cb) {
            Game.findById (req.params.game)
                .populate('current')
                .populate('player1')
                .populate('player2')
                .exec (function (err, games) {
                    if (err)
                        rs(err)
                    else if (games.length != 1)
                        res.status(404).send("Game " + req.params.game + " not found")
                    else {
                        var game = games[0]
                        var role = game.player1.id == player.id ? 1 : (game.player2.id == player.id ? 2 : null)
                        if (!role)
                            res.status(401).send("Player " + player.id + " has no role in game " + game.id)
                        else
                            makeJson ( { player: player,
                                         game: game,
                                         role: role },
                                       rs )
                    }
                })
        })
    },

    games: function (req, res) {
        this.findPlayer (req, res, function (player, rs) {
            var games = player.player1games.concat (player.player2games)
            rs (null, games.map (function (game) {
                return { game: game.id }
            }))
        }, ['player1games', 'player2games'])
    },

    stats: function (req, res) {
        this.findPlayer (req, res, function (player, rs) {
            rs (null, { player: player.id,
                        name: player.name,
                        cash: player.cash })
        })
    },

    join: function (req, res) {
        this.findPlayer (req, res, function (player, rs) {
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
                                        rs (err)
                                    else if (eligibleChoices.length == 0) {
                                        // for now, just bail if no eligible choice nodes are found
                                        // longer term, should remove opponent from eligibleOpponents list and retry
                                        rs (new Error ("No available root choices"))
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
                                                              rs (err)
                                                          else {
                                                              // update the 'waiting' fields
                                                              Player.update ( { where: { or: [ { id: player1id }, { id: player2id } ] } },
                                                                              { waiting: false },
                                                                              function (err, updated) {
                                                                                  if (err)
                                                                                      rs (err)
                                                                                  else {
                                                                                      // return game info
                                                                                      var playerMsg = { player: player.id,
                                                                                                        game: game.id,
                                                                                                        waiting: false }
                                                                                      var opponentMsg = { player: opponent.id,
                                                                                                          game: game.id,
                                                                                                          waiting: false }
                                                                                      if (req.isSocket)
                                                                                          Player.subscribe (req, [player.id])
                                                                                      Player.message (opponent.id, opponentMsg)
                                                                                      Player.message (player.id, playerMsg)
                                                                                      rs (null, playerMsg)
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
                                    rs (err)
                                else {
                                    if (req.isSocket)
                                        Player.subscribe (req, [player.id])
                                    rs (null, { player: player.id,
                                                waiting: true })
                                }
                            })
                        }
                    }
                })
        })
    },

    cancelJoin: function (req, res) {
        this.findPlayer (req, res, function (player, rs) {
            // update the 'waiting' field
            Player.update ( { id: player.id }, { waiting: false }, function (err, updated) {
                if (err)
                    rs (err)
                else {
                    Player.message (player.id, { player: player.id,
                                                 waiting: false,
                                                 canceled: true })
                    rs (null, { player: player.id,
                                waiting: false })
                }
            })
        })
    },

    gameInfo: function (req, res) {
        this.findGame (req, res, function (info, rs) {
            rs (null, Game.roleFilter (info.game, info.role))
        })
    },

};

