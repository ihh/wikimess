// api/services/MiscPlayerService.js

var fs = require('fs');
var extend = require('extend');
var merge = require('deepmerge');

// Uncomment to show line numbers on console.log messages
// https://remysharp.com/2014/05/23/where-is-that-console-log
/*
['log', 'warn'].forEach(function(method) {
  var old = console[method];
  console[method] = function() {
    var stack = (new Error()).stack.split(/\n/);
    // Chrome includes a single "Error" line, FF doesn't.
    if (stack[0].indexOf('Error') === 0) {
      stack = stack.slice(1);
    }
    var args = [].slice.apply(arguments).concat([stack[1].trim()]);
    return old.apply(console, args);
  };
});
*/

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
		    else if (MiscPlayerService.invisibleOrLocked (player, event, true))
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
                .populate ('event')
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

    unaffordable: function (player, cost) {
	var unaffordable = undefined
	if (cost) {
	    var missing = []
	    Object.keys(cost).forEach (function(itemName) {
		if (!unaffordable) {
		    var owned = player.global.inv[itemName] || 0
		    if (owned < cost[itemName]) {
			var item = Item.itemByName[itemName]
			missing.push (MiscPlayerService.plural (cost[itemName] - owned,
								item))
		    }
		}
	    })
	    if (missing.length) {
		if (missing.length > 1)
		    unaffordable = missing.slice(0,missing.length-1).join(", ") + " and " + missing[missing.length-1]
		else 
		    unaffordable = missing[0]
		unaffordable = 'You need ' + unaffordable + ' to unlock this.'
	    }
	}
	return unaffordable
    },

    deductCost: function (player, cost) {
	Object.keys(cost).forEach (function(itemName) {
	    player.global.inv[itemName] -= cost[itemName]
	})
    },

    costInfo: function (player, cost) {
        if (!cost) return undefined
        return Object.keys(cost).map (function (itemName) {
            var item = Item.itemByName[itemName]
            var amount = cost[itemName]
            return { name: itemName,
                     amount: amount,
                     icon: item.icon,
                     noun: item.noun,
                     color: item.color,
		     affordable: (player ? ((player.global.inv[itemName] || 0) >= amount) : undefined)
		   }
        })
    },

    invisible: function (player, obj) {
	var invisible = false
	if (obj.visible)
	    invisible = invisible || !MiscPlayerService.evalPlayerExpr (player, obj.visible)
	if (obj.required)
	    invisible = invisible || MiscPlayerService.unaffordable (player, obj.required)
	return invisible
    },

    locked: function (player, obj, ignoreCost) {
	var locked = false
	if (obj.locked)
	    locked = locked || MiscPlayerService.evalPlayerExpr (player, obj.locked)
	if (obj.cost && !ignoreCost)
	    locked = locked || MiscPlayerService.unaffordable (player, obj.cost)
	return locked
    },

    invisibleOrLocked: function (player, obj, ignoreCost) {
	return MiscPlayerService.invisible(player,obj) || MiscPlayerService.locked(player,obj,ignoreCost)
    },

    isValidMood: function (mood) {
	return mood == 'happy' || mood == 'sad' || mood == 'angry' || mood == 'surprised'
    },
        
    plural: function(n,item) {
        plural = item.pluralNoun || (item.noun + 's')
        n = typeof(n) === 'undefined' ? 0 : n
        return (n != 1 ? n : (item.article || (/^[aeiou]/i.test(item.noun) ? 'an' : 'a'))) + ' ' + (n == 1 ? item.noun : plural)
    },

    makeStatus: function (info) {
	var rs = info.rs, game = info.game, player = info.player, local = info.local, isPublic = info.isPublic
	var state = {}
	if (game)
	    extend (state, game.common)
	extend (state, player.global)
        if (local)
	    state = merge (state, local)

	var elements = { Attributes: [], Inventory: [], Accomplishments: [] }

	DataService.attribute.forEach (function (attr) {
	    elements.Attributes.push ({ type: 'meter',
				        level: state[attr.name] || 0,
				        min: attr.min,
				        max: attr.max,
				        label: attr.label })
	})

	Item.items.forEach (function (item) {
	    if ((item.public || !isPublic)
		&& (state.inv[item.name] || item.alwaysShow))
		elements.Inventory.push ({ type: 'icon',
				           icon: item.icon,
                                           color: item.color,
				           label: MiscPlayerService.plural (state.inv[item.name] || 0,
									    item) })
	})

	DataService.accomplishment.forEach (function (accomp) {
	    if ((accomp.public || !isPublic)
		&& (state[accomp.name] || accomp.alwaysShow))
		elements.Accomplishments.push ({ type: 'icon',
				                 icon: accomp.icon,
                                                 color: accomp.color,
				                 label: accomp.label })
	})

        var status = { element: [] };
        ['Attributes','Inventory','Accomplishments'].forEach (function (key) {
            if (elements[key].length)
                status.element.push ({ type: 'div', element: [{ type: 'header', label: key }].concat (elements[key]) })
        })

	rs (null, status)
    },

    quitGame: function (req, rs, info) {
        var moveNumber = info.moveNumber
        var player = info.player
        var game = info.game
        var role = info.role
        if (!game.finished)
            rs (new Error ("Can't quit game " + game.id + " since game is not finished"))
        else if (game.moves + 1 != moveNumber)
            rs (new Error ("Can't quit at move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
        else {
	    var update = {}
	    update[Game.roleAttr(role,'quit')] = true
	    Game.update ({ id: game.id },
			 update,
			 function (err, updated) {
			     if (err) rs(err)
			     else
				 rs (null, { game: game.id,
					     quit: true })
			 })
	}
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
			event: game.event.id,
			move: moveNumber,
			missed: Game.getRoleAttr(game,role,'missed'),
			finished: game.finished,
			nextDeadline: Game.deadline(game) }
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
		 else if (unlockedPlayers.length != playerIdList.length)
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

    trade: function (player, locationID, body, rs) {
	Location.findOne ({ id: locationID })
	    .populate ('events')
	    .exec (function (err, location) {
		if (err) rs(err)
		else if (!location) rs(new Error("Couldn't find location " + locationID))
                else if (MiscPlayerService.invisibleOrLocked(player,location)) rs(new Error("Location inaccessible: " + location.name))
		else {
                    var itemName = body.name
                    var itemCount = parseInt (body.count)
                    var itemsByName = Location.getItemsByName (location, player)
                    var item = itemsByName[itemName]
                    if (!item) rs(new Error("Couldn't find item " + itemName + " in location " + location.name))
                    else {
                        var tradeVerb = itemCount < 0 ? 'sell' : 'buy'
                        var price = item[tradeVerb]
                        if (!price) rs(new Error("Couldn't " + tradeVerb + " item " + itemName + " in location " + location.name))
                        var invDelta = {}
                        invDelta[itemName] = (invDelta[itemName] || 0) + itemCount
                        Object.keys(price).forEach (function (unit) {
                            invDelta[unit] = (invDelta[unit] || 0) - itemCount * price[unit]
                        })
                        MiscPlayerService.runWithLock
                        ( [ player.id ],
                          function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
                              var gotPrice = true, updatedInv = {}
                              Object.keys(invDelta).forEach (function (unit) {
                                  if ((updatedInv[unit] = player.global.inv[unit] = ((player.global.inv[unit] || 0) + invDelta[unit])) < 0)
                                      gotPrice = false
                              })
                              if (!gotPrice)
                                  lockedSuccess (null)
                              else
                                  Player.update ({ id: player.id },
                                                 { global: player.global },
                                                 function (err, updated) {
                                                     if (err) lockedError(err)
                                                     else lockedSuccess(updatedInv)
                                                 })
                          },
                          function (updatedInv) {
                              if (updatedInv)
                                  rs (null, { success: true, inv: updatedInv })
                              else
                                  rs (null, { success: false })
                          },
                          function (err) { rs (err) })
                    }
                }
            })
    },
    
    getLocation: function (player, locationQuery, rs) {
	Location.findOne (locationQuery)
	    .populate ('events')
	    .exec (function (err, location) {
		if (err) rs(err)
		else if (!location) rs(new Error("Couldn't find location " + JSON.stringify(locationQuery)))
                else if (MiscPlayerService.invisibleOrLocked(player,location)) rs(new Error("Location inaccessible: " + location.name))
		else {
		    var links = location.link.filter (function (link) {
			return !MiscPlayerService.invisible (player, link)
		    })
		    Location.find ({ name: links.map (function (link) { return link.to }) })
			.exec (function (err, destLocations) {
			    if (err) rs(err)
			    else if (destLocations.length != links.length) rs("Couldn't find all Locations")
			    else {
				destLocations.forEach (function (loc, n) { links[n].location = loc })
				links = links.filter (function (link) {
				    return !MiscPlayerService.invisible (player, link.location)
				})
				links.forEach (function (link) {
				    link.locked = MiscPlayerService.locked (player,link)
					|| MiscPlayerService.locked (player, link.location)
				})

				var events = location.events, eventById = {}
				events.forEach (function (event) {
				    event.locked = MiscPlayerService.locked (player, event)
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
						var role = Game.getRole (game, player.id)
						var event = eventById[game.event]
						if (Game.getRoleAttr (game,role,'quit')) {
						    if (event.resetAllowed) {
							var resetTime = Game.resetTime (game, event)
							if (now < resetTime)
							    event.resetTime = resetTime
						    } else
							event.visible = false
						} else
						    event.game = { id: game.id,
								   finished: game.finished,
								   waiting: Game.isWaitingForMove(game,role),
								   missed: Game.getRoleAttr(game,role,'missed'),
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
							    var event = eventById[invite.event]
							    event.invited = new Date (invite.createdAt.getTime() + 1000*event.wait)
							})

							events = events.filter (function (event) {
							    return event.game
								|| event.invited
								|| !MiscPlayerService.invisible (player, event)
							})

							rs (null, {
							    id: location.id,
							    title: location.title,
							    description: location.description,
                                                            items: Location.getItems (location, player).map (function (item) {
								item.buy = MiscPlayerService.costInfo (player, item.buy)
								item.sell = MiscPlayerService.costInfo (null, item.sell)
								return item
							    }),
							    links: links.map (function (link) {
								return { id: link.location.id,
									 title: link.location.title,
									 hint: link.hint,
									 locked: link.locked,
									 cost: link.cost && MiscPlayerService.costInfo (player, link.cost) }
							    }),
							    events: events.map (function (event) {
								var state = (event.game
									     ? (event.game.finished
                                                                                ? "finished"
                                                                                : (event.game.waiting
                                                                                   ? "ready"
                                                                                   : "waiting"))
									     : (event.invited
										? "starting"
										: (event.locked
                                                                                   ? "locked"
                                                                                   : (event.resetTime
										      ? "resetting"
										      : "start"))))
								return { id: event.id,
									 title: event.title,
                                                                         hint: event.hint,
                                                                         locked: event.locked,
                                                                         cost: event.cost && MiscPlayerService.costInfo (player, event.cost),
									 state: state,
                                                                         invited: event.invited,
									 reset: event.resetTime,
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
