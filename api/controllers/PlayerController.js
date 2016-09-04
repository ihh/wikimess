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
                .populate ('player1')
                .populate ('player2')
                .populate ('current')
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
                        else {
                            var opponent = role == 1 ? game.player2 : game.player1
                            makeJson ( { player: player,
                                         opponent: opponent,
                                         game: game,
                                         role: role },
                                       rs )
                        }
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
            Player.joinGame (player,
                             function (opponent, game) {
                                 // game started; return game info
                                 var playerMsg = { verb: "join",
                                                   player: player.id,
                                                   game: game.id,
                                                   waiting: false }
                                 var opponentMsg = { verb: "join",
                                                     player: opponent.id,
                                                     game: game.id,
                                                     waiting: false }
                                 if (req.isSocket)
                                     Player.subscribe (req, [player.id])
                                 Player.message (opponent.id, opponentMsg)
                                 Player.message (player.id, playerMsg)
                                 rs (null, playerMsg)
                             },
                             function() {
                                 // player is waiting
                                 if (req.isSocket)
                                     Player.subscribe (req, [player.id])
                                 rs (null, { player: player.id,
                                             waiting: true })
                             },
                             rs)
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
            rs (null, Game.forRole (info.game, info.role))
        })
    },

    makeMove: function (req, res) {
        var moveNumber = req.params.moveNumber
        var move = req.params.move
        this.findGame (req, res, function (info, rs) {
            var player = info.player
            var opponent = info.opponent
            var game = info.game
            var role = info.role
            Game.makeMove ({ game: game,
                             role: role,
                             moveNumber: moveNumber,
                             move: move },
                           function (outcome, updatedGame, updatedPlayer, updatedOpponent) {
                               // both players moved; return outcome
                               var playerMsg = { verb: "move",
                                                 game: game.id,
                                                 step: moveNumber,
                                                 move: { self: move,
                                                         other: role == 1 ? outcome.move2 : outcome.move1 },
                                                 waiting: false,
                                                 outcome: Outcome.forRole (game, outcome, role),
                                                 cash: updatedPlayer.cash }
                               var opponentMsg = { verb: "move",
                                                   game: game.id,
                                                   step: moveNumber,
                                                   move: { self: role == 1 ? outcome.move2 : outcome.move1,
                                                           other: move },
                                                   waiting: false,
                                                   outcome: Outcome.forRole (game, outcome, role == 1 ? 2 : 1),
                                                   cash: updatedOpponent.cash }
                               if (req.isSocket)
                                   Player.subscribe (req, [player.id])
                               Player.message (opponent.id, opponentMsg)
                               Player.message (player.id, playerMsg)
                               rs (null, playerMsg)
                           },
                           function() {
                               // waiting for opponent to move
                               if (req.isSocket)
                                   Player.subscribe (req, [player.id])
                               rs (null, { game: game.id,
                                           step: moveNumber,
                                           move: { self: move },
                                           waiting: true })
                           },
                           rs)
        })
    },

};

