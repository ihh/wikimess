/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    // actions
    byName: function (req, res) {
        var name = req.params.name
        Player.findOneByName (name)
            .exec (function (err, player) {
                if (err)
                    res.status(500).send (err)
                else if (player)
                    res.json ({ id: player.id })
                else
                    res.status(404).send (new Error ("Player " + name + " not found"))
            })
    },

    games: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            var g1 = player.player1games.map (function (game) {
                return { game: game.id,
                         finished: game.finished,
                         waiting: game.move1 ? true : false }
            })
            var g2 = player.player2games.map (function (game) {
                return { game: game.id,
                         finished: game.finished,
                         waiting: game.move2 ? true : false }
            })
            rs (null, g1.concat(g2))
        }, ['player1games', 'player2games'])
    },

    stats: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            rs (null, { player: player.id,
                        name: player.name,
                        cash: player.cash })
        })
    },

    join: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            PlayerMatchService
		.joinGame (player,
			   function (opponent, game) {
                               // game started; return game info
                               var playerMsg = { message: "join",
                                                 player: player.id,
                                                 game: game.id,
                                                 waiting: false }
                               var opponentMsg = { message: "join",
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
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            // update the 'waiting' field
            Player.update ( { id: player.id }, { waiting: false }, function (err, updated) {
                if (err)
                    rs (err)
                else {
                    rs (null, { player: player.id,
                                waiting: false })
                }
            })
        })
    },

    gameInfo: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info, rs) {
            rs (null, Game.forRole (info.game, info.role))
        })
    },

    makeMove: function (req, res) {
        var moveNumber = req.params.moveNumber
        var move = req.params.move
        MiscPlayerService.findGame (req, res, function (info, rs) {
            var player = info.player
            var opponent = info.opponent
            var game = info.game
            var role = info.role
            Game.recordMove ({ game: game,
                               role: role,
                               moveNumber: moveNumber,
                               move: move },
                             function (outcome, updatedGame, updatedPlayer, updatedOpponent) {
                                 // both players moved; return outcome
                                 var playerMsg = { message: "move",
                                                   game: game.id,
                                                   finished: updatedGame.finished ? true : false,
                                                   move: moveNumber,
                                                   choice: { self: move,
                                                             other: role == 1 ? outcome.move2 : outcome.move1 },
                                                   waiting: false,
                                                   outcome: Outcome.forRole (game, outcome, role),
                                                   cash: updatedPlayer.cash }
                                 var opponentMsg = { message: "move",
                                                     game: game.id,
                                                     finished: updatedGame.finished ? true : false,
                                                     move: moveNumber,
                                                     choice: { self: role == 1 ? outcome.move2 : outcome.move1,
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
                                             move: moveNumber,
                                             choice: { self: move },
                                             waiting: true })
                             },
                             rs)
        })
    },

    changeMood: function (req, res) {
        var moveNumber = req.params.moveNumber
        var newMood = req.params.mood
        MiscPlayerService.findGame (req, res, function (info, rs) {
            var player = info.player
            var opponent = info.opponent
            var game = info.game
            var role = info.role
            Game.updateMood ( { game: game,
                                role: role,
                                moveNumber: moveNumber,
                                mood: newMood },
                              function (updated) {
                                  Player.message (opponent.id,
                                                  { message: "mood",
                                                    game: game.id,
                                                    move: moveNumber,
                                                    other: { mood: newMood },
                                                  })
                                  rs (null, { game: game.id,
                                              move: moveNumber,
                                              self: { mood: newMood } })
                              },
                              rs)
        })
    },

};

