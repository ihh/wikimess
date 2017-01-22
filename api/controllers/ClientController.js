/**
 * ClientController
 *
 * @description :: Server-side logic for client actions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var fs = require('fs')
var SkipperDisk = require('skipper-disk')
var imagemagick = require('imagemagick-native')
var extend = require('extend')
var md5File = require('md5-file')
var mkdirpSync = require('mkdirp').sync

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
          res.status(404).send ({error: "Player " + name + " not found"})
      })
  },

  // create Player
  createPlayer: function (req, res) {
    var name = req.body.name
    var password = req.body.password
    Player.find ({ name: name })
      .exec (function (err, players) {
        if (err)
          res.status(500).send (err)
        else if (players.length)
          res.status(400).send ({error: "A player named " + name + " already exists"})
        else
          Player.findOrCreate ({ name: name,
                                 password: password })
          .exec (function (err, player) {
            if (err)
              res.status(500).send (err)
            else if (!player)
              res.status(500).send ({error: "Player " + name + " not created"})
            else
              res.json ({ name: player.name, id: player.id })
          })
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
            var other = Game.getOtherRoleAttr (game, role, 'player')
	    return { id: game.event.id,
		     title: game.event.title,
		     hint: game.event.hint,
		     state: (game.finished
                             ? "finished"
                             : (waiting
                                ? "ready"
                                : "waiting")),
                     other: { id: other.id,
                              human: other.human,
                              name: other.displayName,
                              mood: Game.getOtherRoleAttr (game, role, 'mood') },
		     game: { id: game.id,
			     missed: Game.getRoleAttr (game, role, 'missed'),
			     deadline: Game.deadline (game) } }
	  }))
      })
  },

  // get player status
  selfStatus: function (req, res) {
    PlayerService.findPlayer (req, res, function (player, rs) {
      PlayerService.makeStatus ({ rs: rs,
                                  player: player,
                                  isPublic: false })
    })
  },

  otherStatus: function (req, res) {
    PlayerService.findOther (req, res, function (other, rs) {
      PlayerService.makeStatus ({ rs: rs,
                                  player: other,
                                  follower: req.params.player,
                                  isPublic: true })
    })
  },

  selfGameStatus: function (req, res) {
    PlayerService.findGame (req, res, function (info, rs) {
      PlayerService.makeStatus ({ rs: rs,
                                  game: info.game,
                                  player: info.player,
                                  local: info.role == 1 ? info.game.local1 : info.game.local2,
                                  isPublic: false })
    })
  },

  // get opponent game status
  otherGameStatus: function (req, res) {
    PlayerService.findGame (req, res, function (info, rs) {
      PlayerService.makeStatus ({ rs: rs,
                                  game: info.game,
                                  player: info.opponent,
                                  follower: info.player.id,
                                  local: info.role == 1 ? info.game.local2 : info.game.local1,
                                  isPublic: true })
    })
  },

  // join game
  join: function (req, res) {
    PlayerService.findEvent (req, res, function (player, event, rs) {
      InviteService
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
                     var playerRole = Game.getRole (game, player.id)
                     var playerEventInfo = { other: { id: opponent.id,
                                                      human: opponent.human,
                                                      name: opponent.displayName,
                                                      mood: Game.getOtherRoleAttr (game, playerRole, 'mood') } }
                     var opponentEventInfo = { other: { id: player.id,
                                                        human: player.human,
                                                        name: player.displayName,
                                                        mood: Game.getRoleAttr (game, playerRole, 'mood') } }
                     extend (playerEventInfo, eventInfo)
                     extend (opponentEventInfo, eventInfo)
		     var playerMsg = { message: "join",
				       player: player.id,
				       event: playerEventInfo,
				       waiting: false }
		     var opponentMsg = { message: "join",
					 player: opponent.id,
					 event: opponentEventInfo,
					 waiting: false }
		     if (req.isSocket)
		       Player.subscribe (req, [player.id])
		     Player.message (opponent.id, opponentMsg)
		     Player.message (player.id, playerMsg)
		     rs (null, playerMsg)
		   },
		   function (invite) {
		     // player is waiting
		     if (req.isSocket)
		       Player.subscribe (req, [player.id])
		     rs (null, { player: player.id,
				 waiting: true,
				 botDefault: Event.botDefaultTime (event, Date.now()) })
		   },
		   rs)
    })
  },

  // cancel a join
  cancelJoin: function (req, res) {
    var event = req.params.event
    PlayerService.findPlayer (req, res, function (player, rs) {
      // update the Invite table
      Invite.destroy ({ player: player.id, event: event })
	.exec (function (err) {
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
    PlayerService.findEvent (req, res, function (player, event, rs) {
      InviteService
	.joinGame ({ player: player,
		     event: event,
                     wantHuman: false },
		   function (opponent, game) {
                     // game started; return game info
	             var role = Game.getRole (game, player.id)
		     var eventInfo = { id: event.id,
				       title: event.title,
				       hint: event.hint,
				       state: game.finished ? "finished" : "ready",
				       game: { id: game.id,
					       deadline: Game.deadline(game) } }
                     var playerMsg = { message: "join",
                                       player: player.id,
				       event: eventInfo,
                                       other: { id: opponent.id,
                                                human: opponent.human,
                                                name: opponent.displayName,
                                                mood: Game.getOtherRoleAttr (game, role, 'mood') },
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

  // invite player to game
  invite: function (req, res) {
    PlayerService.findEvent (req, res, function (player, event, rs) {
      Player.findOne ({ id: req.params.other })
        .then (function (other) {
          // WRITE ME
        }).catch (rs)
      })
  },

  // reject invitation
  accept: function (req, res) {
    Game.find ({ player1: req.params.player,
                 player2: req.params.other,
                 event: req.params.event })
      .populate ('player1')
      .populate ('player2')
      .then (function (game) {
        // WRITE ME
      }).catch (function (err) {
        res.status(500).send (err)
      })
  },

  // reject invitation
  reject: function (req, res) {
    Game.find ({ player1: req.params.player,
                 player2: req.params.other,
                 event: req.params.event })
      .populate ('player1')
      .populate ('player2')
      .then (function (game) {
        // WRITE ME
      }).catch (function (err) {
        res.status(500).send (err)
      })
  },
  
  // current state of game, filtered for player
  gameInfo: function (req, res) {
    PlayerService.findGame (req, res, function (info, rs) {
      rs (null, GameService.forRole (info.game, info.role))
    })
  },

  // game history from a given move, filtered for player
  gameHistory: function (req, res) {
    var moveNumber = req.params.moveNumber || 0
    PlayerService.findGame (req, res, function (info, rs) {
      var json = GameService.forRole (info.game, info.role)
      Turn.find ({ game: info.game.id,
                   move: { '>=': moveNumber } })
        .exec (function (err, turns) {
          if (err)
            rs (err)
          else {
            var textAttr = Game.roleAttr (info.role, 'text')
            var moveAttr = Game.roleAttr (info.role, 'move')
	    var lastTurnByHuman = 0
            json.history = turns.map (function (turn, n) {
              var move = turn[moveAttr]
	      if (move && !move.bot)
		lastTurnByHuman = n
              return { moveNumber: turn.move,
		       move: move,
		       text: turn[textAttr],
		       self: { mood: Game.getRoleAttr(turn,info.role,'mood') },
		       other: { mood: Game.getOtherRoleAttr(turn,info.role,'mood') } }
            })
	    if (!req.params.moveNumber)
	      json.history = json.history.slice (lastTurnByHuman)
	    rs (null, json)
          }
        })
    })
  },

  // kick timed-out player
  kickTimedOutPlayers: function (req, res) {
    var moveNumber = req.params.moveNumber
    PlayerService.findGame (req, res, function (info, rs) {
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
	  var update = {}, turnUpdate = {}
	  timedOutRoles.forEach (function (timedOutRole) {
	    var timedOutPlayer = Game.getRoleAttr (game, timedOutRole, 'player')
	    var moveAttr = Game.roleAttr(timedOutRole,'move')
	    var text = Game.getRoleAttr(game,timedOutRole,'text')
	    update[moveAttr] = turnUpdate[moveAttr] = BotService.randomMove (text)
	  })
	  GameService.recordMove ({ game: game,
				    moveNumber: moveNumber,
				    update: update,
				    turnUpdate: turnUpdate },
				  function (updatedGame, updatedPlayer1, updatedPlayer2) {
				    PlayerService
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
    PlayerService.findGame (req, res, function (info, rs) {
      info.moveNumber = moveNumber
      info.move = move
      PlayerService.makeMove (req, rs, info)
    })
  },

  // subscribe to socket for next move update
  listenForMove: function (req, res) {
    var moveNumber = req.params.moveNumber
    var move = req.params.move
    PlayerService.findGame (req, res, function (info, rs) {
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
    PlayerService.findGame (req, res, function (info, rs) {
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
    PlayerService.findGame (req, res, function (info, rs) {
      info.moveNumber = moveNumber
      PlayerService.quitGame (req, rs, info)
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
          res.status(404).send ({error: "Player " + name + " not found"})
        else {
          var imagePath = '/images/avatars/' + playerID
	  var playerImageDir = process.cwd() + '/assets' + imagePath
	  var tmpPlayerImageDir = process.cwd() + '/.tmp/public' + imagePath

	  if (!fs.existsSync(playerImageDir))
	    mkdirpSync(playerImageDir)

	  if (!fs.existsSync(tmpPlayerImageDir))
	    mkdirpSync(tmpPlayerImageDir)

	  if (PlayerService.isValidMood (mood))
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
          res.status(404).send ({error: "Player " + playerID + " not found"})
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
          res.status(404).send ({error: "Player " + name + " not found"})
        else
          res.ok()
      })
  },

  // view a Location
  viewLocation: function (req, res) {
    PlayerService.findPlayer (req, res, function (player, rs) {
      if (req.isSocket)
	Player.subscribe (req, [player.id])
      LocationService.getLocation (player, { id: req.params.location }, rs)
    })
  },

  // view home Location
  viewHome: function (req, res) {
    PlayerService.findPlayer (req, res, function (player, rs) {
      if (req.isSocket)
	Player.subscribe (req, [player.id])
      LocationService.getLocation (player, { name: player.home }, rs)
    })
  },

  // buy or sell
  trade: function (req, res) {
    PlayerService.findPlayer (req, res, function (player, rs) {
      LocationService.trade (player, req.params.location, req.body, rs)
    })
  },

  // list followers
  listFollowed: function (req, res) {
    var playerID = req.params.player
    var result = { id: playerID }
    var following = {}
    function makeInfo (player) {
      return { id: player.id,
               human: true,
               name: player.displayName,
               mood: player.initialMood,
               following: following[player.id] }
    }
    Follow.find ({ follower: playerID })
      .populate ('followed')
      .then (function (follows) {
        result.followed = follows.map (function (follow) {
          following[follow.followed.id] = true
          return makeInfo (follow.followed)
        })
        return Follow.find ({ followed: playerID })
          .populate ('follower')
      }).then (function (followed) {
        result.followers = followed.map (function (follow) {
          return makeInfo (follow.follower)
        })
        return Game.find()
          .where ({ or: [ { player1: playerID },
			  { player2: playerID } ] })
          .sort ('updatedAt DESC')
          .populate ('player1')
          .populate ('player2')
          .limit (10) // last 10 Games...
      }).then (function (games) {
        var seen = {}, recent = []
        seen[playerID] = true
        function addPlayer (player) {
          if (player.human && !seen[player.id]) {
            recent.push (makeInfo (player))
            seen[player.id] = true
          }
        }
        games.forEach (function (game) {
          addPlayer (game.player1)
          addPlayer (game.player2)
        })
        result.recent = recent
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // add follower
  follow: function (req, res) {
    if (req.params.player != req.params.other)  // don't let someone follow themselves
      PlayerService.findPlayer (req, res, function (player, rs) {
        PlayerService.findOther (req, res, function (other, rs) {
          var newFollow = { follower: player.id,
                            followed: other.id }
          Follow.findOrCreate (newFollow)
            .exec (function (err, follow) {
              if (err)
                rs(err)
              else
                rs(null,newFollow)
            })
        })
      })
  },

  // remove follower
  unfollow: function (req, res) {
    Follow.destroy ({ follower: req.params.player,
                      followed: req.params.other })
      .exec (function (err, deleted) {
        if (err)
          res.status(500).send(err)
        else if (deleted.length)
          res.ok()
        else
          res.status(404).send ({error: "Player " + req.params.player + " does not follow player " + req.params.other})
      })
  }

};
