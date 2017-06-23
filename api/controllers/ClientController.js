/**
 * ClientController
 *
 * @description :: Server-side logic for client actions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var Promise = require('bluebird')
var extend = require('extend')

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

  // search all Players, with pagination
  searchAllPlayers: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = req.body.n ? parseInt(req.body.n) : 3
    Player.find ({ displayName: { contains: query },
                   id: { '!': searcherID },
		   admin: false,
		   human: true })
      .limit (resultsPerPage + 1)
      .skip (resultsPerPage * page)
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

  // search Players, preferentially followed, with no pagination
  searchFollowedPlayers: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    Follow.find ({ follower: searcherID })
      .populate ('followed')
      .then (function (follows) {
        var lowerCaseQuery = query.toLowerCase()
        var matchingFollowed = follows
            .filter (function (follow) { return follow.followed.displayName.toLowerCase().indexOf (lowerCaseQuery) >= 0})
            .map (function (follow) { return follow.followed })
        var playerPromise
        if (matchingFollowed.length >= maxResults)
          playerPromise = new Promise (function (resolve, reject) { resolve([]) })
        else
          playerPromise = Player
          .find ({ displayName: { contains: query },
                   id: { '!': searcherID },
		   admin: false,
		   human: true })
          .limit (maxResults - matchingFollowed.length)
        playerPromise.then (function (matchingUnfollowed) {
          res.json ({ results: matchingFollowed.map (function (player) { return PlayerService.makePlayerSummary (player, true) })
                      .concat (matchingUnfollowed.map (function (player) { return PlayerService.makePlayerSummary (player, false) }))
                      .slice (0, maxResults)
                    })
        })
      })
  },

  // search Symbols, preferentially owned, with no pagination
  searchOwnedSymbols: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    Symbol.find ({ name: { contains: query },
                   owner: searcherID })
      .populate ('owner')
      .then (function (ownedSymbols) {
        var symbolPromise
        if (ownedSymbols.length >= maxResults)
          symbolPromise = new Promise (function (resolve, reject) { resolve([]) })
        else
          symbolPromise = Symbol
          .find ({ name: { contains: query },
                   owner: { '!': searcherID } })
          .limit (maxResults - ownedSymbols.length)
          .populate ('owner')
        symbolPromise.then (function (unownedSymbols) {
          res.json ({ results: ownedSymbols.concat(unownedSymbols).map (function (symbol) {
            return { id: symbol.id,
                     name: symbol.name,
                     owner: { id: symbol.owner.id,
                              name: symbol.owner.displayName } } })
                    })
        })
      })
  },

  // search all Symbols, with pagination
  searchAllSymbols: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = req.body.n ? parseInt(req.body.n) : 3
    Symbol.find ({ name: { contains: query } })
      .limit (resultsPerPage + 1)
      .skip (resultsPerPage * page)
      .then (function (symbols) {
        res.json ({ page: page,
                    more: symbols.length > resultsPerPage,
                    results: symbols.slice(0,resultsPerPage).map (function (symbol) {
                      return { id: symbol.id,
                               name: symbol.name,
                               owner: symbol.owner
                               ? { id: symbol.owner.id,
                                   name: symbol.owner.displayName }
                               : null } })
                  })
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
    var playerID = parseInt (req.params.player)
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

  // inbox
  getInbox: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = { player: playerID }
    Message.find ({ recipient: playerID,
                    recipientDeleted: false })
      .populate ('sender')
      .then (function (messages) {
        result.messages = messages.map (function (message) {
          return { id: message.id,
                   title: message.title,
                   sender: { id: message.sender.id,
                             name: message.sender.displayName },
                   date: message.createdAt,
                   unread: !message.read }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // inbox count
  getInboxCount: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = { player: playerID }
    Message.count ({ recipient: playerID,
                     recipientDeleted: false,
                     read: false })
      .then (function (count) {
        res.json ({ count: count })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },
  
  // outbox
  getOutbox: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = { player: playerID }
    Message.find ({ sender: playerID,
                    senderDeleted: false })
      .populate ('recipient')
      .then (function (messages) {
        result.messages = messages.map (function (message) {
          return { id: message.id,
                   title: message.title,
                   recipient: { id: message.recipient.id,
                                name: message.recipient.displayName },
                   date: message.createdAt }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // get received message
  getReceivedMessage: function (req, res) {
    var playerID = parseInt (req.params.player)
    var messageID = parseInt (req.params.message)
    var result = {}
    Message.update ({ recipient: playerID,
                      id: messageID,
                      recipientDeleted: false },
                    { read: true })
      .then (function (message) {
        return Message.findOne ({ id: messageID })
          .populate ('symbol')
          .populate ('sender')
      }).then (function (message) {
        result.message = { id: message.id,
                           sender: { id: message.sender.id,
                                     name: message.sender.displayName },
                           symbol: { id: message.symbol.id,
                                     name: message.symbol.name },
                           title: message.title,
                           body: message.body,
                           date: message.createdAt }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // get received message header
  getReceivedMessageHeader: function (req, res) {
    var playerID = parseInt (req.params.player)
    var messageID = parseInt (req.params.message)
    var result = {}
    Message.findOne ({ recipient: playerID,
                       id: messageID,
                       recipientDeleted: false })
      .populate ('sender')
      .then (function (message) {
        result.message = { id: message.id,
                           title: message.title,
                           sender: { id: message.sender.id,
                                     name: message.sender.displayName },
                           date: message.createdAt,
                           unread: !message.read }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // get sent message
  getSentMessage: function (req, res) {
    var playerID = parseInt (req.params.player)
    var messageID = parseInt (req.params.message)
    var result = {}
    Message.findOne ({ sender: playerID,
                       id: messageID,
                       senderDeleted: false })
      .populate ('symbol')
      .populate ('recipient')
      .then (function (message) {
        result.message = { id: message.id,
                           recipient: { id: message.recipient.id,
                                        name: message.recipient.displayName },
                           symbol: { id: message.symbol.id,
                                     name: message.symbol.name },
                           title: message.title,
                           body: message.body,
                           date: message.createdAt }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // send message
  sendMessage: function (req, res) {
    var playerID = parseInt (req.params.player)
    var recipientID = parseInt (req.body.recipient)
    var symbolID = parseInt (req.body.symbol)
    var title = req.body.title
    var body = req.body.body
    var result = {}
    Message.create ({ sender: playerID,
                      recipient: recipientID,
                      symbol: symbolID,
                      title: title,
                      body: body })
      .then (function (message) {
        result.message = { id: message.id }
        Player.message (recipientID, { message: "incoming",
                                       id: message.id })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // delete message
  deleteMessage: function (req, res) {
    var playerID = parseInt (req.params.player)
    var messageID = parseInt (req.params.message)
    Message.findOne ({ id: messageID,
                       or: [ { sender: playerID },
                             { recipient: playerID } ] })
      .then (function (message) {
        var update = {}, destroy = false
        if (message.sender === playerID) {
          update.senderDeleted = true
          destroy = message.recipientDeleted
        }
        if (message.recipient === playerID) {
          update.recipientDeleted = true
          destroy = message.senderDeleted
        }
        return (destroy
                ? Message.destroy ({ id: messageID })
                : Message.update ({ id: messageID }, update))
      }).then (function (message) {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // get all symbols owned by a player
  getSymbolsByOwner: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = { owner: playerID }
    Symbol.find ({ owner: playerID })
      .then (function (symbols) {
        result.symbols = symbols.map (function (symbol) {
          return { id: symbol.id,
                   owner: { id: playerID },
                   rules: symbol.rules }
        })
        Symbol.subscribe (req, symbols.map (function (symbol) { return symbol.id }))
        return SymbolService.resolveReferences (symbols)
      }).then (function (names) {
        result.name = names
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // create a new symbol
  newSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = {}
    Symbol.create ({ owner: playerID })
      .then (function (symbol) {
        result.symbol = { id: symbol.id,
                          owner: { id: playerID },
                          rules: symbol.rules }
        result.name = {}
        result.name[symbol.id] = symbol.name
        Symbol.subscribe (req, symbol.id)
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // get a particular symbol
  getSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    var result = {}
    Symbol.findOne ({ id: symbolID })
      .then (function (symbol) {
        result.symbol = { id: symbol.id,
                          owner: { id: symbol.owner },
                          rules: symbol.rules }
        return SymbolService.resolveReferences ([symbol])
      }).then (function (names) {
        result.name = names
        Symbol.subscribe (req, symbolID)
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // store a particular symbol
  putSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    var name = req.body.name
    var rules = req.body.rules
    var update = extend ({ owner: playerID,
                           initialized: true },
                         { name: name,
                           rules: rules })
    var result = { symbol: { id: symbolID,
                             name: name,
                             owner: { id: playerID },
                             rules: rules,
                             initialized: true },
                   name: {} }
    
    Symbol.find ({ not: { id: symbolID },
                   name: name })
      .then (function (eponSyms) {
        if (eponSyms.length)
          res.status(400).send ({error: "A symbol named " + name + " already exists"})
        else
          SymbolService.createReferences (update.rules)
          .then (function (rhsSymbols) {
            rhsSymbols.forEach (function (rhsSymbol) {
              result.name[rhsSymbol.id] = rhsSymbol.name
            })
            return Symbol.update ({ id: symbolID,
                                    owner: [ playerID, null ] },
                                  update)
          }).then (function (symbol) {
            result.name[symbolID] = symbol.name
            Symbol.message (symbolID, extend ({ message: "update" },
                                              result))
            res.json (result)
          })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // release ownership of a symbol
  releaseSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    Symbol.update ({ id: symbolID,
                     owner: playerID },
                   { owner: null })
      .then (function (symbols) {
        if (symbols && symbols.length === 1)
          SymbolService.resolveReferences (symbols)
          .then (function (names) {
            var symbol = symbols[0]
            Symbol.message (symbolID,
                            { message: "update",
                              symbol: { id: symbolID,
                                        name: symbol.name,
                                        owner: {},
                                        rules: symbol.rules,
                                        initialized: symbol.initialized },
                              name: names })
            res.ok()
          })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // subscribe to notifications for a player
  subscribePlayer: function (req, res) {
    var playerID = parseInt (req.params.player)
    Player.subscribe (req, playerID)
    res.ok()
  },

  // unsubscribe from notifications for a player
  unsubscribePlayer: function (req, res) {
    var playerID = parseInt (req.params.player)
    Player.unsubscribe (req, playerID)
    res.ok()
  },

  // unsubscribe from notifications for a symbol
  unsubscribeSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    Symbol.unsubscribe (req, symbolID)
    res.ok()
  },

  // expand a symbol using the grammar
  expandSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    SymbolService.expandSymbol (symbolID)
      .then (function (expansion) {
        res.json ({ expansion: expansion })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

};
