// api/services/PlayerService.js

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
    var rs = PlayerService.responseSender (res)
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
    PlayerService.findPlayer (req, res, function (player, rs) {
      Event.findOneById (req.params.event)
	.exec (function (err, event) {
	  if (err) rs(err)
	  else if (!event) rs(new Error("Couldn't find Event"))
	  else if (LocationService.invisibleOrLocked (player, event, true))
	    rs(new Error ("Event locked"))
	  else
	    makeJson (player, event, rs)
	})
    })
  },

  findGame: function (req, res, makeJson) {
    var rs = PlayerService.responseSender (res)
    PlayerService.findPlayer (req, res, function (player, cb) {
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
//	      sails.log.debug("Player " + player.displayName + " (id " + player.id + ") has role " + role)
//	      sails.log.debug("Player1=" + game.player1.displayName + " Player2=" + game.player2.displayName)
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
  
  capitalize: function (text) {
    return text.charAt(0).toUpperCase() + text.substr(1)
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

    Meter.meters.forEach (function (attr) {
      elements.Attributes.push ({ type: 'meter',
				  level: state[attr.name] || 0,
				  min: attr.min,
				  max: attr.max,
				  label: attr.label || attr.name })
    })

    Item.items.forEach (function (item) {
      if ((item.public || !isPublic)
	  && (state.inv[item.name] || item.alwaysShow))
	elements.Inventory.push ({ type: 'icon',
				   icon: item.icon,
                                   color: item.color,
				   label: PlayerService.capitalize (Item.plural (state.inv[item.name] || 0, item)) })
    })

    Award.awards.forEach (function (accomp) {
      if ((accomp.public || !isPublic)
	  && state[accomp.name]
	  && accomp.icon)
	elements.Accomplishments.push ({ type: 'icon',
				         icon: accomp.icon,
                                         color: accomp.color,
				         label: accomp.label || accomp.name })
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
    var player = info.player
    var opponent = info.opponent
    var game = info.game
    var role = info.role
    //	console.log('makeMove')
    //	console.log(info)

    if (SchemaService.validateMove (move, rs)) {
      if (game.finished)
	rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is finished"))
      else if (game.moves + 1 != moveNumber)
	rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
      else {
	var oldPlayerMove = role == 1 ? game.move1 : game.move2
	var opponentMove = role == 1 ? game.move2 : game.move1
	if (oldPlayerMove !== null && !GameService.objectsEqual(oldPlayerMove,move))
          rs (new Error ("Player " + role + " can't choose '" + move + "' for move " + moveNumber + " in game " + game.id + " as they have already chosen '" + oldPlayerMove + "'"))
	else {

          var gameUpdate = {}, turnUpdate = {}
	  var moveAttr = Game.roleAttr(role,'move')
          gameUpdate[moveAttr] = turnUpdate[moveAttr] = move

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
			   PlayerService
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
    $inv = player.global.inv,
    $n = player.displayName,
    $h = player.human,
    $p = player,
    $id = player.id

    var $go, $invo, $no, $ho, $po, $ido
    if (opponent) {
      $go = opponent.global
      $invo = opponent.global.inv
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
}
