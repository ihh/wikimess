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

    makeMove: function (req, rs, info) {
        var moveNumber = info.moveNumber
        var move = info.move
        var player = info.player
        var opponent = info.opponent
        var game = info.game
        var role = info.role
//	console.log('makeMove')
//	console.log(info)

        if (game.finished)
            rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is finished"))
        else if (game.moves + 1 != moveNumber)
            rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
        else {
            var oldPlayerMove = role == 1 ? game.move1 : game.move2
            var opponentMove = role == 1 ? game.move2 : game.move1
            if (oldPlayerMove != 'none' && oldPlayerMove != move)
                rs (new Error ("Player " + role + " can't choose '" + move + "' for move " + moveNumber + " in game " + game.id + " as they have already chosen '" + oldPlayerMove + "'"))
            else {

                var update = {}
		var moveAttr = "move" + role
                update[moveAttr] = move

		GameService
		    .recordMove ({ game: game,
				   moveNumber: moveNumber,
				   update: update },
				 function (outcome, updatedGame, updatedPlayer1, updatedPlayer2) {
				     var updatedPlayer, updatedOpponent
				     if (role == 1) {
					 updatedPlayer = updatedPlayer1
					 updatedOpponent = updatedPlayer2
				     } else {
					 updatedPlayer = updatedPlayer2
					 updatedOpponent = updatedPlayer1
				     }
/*
				     console.log('recordMove callback')
				     console.log(outcome)
				     console.log(updatedGame)
				     console.log(updatedPlayer)
				     console.log(updatedOpponent)
*/
				     // both players moved; return outcome
				     if (req.isSocket)
					 Player.subscribe (req, [player.id])
				     MiscPlayerService
					 .sendMoveMessages ({ message: "move",
							      game: game,
							      moveNumber: moveNumber,
							      outcome: outcome })
				     rs (null, { game: game.id,
						 move: moveNumber,
						 choice: { self: move },
						 waiting: false })
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
	    }
	}
    },

    sendMoveMessages: function (info) {
	var game = info.game
	var moveNumber = info.moveNumber
	var message = info.message
	var outcome = info.outcome
	var roles = [1,2]
	roles.forEach (function (role) {
	    var msg = { message: message,
			game: game.id,
			move: moveNumber,
			outcome: Outcome.forRole (game, outcome, role) }
	    var playerID = Game.getRoleAttr(game,role,'player').id
	    Player.message (playerID, msg)
	    sails.log.debug ("Sending message " + JSON.stringify(msg) + " to player #" + playerID)
	})
    },
}
