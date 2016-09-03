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
                    res.json (makeJson (players[0]))
        })

    },

    games: function (req, res) {
        this.findOrDie (req, res, function (player) {
            var games = player.player1games.concat (player.player2games)
            return games.map (function (game) {
                return { game: game.id }
            })
        })
    },

    stats: function (req, res) {
        this.findOrDie (req, res, function (player) {
            return { player: player.id,
                     name: player.name,
                     cash: player.cash }
        })
    }
};

