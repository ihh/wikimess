/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var fs = require('fs');
var SkipperDisk = require('skipper-disk');
var imagemagick = require('imagemagick-native');
var extend = require('extend');
var md5File = require('md5-file');

module.exports = {

    // actions
    // convert player name to ID
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

    // get a player's games
    games: function (req, res) {
	var playerID = req.params.player
	Game.find ({ where: { or: [ { player1: playerID, quit1: false },
				    { player2: playerID, quit2: false } ] } })
	    .populate ('player1')
	    .populate ('player2')
	    .populate ('event')
	    .populate ('current')
	    .exec (function (err, games) {
                if (err)
                    res.status(500).send (err)
		else
		    res.json (games.map (function (game) {
			var role = Game.getRole (game, playerID)
			var waiting = Game.isWaitingForMove(game,role)
			return { id: game.event.id,
				 title: game.event.title,
				 hint: game.event.hint,
				 state: (game.finished
                                         ? "finished"
                                         : (waiting
                                            ? "ready"
                                            : "waiting")),
				 game: { id: game.id,
					 missed: Game.getRoleAttr (game, role, 'missed'),
					 deadline: Game.deadline (game) } }
		    }))
	    })
    },

    // get player game status
    selfGameStatus: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info) {
            MiscPlayerService.makeStatus (res,
                                          info.game,
                                          info.player,
                                          info.role == 1 ? info.game.local1 : info.game.local2,
                                          'self')
        })
    },

    // get opponent game status
    otherGameStatus: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info) {
            MiscPlayerService.makeStatus (res,
                                          info.game,
                                          info.opponent,
                                          info.role == 1 ? info.game.local2 : info.game.local1,
                                          'other')
        })
    },

    // join game
    join: function (req, res) {
        MiscPlayerService.findEvent (req, res, function (player, event, rs) {
	    PlayerMatchService
		.joinGame ({ player: player,
			     event: event,
			     wantHuman: true },
			   function (opponent, game) {
			       // game started; return game info
			       sails.log.debug ("Sending join messages to players #" + player.id + " and #" + opponent.id)
			       var eventInfo = { id: event.id,
						 title: event.title,
						 hint: event.hint,
						 state: game.finished ? "finished" : "ready",
						 game: { id: game.id,
							 deadline: Game.deadline(game) } }
			       var playerMsg = { message: "join",
						 player: player.id,
						 event: eventInfo,
						 waiting: false }
			       var opponentMsg = { message: "join",
						   player: opponent.id,
						   event: eventInfo,
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
					   event: event.id,
					   waiting: true,
					   invited: new Date (Date.now() + 1000*event.wait) })
			   },
			   rs)
	})
    },

    // cancel a join
    cancelJoin: function (req, res) {
	var event = req.params.event
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            // update the Invite table
	    Invite.destroy ({ player: player.id, event: event })
		.exec (function (err) {
                    if (err)
			rs (err)
                    else {
			rs (null, { player: player.id,
				    event: event,
                                    waiting: false })
                    }
		})
        })
    },

    // start a game with a bot
    joinBot: function (req, res) {
        MiscPlayerService.findEvent (req, res, function (player, event, rs) {
            PlayerMatchService
		.joinGame ({ player: player,
			     event: event,
                             wantHuman: false },
			   function (opponent, game) {
                               // game started; return game info
			       var eventInfo = { id: event.id,
						 title: event.title,
						 hint: event.hint,
						 state: game.finished ? "finished" : "ready",
						 game: { id: game.id,
							 deadline: Game.deadline(game) } }
                               var playerMsg = { message: "join",
                                                 player: player.id,
						 event: eventInfo,
                                                 waiting: false }
                               if (req.isSocket)
                                   Player.subscribe (req, [player.id])
                               Player.message (player.id, playerMsg)
                               rs (null, playerMsg)
                           },
                           function() { },
                           rs)
        })
    },

    // current state of game, filtered for player
    gameInfo: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    rs (null, GameService.forRole (info.game, info.role))
        })
    },

    // game history from a given move, filtered for player
    gameHistory: function (req, res) {
	var moveNumber = req.params.moveNumber || 0
        MiscPlayerService.findGame (req, res, function (info, rs) {
            var json = GameService.forRole (info.game, info.role)
            Turn.find ({ game: info.game.id,
                         move: { '>=': req.params.moveNumber } })
                .exec (function (err, turns) {
                    if (err)
                        rs (err)
                    else {
                        var textAttr = Game.roleAttr (info.role, 'text')
                        var actionsAttr = Game.roleAttr (info.role, 'actions')
			var lastTurnWithActions = 0
                        json.history = turns.map (function (turn, n) {
                            var actions = turn[actionsAttr]
			    if (actions && Object.keys(actions).length)
				lastTurnWithActions = n
                            return { move: turn.move,
				     text: turn[textAttr],
				     actions: actions,
				     self: { mood: Game.getRoleAttr(turn,info.role,'mood') },
				     other: { mood: Game.getOtherRoleAttr(turn,info.role,'mood') } }
                        })
			if (!req.params.moveNumber)
			    json.history = json.history.splice (lastTurnWithActions)
	                rs (null, json)
                    }
                })
        })
    },

    // kick timed-out player
    kickTimedOutPlayers: function (req, res) {
	var moveNumber = req.params.moveNumber
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    var game = info.game
            if (game.finished)
		rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is finished"))
            else if (game.moves + 1 != moveNumber)
		rs (new Error ("Can't make move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
            else {
		var timedOutRoles = Game.timedOutRoles (game)
//		console.log("timedOutRoles")
//		console.log(timedOutRoles)
//		console.log(game)
//		console.log(Game.isTimedOut(game))
		if (timedOutRoles.length) {
		    var update = {}
		    timedOutRoles.forEach (function (timedOutRole) {
			var timedOutPlayer = Game.getRoleAttr (game, timedOutRole, 'player')
			update[Game.roleAttr(timedOutRole,'move')] = Game.getRoleAttr(game,timedOutRole,'defaultMove')
		    })
		    GameService.recordMove ({ game: game,
					      moveNumber: moveNumber,
					      update: update },
					    function (updatedGame, updatedPlayer1, updatedPlayer2) {
						MiscPlayerService
						    .sendMoveMessages ({ message: "timeout",
									 game: updatedGame,
									 moveNumber: moveNumber })
						rs (null, { game: game.id,
							    move: game.moves + 1,
							    kicked: timedOutRoles.map (function (role) {
								return Game.getRoleAttr(game,role,'player').id
							    }) })
					    },
					    function() {
						// player waiting callback
						// this should rarely (never?) be reached after a kick, since both players should have already moved.
						rs (new Error ("Player kick failed"))
					    },
					    rs)
		} else
		    rs (null, { game: game.id,
				move: game.moves + 1,
				kicked: []
			      })
	    }
        })
    },

    // make a move
    makeMove: function (req, res) {
        var moveNumber = req.params.moveNumber
        var move = req.body.move
	var actions = req.body.actions
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    info.moveNumber = moveNumber
	    info.move = move
	    info.actions = actions
	    MiscPlayerService.makeMove (req, rs, info)
	})
    },

    // subscribe to socket for next move update
    listenForMove: function (req, res) {
        var moveNumber = req.params.moveNumber
        var move = req.params.move
        MiscPlayerService.findGame (req, res, function (info, rs) {
            var player = info.player
            var game = info.game
            // waiting for opponent to move
            if (req.isSocket)
                Player.subscribe (req, [player.id])
            rs (null, { game: game.id,
                        move: moveNumber,
                        choice: { self: move },
                        waiting: true })
        })
    },

    // change player's current mood in the game
    changeMood: function (req, res) {
        var moveNumber = req.params.moveNumber
        var newMood = req.params.mood
        MiscPlayerService.findGame (req, res, function (info, rs) {
            var player = info.player
            var opponent = info.opponent
            var game = info.game
            var role = info.role
            GameService
                .updateMood ( { game: game,
                                role: role,
                                moveNumber: moveNumber,
                                mood: newMood },
                              function (updated) {
                                  var time = new Date()
                                  Player.message (opponent.id,
                                                  { message: "mood",
                                                    game: game.id,
                                                    move: moveNumber,
                                                    time: time,
                                                    other: { id: player.id,
							     mood: newMood },
                                                  })
                                  rs (null, { game: game.id,
                                              move: moveNumber,
                                              time: time,
                                              self: { mood: newMood } })
                              },
                              rs)
        })
    },

    // quit a game
    quitGame: function (req, res) {
        var moveNumber = req.params.moveNumber
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    info.moveNumber = moveNumber
	    MiscPlayerService.quitGame (req, rs, info)
	})
    },

    // Upload avatar for player
    uploadMoodAvatar: function (req, res) {
	var playerID = req.params.player
	var mood = req.params.mood
        Player.findOneById (playerID)
            .exec (function (err, player) {
                if (err)
                    res.status(500).send (err)
                else if (!player)
                    res.status(404).send (new Error ("Player " + name + " not found"))
                else {
                    var imagePath = '/images/avatars/' + playerID
	            var playerImageDir = process.cwd() + '/assets' + imagePath
	            var tmpPlayerImageDir = process.cwd() + '/.tmp/public' + imagePath

	            if (!fs.existsSync(playerImageDir))
	                fs.mkdirSync(playerImageDir)

	            if (!fs.existsSync(tmpPlayerImageDir))
	                fs.mkdirSync(tmpPlayerImageDir)

	            if (MiscPlayerService.isValidMood (mood))
	                req.file('avatar').upload
	            ( { maxBytes: 10000000,   // don't allow the total upload size to exceed ~10MB
	                dirname : process.cwd() + '/assets' + imagePath },
	              function (err, uploadedFiles) {
                          if (err) return res.send(500, err);

	                  // If no files were uploaded, respond with an error.
	                  if (uploadedFiles.length === 0){
		              return res.badRequest('No file was uploaded');
	                  }
                          
	                  // get ready to move some files around
                          var filename = uploadedFiles[0].fd.substring(uploadedFiles[0].fd.lastIndexOf('/')+1);
                          var uploadLocation = playerImageDir + '/' + filename;
                          var convertedUploadLocation = playerImageDir + '/' + filename + '.conv';

	                  // convert the file to the appropriate size using ImageMagick
	                  fs.writeFileSync (convertedUploadLocation, imagemagick.convert({
		              srcData: fs.readFileSync (uploadLocation),
		              format: 'JPEG',
		              strip: true,
		              blur: .05,
		              quality: 75,
		              width: 128,
		              height: 128
	                  }));
                          
	                  // remove the originally uploaded file
	                  fs.unlinkSync (uploadLocation)

                          // use MD5 to create new unique filename
                          var hash = md5File.sync (convertedUploadLocation)
	                  var targetFilename = hash + '.jpg'
	                  var targetLocation = playerImageDir + '/' + targetFilename;
                          var tempLocation = tmpPlayerImageDir + '/' + targetFilename;

                          // Move the converted file to the correct location
                          fs.renameSync (convertedUploadLocation, targetLocation)

                          // Copy the file to the temp folder so that it becomes available immediately
                          fs.createReadStream(targetLocation).pipe(fs.createWriteStream(tempLocation));
                          
                          // Modify avatar config
                          player.avatarConfig[mood].url = imagePath + '/' + targetFilename
                          Player.update ({ id: playerID },
                                         { avatarConfig: player.avatarConfig,
                                           newSignUp: false },
                                         function (err, updated) {
                                             if (err)
                                                 res.status(500).send(err)
                                             else
                                                 res.json (player.avatarConfig)
                                         })
                      });
                }
            })
    },

    // Download mood avatar config for player
    getMoodAvatarConfig: function (req, res) {
	var playerID = req.params.player
        Player.findOneById (playerID)
            .exec (function (err, player) {
                if (err)
                    res.status(500).send (err)
                else if (!player)
                    res.status(404).send (new Error ("Player " + playerID + " not found"))
                else
                    res.json (player.avatarConfig)
            })
    },

    // Upload mood avatar config for player
    putMoodAvatarConfig: function (req, res) {
	var playerID = req.params.player
        var config = req.body.avatarConfig
        Player.update ({ id: playerID },
                       { avatarConfig: config,
                         newSignUp: false })
            .exec (function (err, player) {
                if (err)
                    res.status(500).send (err)
                else if (!player)
                    res.status(404).send (new Error ("Player " + name + " not found"))
                else
                    res.ok()
            })
    },

    // view a Location
    viewLocation: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
	    if (req.isSocket)
		Player.subscribe (req, [player.id])
	    MiscPlayerService.getLocation (player, { id: req.params.location }, rs)
	})
    },

    // view home Location
    viewHome: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
	    if (req.isSocket)
		Player.subscribe (req, [player.id])
	    MiscPlayerService.getLocation (player, { name: player.global.home }, rs)
	})
    },
};
