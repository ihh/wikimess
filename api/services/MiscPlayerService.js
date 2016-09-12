// api/services/MiscPlayerService.js

var fs = require('fs');
var extend = require('extend');
var merge = require('deepmerge');

module.exports = {

    // helpers
    responseSender: function (res) {
        return function (err, json) {
            if (err) {
                console.log (err)
                res.send (500, err)
            } else
                res.json (json)
        }
    },

    findPlayer: function (req, res, makeJson, assocs) {
        var rs = MiscPlayerService.responseSender (res)
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
        var rs = MiscPlayerService.responseSender (res)
        MiscPlayerService.findPlayer (req, res, function (player, cb) {
            Game.findById (req.params.game)
                .populate ('player1')
                .populate ('player2')
                .populate ('current')
                .populate ('lastOutcome')
                .exec (function (err, games) {
                    if (err)
                        rs(err)
                    else if (games.length != 1)
                        res.status(404).send("Game " + req.params.game + " not found")
                    else {
                        var game = games[0]
                        var role = Game.getRole (game, player.id)
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

    isValidMood: function (mood) {
	return mood == 'happy' || mood == 'sad' || mood == 'angry' || mood == 'surprised'
    },

    makeStatus: function (res, player, local, view) {
	var state = {}
	extend (state, player.global)
	state = merge (state, local)

	var iconPrefix = '/images/icons/'
        var iconPath = process.cwd() + '/assets' + iconPrefix
        var iconSuffix = '.svg'

        var icon = function(name,text,color,bgColor) {
            var svg = fs.readFileSync (iconPath + name + iconSuffix, 'utf8')
            if (color)
                svg = svg.replace(/"#fff"/g, color)
            if (bgColor)
                svg = svg.replace(/"#000"/g, bgColor)
            return '<p>'
                + '<span class="icon">' + svg + '</span>'
                + '<span class="text">' + text + '</span>'
        }

        var plural = function(n,singular,plural) {
            plural = plural || (singular + 's')
            n = typeof(n) === 'undefined' ? 0 : n
            return n + ' ' + (n == 1 ? singular : plural)
        }
        
        res.view ('status/' + view,
                  { name: player.name,
		    state: state,
		    global: player.global,
		    local: local,
		    icon: icon,
                    plural: plural,
                    layout: 'status/layout' })
    },

    randomMove: function (player, game) {
	var role = Game.getRole (game, player.id)
	var mood = Game.getRoleAttr (game, role, 'mood')
	switch (player.botmind.strategy) {
	case 'mood':
	    return Math.random() < player.botmind.probc[mood] ? 'c' : 'd'
	    break;
	default:
	    break;
	}
	return 'd'
    },

    makeMove: function (req, rs, info) {
        var moveNumber = info.moveNumber
        var move = info.move
        var player = info.player
        var opponent = info.opponent
        var game = info.game
        var role = info.role
	console.log('makeMove')
	console.log(info)
        GameService
            .recordMove ({ game: game,
                           role: role,
                           moveNumber: moveNumber,
                           move: move },
                         function (outcome, updatedGame, updatedPlayer, updatedOpponent) {
			     console.log('recordMove callback')
			     console.log(updatedGame)
			     console.log(updatedPlayer)
			     console.log(updatedOpponent)
                             // both players moved; return outcome
                             var playerMsg = { message: info.playerMessage,
                                               game: game.id,
                                               finished: updatedGame.finished ? true : false,
                                               move: moveNumber,
                                               choice: { self: move,
                                                         other: role == 1 ? outcome.move2 : outcome.move1 },
                                               waiting: false,
                                               outcome: Outcome.forRole (game, outcome, role),
                                               self: { cash: updatedPlayer.cash } }
                             var opponentMsg = { message: info.opponentMessage,
                                                 game: game.id,
                                                 finished: updatedGame.finished ? true : false,
                                                 move: moveNumber,
                                                 choice: { self: role == 1 ? outcome.move2 : outcome.move1,
                                                           other: move },
                                                 waiting: false,
                                                 outcome: Outcome.forRole (game, outcome, role == 1 ? 2 : 1),
                                                 self: { cash: updatedOpponent.cash } }
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
    },
}
