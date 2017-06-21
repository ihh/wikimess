/**
 * ClientController
 *
 * @description :: Server-side logic for client actions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

  // actions
  // convert player name to ID
  byName: function (req, res) {
    var name = req.body.name
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

  // search Players
  searchDisplayName: function (req, res) {
    var searcherID = req.params.player, query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = 3
    Player.find ({ displayName: { contains: query },
                   id: { '!': searcherID },
		   admin: false,
		   human: true })
      .limit(resultsPerPage + 1)
      .skip(resultsPerPage * page)
      .then (function (players) {
	return Follow.find ({ follower: searcherID,
                              followed: players.map (function (player) { return player.id }) })
	  .then (function (follows) {
	    var following = {}
            follows.forEach (function (follow) {
              following[follow.followed] = true
            })
	    res.json ({ page: page,
                        more: players.length > resultsPerPage,
                        results: players.slice(0,resultsPerPage).map (function (player) {
	      return PlayerService.makePlayerSummary (player, following[player.id])
	    })
		      })
	  })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send (err)
      })
	},

  // configure Player info
  configurePlayer: function (req, res) {
    var update = { displayName: req.body.displayName }
    Player.update ({ id: req.params.player },
                   update)
      .then (function() {
        res.ok()
      }, function() {
        res.status(500).send ({ error: "Could not update" })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send (err)
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
    PlayerService.findPlayer (req, res, function (player) {
      PlayerService.findOther (req, res, function (other, rs) {
        PlayerService.makeStatus ({ rs: rs,
                                    player: other,
                                    follower: player,
                                    isPublic: true })
      })
    })
  },
  
  // list followers
  listFollowed: function (req, res) {
    var playerID = req.params.player
    var result = { id: playerID }
    var following = {}
    function makeInfo (player) {
      return PlayerService.makePlayerSummary (player, following[player.id])
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
  },

  // list grammars
  listGrammars: function (req, res) {
    var playerID = req.params.player
    var result = { author: playerID }
    Grammar.find ({ author: playerID })
      .then (function (grammars) {
        result.grammars = grammars.map (function (grammar) {
          return { id: grammar.id, name: grammar.name }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // new grammar
  newGrammar: function (req, res) {
    var playerID = req.params.player
    var result = { author: playerID }
    Grammar.create ({ author: playerID })
      .then (function (grammar) {
        result.grammar = { id: grammar.id,
                           name: grammar.name,
                           rules: grammar.rules }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },
  
  // delete grammar
  deleteGrammar: function (req, res) {
    var playerID = req.params.player
    var grammarID = req.params.grammar
    var data = req.body.grammar
    var result = { author: playerID }
    Grammar.destroy ({ author: playerID,
                       id: grammarID })
      .then (function (grammars) {
	if (!grammars || grammars.length !== 1)
	  throw new Error ("Couldn't find grammar with ID " + grammarID + " and author " + authorID)
      }).then (function() {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // read grammar
  readGrammar: function (req, res) {
    var playerID = req.params.player
    var grammarID = req.params.grammar
    var result = { author: playerID }
    Grammar.findOne ({ author: playerID,
                       id: grammarID })
      .then (function (grammar) {
        if (!grammar)
          throw new Error ("No grammar found")
        result.grammar = { id: grammar.id,
                           name: grammar.name,
                           rules: grammar.rules }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // write grammar
  writeGrammar: function (req, res) {
    var playerID = req.params.player
    var grammarID = req.params.grammar
    var data = req.body.grammar
    var result = { author: playerID }
    Grammar.update ({ author: playerID,
                      id: grammarID },
                    { name: data.name,
                      rules: data.rules })
      .then (function (grammar) {
        result.grammar = { id: grammar.id,
                           updated: true }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

};
