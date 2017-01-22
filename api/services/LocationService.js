// api/services/LocationService.js

function isArray (obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

module.exports = {

  itemInfoFields: ['visible','buy','sell','verb','markup','discount'],
  makeItemInfo (item, template) {
    var info = { item: item }
    LocationService.itemInfoFields.forEach (function (field) {
      info[field] = template[field]
    })
    return info
  },
  
  getItems: function (location, player) {
    var items = []
    location.items.forEach (function (it) {
      if (typeof(it) === 'string')
        it = { name: it }
      if (!LocationService.invisibleOrLocked(player,it)) {
        if (it.name in Item.itemByName)
          items.push (LocationService.makeItemInfo (Item.itemByName[it.name], it))
        else
          Item.itemByCategory[it.name].forEach (function (item) {
            items.push (LocationService.makeItemInfo (item, it))
          })
      }
    })

    return items.map (function (info) {
      var item = info.item
      function makePrice(p,markup,discount) {
        var price = {}
        if (typeof(p) !== 'object')
          price[Item.defaultCurrency] = p * (markup || 1) / (discount || 1)
        else
          Object.keys(p).forEach (function (unit) {
            price[unit] = p[unit] * (markup || 1) / (discount || 1)
          })
        return price
      }

      var buy, sell
      if (info.buy != false) {
        if (info.buy)
          buy = makePrice(info.buy)
        else if (item.buy)
          buy = makePrice(item.buy,info.markup)
        else if (info.sell && info.markup)
          buy = makePrice(info.sell,info.markup)
        else if (item.sell && info.markup)
          buy = makePrice(item.sell,info.markup / (info.discount || 1))
      }

      if (info.sell != false) {
        if (info.sell)
          sell = makePrice(info.sell)
        else if ((info.buy || item.buy) && (info.discount || item.discount))
          sell = makePrice(buy,info.discount || item.discount)
        else if (item.sell)
          sell = makePrice(item.sell)
      }

      return { name: item.name,
               icon: item.icon,
               color: item.color,
               noun: item.noun,
               hint: item.hint,
               buy: buy,
               sell: sell,
               verb: info.verb || item.verb,
               owned: player && player.global.inv[item.name] }
    })
  },

  getItemsByName: function (location, player) {
    var byName = {}
    LocationService.getItems (location, player).forEach (function (item) {
      byName[item.name] = item
    })
    return byName
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
            if (!item) {
              console.log (itemName)
              console.log (Item.itemByName)
            }
	    missing.push (Item.plural (cost[itemName], item))
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
      invisible = invisible || !PlayerService.evalPlayerExpr (player, obj.visible)
    if (obj.requires)
      invisible = invisible || LocationService.unaffordable (player, obj.requires)
    return invisible
  },

  locked: function (player, obj, ignoreCost) {
    var locked = false
    if (obj.locked)
      locked = locked || PlayerService.evalPlayerExpr (player, obj.locked)
    if (obj.cost && !ignoreCost)
      locked = locked || LocationService.unaffordable (player, obj.cost)
    return locked
  },

  invisibleOrLocked: function (player, obj, ignoreCost) {
    return LocationService.invisible(player,obj) || LocationService.locked(player,obj,ignoreCost)
  },

  trade: function (player, locationID, body, rs) {
    Location.findOne ({ id: locationID })
      .populate ('events')
      .exec (function (err, location) {
	if (err) rs(err)
	else if (!location) rs(new Error("Couldn't find location " + locationID))
        else if (LocationService.invisibleOrLocked(player,location)) rs(new Error("Location inaccessible: " + location.name))
	else {
          var itemName = body.name
          var itemCount = parseInt (body.count)
          var itemsByName = LocationService.getItemsByName (location, player)
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
            PlayerService.runWithLock
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
        else if (LocationService.invisibleOrLocked(player,location)) rs(new Error("Location inaccessible: " + location.name))
	else {
          function show() { LocationService.showLocation (player, location, rs) }
          if (location.checkpoint)
            Player.update ({ id: player.id },
                           { home: location.name },
                           show)
          else
            show()
        }
      })
  },

  showLocation: function (player, location, rs) {
    var links = location.links
      .map (function (link) { return typeof(link) === 'string' ? { to: link } : link })
      .filter (function (link) {
	return !LocationService.invisible (player, link)
      })
    Location.find ({ name: links.map (function (link) { return link.to }) })
      .exec (function (err, destLocations) {
	if (err) rs(err)
	else if (destLocations.length != links.length) rs("Couldn't find all Locations")
	else {
	  destLocations.forEach (function (loc, n) { links[n].location = loc })
	  links = links.filter (function (link) {
	    return !LocationService.invisible (player, link.location)
	  })
	  links.forEach (function (link) {
	    link.locked = LocationService.locked (player,link)
	      || LocationService.locked (player, link.location)
	  })

	  var events = location.events, eventById = {}
	  events.forEach (function (event) {
	    event.locked = LocationService.locked (player, event)
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
                        event.invited = true
			event.botDefaultTime = Event.botDefaultTime (event, invite.createdAt.getTime())
		      })

		      events = events.filter (function (event) {
			return event.game
			  || event.botDefaultTime
			  || !LocationService.invisible (player, event)
		      })

		      rs (null, {
			id: location.id,
			title: location.title,
			description: LocationService.expandText (location.description, player),
                        items: LocationService.getItems (location, player).map (function (item) {
			  item.buy = LocationService.costInfo (player, item.buy)
			  item.sell = LocationService.costInfo (null, item.sell)
			  return item
			}),
			links: links.map (function (link) {
			  return { id: link.location.id,
				   title: link.title || link.location.title,
				   hint: link.hint && LocationService.expandText (link.hint, player),
				   locked: link.locked,
				   cost: link.cost && LocationService.costInfo (player, link.cost) }
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
                                   hint: LocationService.expandText (event.hint, player),
                                   locked: event.locked,
                                   cost: event.cost && LocationService.costInfo (player, event.cost),
				   state: state,
                                   invited: event.invited,
                                   botDefault: event.botDefaultTime,
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
  },

  // based on old code from GameService that has now been cleaned up, leaving this ugly... ugh
  expandText: function (text, player, allowNonStringEvals) {
    if (!text)
      return []

    if (isArray(text)) {
      return text.map (function (t) {
        return LocationService.expandText (t, false)
      })
    } else if (typeof(text) == 'object') {
      var expanded
      if (text.expr)
        expanded = LocationService.expandTextString (text.expr, false, true)
      else
	expanded = {}
      Object.keys(text).forEach (function (key) {
	if (key == 'text' || typeof(text[key]) == 'object')
	  expanded[key] = LocationService.expandText (text[key], false)
	else if (!expanded.hasOwnProperty(key))
	  expanded[key] = text[key]
      })
      return expanded
    }

    return this.expandTextString (text, player, !allowNonStringEvals)
  },

  expandTextString: function (text, player, coerceToString, treatAsExpr) {
    var $g = player.global,
    $inv = $g.inv,
    $n = player.displayName,
    $h = player.human,
    $p = player,
    $id = player.id

    if (!coerceToString) {
      var expr
      if (treatAsExpr)
	expr = text
      else {
	// if entire string matches {{...}} then expand as an expression without coercing to string
	var braceRegex = /\s*\{\{(.*?)\}\}\s*/;
	var braceMatch = braceRegex.exec(text)
	if (braceMatch && braceMatch[0].length == text.length)
	  expr = braceMatch[1]
      }
      if (expr) {
        // entire text string matches pattern {{...}}, so eval the code inside without coercing result to a string
        var val = ''
        try {
          val = eval(expr)
        } catch (e) {
          // do nothing, ignore undefined values and other errors in eval()
        }
        return val
      }
    }
    
    return text
      .replace (/\{\{(.*?)\}\}/g, function (match, expr) {
        var val
        try {
          val = eval(expr)
        } catch (e) {
          sails.log.debug ("When evaluating: " + expr)
          sails.log.debug ("Error: " + e)
          // do nothing, ignore undefined values and other errors in eval()
        }
        return val && (typeof(val) === 'string' || typeof(val) === 'number') ? val : ''
      })
      .replace(/\$player/g,player.displayName)
      .replace(/\$self/g,player.displayName)
  },
}
