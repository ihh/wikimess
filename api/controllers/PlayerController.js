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
	Game.find ({ where: { or: [ { player1: playerID }, { player2: playerID } ] } })
	    .populate ('player1')
	    .populate ('player2')
	    .exec (function (err, games) {
                if (err)
                    res.status(500).send (err)
		else
		    res.json (games.map (function (game) {
			var role = Game.getRole (game, playerID)
			var now = new Date(), created = new Date(game.createdAt), updated = new Date(game.updatedAt)
			return { game: game.id,
				 finished: game.finished,
				 running: parseInt ((now - created) / 1000),
				 dormant: parseInt ((now - updated) / 1000),
				 other: { name: (role == 1 ? game.player2 : game.player1).name },
				 waiting: Game.isWaitingForMove (game, role) }
		    }))
	    })
    },

    // get player game status
    selfGameStatus: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info) {
            MiscPlayerService.makeStatus (res,
                                          info.player,
                                          info.role == 1 ? info.game.local1 : info.game.local2,
                                          'self')
        })
    },

    // get opponent game status
    otherGameStatus: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info) {
            MiscPlayerService.makeStatus (res,
                                          info.opponent,
                                          info.role == 1 ? info.game.local2 : info.game.local1,
                                          'other')
        })
    },

    // join game
    join: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            PlayerMatchService
		.joinGame ({ player: player,
                             wantHuman: true },
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

    // cancel a join
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

    // start a game with a bot
    joinBot: function (req, res) {
        MiscPlayerService.findPlayer (req, res, function (player, rs) {
            PlayerMatchService
		.joinGame ({ player: player,
                             wantHuman: false },
			   function (opponent, game) {
                               // game started; return game info
                               var playerMsg = { message: "join",
                                                 player: player.id,
                                                 game: game.id,
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
	    rs (null, Game.forRole (info.game, info.role))
        })
    },

    // kick timed-out player
    kickTimedOutPlayers: function (req, res) {
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    var timedOutRoles = Game.timedOutRoles (info.game)
	    console.log("timedOutRoles")
	    console.log(timedOutRoles)
	    var update = {}
	    timedOutRoles.forEach (function (timedOutRole) {
		var timedOutPlayer = Game.getRoleAttr (info.game, timedOutRole, 'player')
		update[Game.roleAttr(timedOutRole,'move')]
		    = MiscPlayerService.randomMove (timedOutPlayer, info.game)
	    })
	    var moveNumber = info.game.moves + 1
	    GameService.recordMove ({ game: info.game,
				      moveNumber: moveNumber,
				      update: update },
				    function (outcome, updatedGame, updatedPlayer1, updatedPlayer2) {
					MiscPlayerService
					    .sendMoveMessages ({ message: "timeout",
								 game: updatedGame,
								 move: moveNumber,
								 outcome: outcome })
					rs (null, { game: info.game.id,
						    move: info.game.moves + 1,
						    kicked: timedOutRoles.map (function (role) {
							return Game.getRoleAttr(info.game,role,'player').id
						    }) })
				    },
				    function() {
					// player waiting callback
					rs (new Error ("Player kick failed"))
				    },
				    rs)
        })
    },

    // make a move
    makeMove: function (req, res) {
        var moveNumber = req.params.moveNumber
        var move = req.params.move
        MiscPlayerService.findGame (req, res, function (info, rs) {
	    info.moveNumber = moveNumber
	    info.move = move
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
                                  Player.message (opponent.id,
                                                  { message: "mood",
                                                    game: game.id,
                                                    move: moveNumber,
                                                    other: { id: player.id,
							     mood: newMood },
                                                  })
                                  rs (null, { game: game.id,
                                              move: moveNumber,
                                              self: { mood: newMood } })
                              },
                              rs)
        })
    },

    // Upload avatar for player
    uploadMoodAvatar: function (req, res) {
	var playerID = req.params.player
	var mood = req.params.mood
	var imagePath = '/images/avatars/' + playerID
	var playerImageDir = process.cwd() + '/assets' + imagePath
	var tmpPlayerImageDir = process.cwd() + '/.tmp/public' + imagePath
	var targetFilename = mood + '.png'

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
	      var targetLocation = playerImageDir + '/' + targetFilename;
              var tempLocation = tmpPlayerImageDir + '/' + targetFilename;

	      // convert the file to the appropriate size using ImageMagick
	      fs.writeFileSync (targetLocation, imagemagick.convert({
		  srcData: fs.readFileSync (uploadLocation),
		  format: 'PNG',
		  width: 298,
		  height: 298
	      }));

	      // remove the uploaded file
	      fs.unlinkSync (uploadLocation)

              // Copy the file to the temp folder so that it becomes available immediately
              fs.createReadStream(targetLocation).pipe(fs.createWriteStream(tempLocation));
              
              //Redirect or do something
              res.json ({'url': imagePath + '/' + mood + '.png' });
          });

    },
    
    // Download mood avatar of player
    getMoodAvatar: function (req, res){
	var playerID = req.params.player
	var mood = req.params.mood
	var imageDir = '/images/avatars/' + playerID
	var genericImageDir = '/images/avatars/generic'

	if (MiscPlayerService.isValidMood (mood))
            Player.findOneById (playerID)
            .exec (function (err, player) {
                if (err)
                    res.status(500).send (err)
                else if (!player)
                    res.status(404).send (new Error ("Player " + name + " not found"))
                else {
		    var path = process.cwd() + '/assets' + genericImageDir + '/' + mood + '.png'
		    try {
			var testPath = process.cwd() + '/assets' + imageDir + '/' + mood + '.png'
			var stats = fs.lstatSync (testPath);
			if (stats.isFile())
			    path = testPath
		    } catch (e) {
			// couldn't find custom avatar
			// fall through to using generic avatar
		    }

		    // Stream the file down
		    var fileAdapter = SkipperDisk();
		    fileAdapter.read(path)
			.on('error', function (err){
			    return res.serverError(err);
			})
			.pipe(res);
		}
	    })
	else
            res.status(400).send (new Error ("Bad mood"))
    },

};

