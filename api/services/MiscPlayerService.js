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

    findEvent: function (req, res, makeJson) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
	    Event.findOneById (req.params.event)
		.exec (function (err, event) {
		    if (err) rs(err)
		    else if (!event) rs(new Error("Couldn't find Event"))
		    else if (MiscPlayerService.eventInvisibleOrLocked (player, event))
			rs(new Error ("Event locked"))
		    else
			makeJson (player, event, rs)
		})
	})
    },

    findGame: function (req, res, makeJson) {
        var rs = MiscPlayerService.responseSender (res)
        MiscPlayerService.findPlayer (req, res, function (player, cb) {
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

    eventInvisibleOrLocked: function (player, event) {
	return (event.visible && !MiscPlayerService.evalPlayerExpr (player, event.visible))
	    || (event.locked && MiscPlayerService.evalPlayerExpr (player, event.locked))
    },

    isValidMood: function (mood) {
	return mood == 'happy' || mood == 'sad' || mood == 'angry' || mood == 'surprised'
    },

    makeStatus: function (res, game, player, local, view) {
	var state = {}
	extend (state, game.common)
	extend (state, player.global)
	state = merge (state, local)

	var iconPrefix = '/images/icons/'
        var iconPath = process.cwd() + '/assets' + iconPrefix
        var iconSuffix = '.svg'

        var icon = function(name,text,color,bgColor) {
	    var path = '/icon/' + name
	    if (bgColor && !color)
		color = 'white'
            if (color) {
		path = path + '/' + color
		if (bgColor)
                    path = path + '/' + bgColor
	    }
            return '<div class="statusline">'
                + '<span class="icon"><img src="' + path + '"></img></span>'
                + '<span class="text">' + text + '</span>'
		+ '</div>'
        }

        // meter(label,level)
        // meter(label,level,color)
        // meter(label,level,max,color)
        // meter(label,level,min,max,color)
        var meter = function(label,level,min,max,color) {
            if (typeof(min) === 'undefined') {
                color = 'blue'
                max = 1
                min = 0
            } else if (typeof(max) === 'undefined') {
                color = min
                max = 1
                min = 0
            } else if (typeof(color) === 'undefined') {
                color = max
                max = min
                min = 0
            }
            return '<div class="meterline">'
                  + '<div class="meterlabel">'
                   + '<div class="metertext">' + label + '</div>'
                   + '<div class="meternumber">(' + Math.round(level) + '/' + Math.round(max) + ')</div>'
                  + '</div>'
                  + '<div class="meter '+color+'">'
                   + '<span style="width:' + (100*level/max) + '%;"></span>'
                  + '</div>'
                 + '</div>'
        }
        
        var plural = function(n,singular,plural) {
            plural = plural || (singular + 's')
            n = typeof(n) === 'undefined' ? 0 : n
            return n + ' ' + (n == 1 ? singular : plural)
        }
        
        res.view ('status/' + view,
                  { // locals
                      name: player.displayName,
		      state: state,
		      global: player.global,
		      local: local,
                      common: game.common,
                      // functions
		      icon: icon,
                      meter: meter,
                      plural: plural,
                      // layout
                      layout: 'status/layout' })
    },

    makeMove: function (req, rs, info) {
        var moveNumber = info.moveNumber
        var move = info.move
	var actions = info.actions
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
            if (oldPlayerMove != '' && oldPlayerMove != move)
                rs (new Error ("Player " + role + " can't choose '" + move + "' for move " + moveNumber + " in game " + game.id + " as they have already chosen '" + oldPlayerMove + "'"))
            else {

                var gameUpdate = {}, turnUpdate = {}
		var moveAttr = "move" + role
		var actionsAttr = "actions" + role
                gameUpdate[moveAttr] = turnUpdate[moveAttr] = move
		turnUpdate[actionsAttr] = actions

		GameService
		    .recordMove ({ game: game,
				   moveNumber: moveNumber,
				   update: gameUpdate,
				   turnUpdate: turnUpdate },
				 function (updatedGame, updatedPlayer1, updatedPlayer2) {
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
							      moveNumber: moveNumber })
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
	var roles = [1,2]
	roles.forEach (function (role) {
	    var msg = { message: message,
			game: game.id,
			move: moveNumber }
	    var playerID = Game.getRoleAttr(game,role,'player').id
	    Player.message (playerID, msg)
	    sails.log.debug ("Sending message " + JSON.stringify(msg) + " to player #" + playerID)
	})
    },

    // this locking mechanism is pretty crude --
    // e.g. currently it's up to lockedCallback to check if its own lock has expired.
    // Waterline lacks native support for database transactions, which makes it a bit tough to guarantee consistency...
    runWithLock: function (playerIdList, lockedCallback, success, error) {
	var maxLockDurationInSeconds = 5
	var maxLockDurationInMilliseconds = 1000*maxLockDurationInSeconds
	var mostRecentBreakableLockTime = Date.now() - maxLockDurationInMilliseconds
	var currentTime = Date.now()
        var currentDate = new Date(currentTime)
        var lockExpiryTime = currentTime + maxLockDurationInMilliseconds

	function unlockPlayers (callback) {
	    Player.update
	    ({ id: playerIdList },
	     { lastLockTime: 0 },
	     function (err, unlockedPlayers) {
		 if (err)
		     error (err)
		 else if (unlockedPlayers.length != 2)
		     error (new Error ("Couldn't unlock Players"))
		 else {
	             sails.log.debug ("Released lock for players (" + playerIdList.join(',') + ") from time " + currentDate + "; lock active for " + (Date.now() - currentTime) + "ms")
		     callback()
                 }
	     })
	}

        function unlockSuccess (result) {
            unlockPlayers (function() {
                success (result)
            })
        }

	function unlockError (err) {
	    unlockPlayers (function() {
		error (err)
	    })
	}

        Player.update
	({ id: playerIdList,
	   lastLockTime: { '<=': mostRecentBreakableLockTime } },
	 { lastLockTime: currentTime },
	 function (err, lockedPlayers) {
	     if (err)
		 error (err)
	     else if (lockedPlayers.length != playerIdList.length)
		 error (new Error ("Couldn't lock Players"))
	     else {
	         sails.log.debug ("Obtained lock for players (" + playerIdList.join(',') + ") at time " + currentDate)
                 lockedCallback (unlockSuccess, unlockError, lockExpiryTime, maxLockDurationInMilliseconds)
             }
         })
    },

    // evalPlayerExpr (player, opponent, expr)
    // evalPlayerExpr (player, expr)
    evalPlayerExpr: function (player, opponent, expr) {
	if (typeof(expr) === 'undefined') {
	    expr = opponent
	    opponent = undefined
	}

        var $g = player.global,
            $n = player.displayName,
	    $h = player.human,
	    $p = player,
            $id = player.id

	var $go, $no, $ho, $po, $ido
	if (opponent) {
	    $go = opponent.global
            $no = opponent.displayName
	    $ho = opponent.human
	    $po = opponent
            $ido = opponent.id
	}

        // handle negation as a special case; if anything is undefined in the negation return true
        var negRegex = /^\s*\!\s*\((.*)\)\s*$/;
        var negMatch = negRegex.exec (expr)
        var func, val
        if (negMatch) {
            expr = negMatch[1]
            func = function(w) { return !w }
        } else {
            func = function(w) { return w }
        }

        try {
            val = eval(expr)
        } catch (e) {
            // do nothing, ignore undefined values and other errors in eval()
        }

        return func (val)
    },

    getLocation: function (player, locationQuery, rs) {
	Location.findOne (locationQuery)
	    .populate ('events')
	    .exec (function (err, location) {
		if (err) rs(err)
		else if (!location) rs(new Error("Couldn't find location " + locationID))
		else {
		    var links = location.link.filter (function (link) {
			return typeof(link.visible) === 'undefined'
			    || MiscPlayerService.evalPlayerExpr (player, link.visible)
		    })
		    Location.find ({ name: links.map (function (link) { return link.to }) })
			.exec (function (err, destLocations) {
			    if (err) rs(err)
			    else if (destLocations.length != links.length) rs("Couldn't find all Locations")
			    else {
				destLocations.forEach (function (loc, n) { links[n].location = loc })
				links = links.filter (function (link) {
				    return typeof(location.visible) === 'undefined'
					|| MiscPlayerService.evalPlayerExpr (player, location.visible)
				})
				links.forEach (function (link) {
				    if (link.locked)
					link.locked = MiscPlayerService.evalPlayerExpr (player, link.locked)
				    else if (link.location.locked)
					link.locked = MiscPlayerService.evalPlayerExpr (player, link.location.locked)
				})

				var events = location.events, eventById = {}
				events = events.filter (function (event) {
				    return typeof(event.visible) === 'undefined'
					|| MiscPlayerService.evalPlayerExpr (player, event.visible)
				})
				events.forEach (function (event) {
				    if (event.locked)
					event.locked = MiscPlayerService.evalPlayerExpr (player, event.locked)
				    eventById[event.id] = event
				})
				var eventIds = events.map (function (event) { return event.id })
				Game.find ({ where: { or: [{ player1: player.id },
							   { player2: player.id }],
						      event: eventIds },
					     sort: 'createdAt' })
                                    .populate ('current')
				    .exec (function (err, games) {
					if (err) rs(err)
					else {
					    var now = new Date()
					    games.forEach (function (game) {
						eventById[game.event].game = { id: game.id,
                                                                               finished: game.finished,
									       running: Game.runningTime(game),
									       dormant: Game.dormantTime(game),
                                                                               deadline: Game.deadline(game) }
					    })
					    Invite.find ({ event: eventIds,
							   player: player.id })
						.exec (function (err, invites) {
						    if (err) rs(err)
						    else {
							invites.forEach (function (invite) {
							    eventById[invite.event].invited = new Date (invite.createdAt)
							})
							rs (null, {
							    id: location.id,
							    title: location.title,
							    description: location.description,
							    links: links.map (function (link) {
								return { id: link.location.id,
									 title: link.location.title,
									 hint: link.hint,
									 locked: link.locked }
							    }),
							    events: events.map (function (event) {
								var state = (event.game
									     ? (event.game.finished
                                                                                ? "finished"
                                                                                : (Game.isWaitingForMove(event.game,Game.getRole(event.game,player.id))
                                                                                   ? "waiting"
                                                                                   : "ready"))
									     : (event.invited
										? "starting"
										: (event.locked
                                                                                   ? "locked"
                                                                                   : "start")))
								return { id: event.id,
									 title: event.title,
                                                                         hint: event.hint,
                                                                         locked: event.locked,
									 state: state,
									 waiting: (event.invited && !event.game
										   ? parseInt ((now - event.invited) / 1000)
										   : undefined),
									 game: event.game }
							    })
							})
						    }
						})
					}
				    })
			    }
			})
		}
	    })
    },
}
