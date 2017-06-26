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
          res.status(400).send ({error: "The name " + name + " is already in use"})
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
		   admin: false,
		   human: true })
          .limit (maxResults)
        playerPromise.then (function (matchingUnfollowed) {
          var gotID = {}
          matchingFollowed.forEach (function (player) { gotID[player.id] = true })
          matchingUnfollowed = matchingUnfollowed.filter (function (player) { return !gotID[player.id] })
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
    var playerID = parseInt (req.params.player)
    var name = req.body.name
    var displayName = req.body.displayName
    Player.find ({ id: { '!': playerID },
                   name: name })
      .then (function (players) {
        if (players.length)
          res.status(400).send ({error: "The player name " + name + " is already in use"})
        else {
          var update = { name: name,
                         displayName: displayName }
          return Player.update ({ id: playerID },
                                update)
            .then (function() {
              res.ok()
            })
        }
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
      .then (function (messages) {
        return Message.findOne ({ id: messageID })
          .populate ('template')
          .populate ('sender')
      }).then (function (message) {
        result.message = { id: message.id,
                           sender: { id: message.sender.id,
                                     name: message.sender.displayName },
                           template: { id: message.template.id,
                                       content: message.template.content },
                           title: message.title,
                           body: message.body,
                           date: message.createdAt,
                           rating: message.rating }
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
      .populate ('recipient')
      .then (function (message) {
        result.message = { id: message.id,
                           recipient: { id: message.recipient.id,
                                        name: message.recipient.displayName },
                           template: { id: message.template },
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
    var template = req.body.template
    var title = req.body.title
    var body = req.body.body
    var previous = req.body.previous
    var result = {}
    var templatePromise
    if (typeof(template.id) !== 'undefined')
      templatePromise = Template.findOne ({ id: template.id })
    else {
      // give an initial weight of 1 to all symbol adjacencies in this template
      templatePromise = SymbolService.updateAdjacencies (template.content, 1)
        .then (function() {
          // find previous Message
          var previousPromise = (typeof(previous) === 'undefined'
                                 ? new Promise (function (resolve, reject) { resolve({}) })
                                 : Message.findOne ({ id: previous })
                                 .populate ('template')
                                 .then (function (message) { return message.template }))
          return previousPromise
        }).then (function (previousTemplate) {
          // create the Template
          return Template.create ({ title: title,
                                    content: template.content,
                                    author: playerID,
                                    previous: previousTemplate })
        })
    }
    templatePromise.then (function (template) {
      result.template = { id: template.id }
      return Message.create ({ sender: playerID,
                               recipient: recipientID,
                               template: template,
                               previous: previous,
                               title: title,
                               body: body })
    }).then (function (message) {
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
      }).then (function (messages) {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // rate message
  rateMessage: function (req, res) {
    var playerID = parseInt (req.params.player)
    var messageID = parseInt (req.params.message)
    var rating = parseInt (req.body.rating)
    Message.update ({ id: messageID,
                      sender: { '!': playerID },
                      recipient: playerID,
                      rating: null,
                      read: true,
                      recipientDeleted: false },
                    { rating: rating })
      .then (function (messages) {
        if (messages && messages.length === 1) {
          var message = messages[0]
          // split author credit between authors of all Symbols used in body
          return SymbolService.expansionAuthors (message.body)
            .then (function (authors) {
              var authorRatingWeight = 1 / authors.length, authorRating = rating * authorRatingWeight
              return Promise.map
              (authors,
               function (authorID) {
                 return Player.findOne ({ id: authorID })
                   .then (function (player) {
                     return Player.update ({ id: authorID },
                                           { nAuthorRatings: player.nAuthorRatings + 1,
                                             sumAuthorRatingWeights: player.sumAuthorRatingWeights + authorRatingWeight,
                                             sumAuthorRatings: player.sumAuthorRatings + authorRating })
                   })
               })
            }).then (function() {
              // give credit to sender
              return Player.findOne ({ id: message.sender })
            }).then (function (sender) {
              return Player.update ({ id: message.sender },
                                    { nSenderRatings: sender.nSenderRatings + 1,
                                      sumSenderRatings: sender.sumSenderRatings + rating })
              // give credit to template
            }).then (function() {
              return Template.findOne ({ id: message.template })
            }).then (function (template) {
              return Template.update ({ id: template.id },
                                      { nRatings: template.nRatings + 1,
                                        sumRatings: template.sumRatings + rating })
                .then (function() {
                  // update adjacency weights
                  return SymbolService.updateAdjacencies (template.content, rating)
                })
            })
        }
      }).then (function() {
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
          res.status(400).send ({error: "The symbol name " + name + " is already in use"})
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

  // get a particular template
  getTemplate: function (req, res) {
    var playerID = parseInt (req.params.player)
    var templateID = parseInt (req.params.template)
    var result = {}
    Template.findOne ({ id: templateID })
      .then (function (template) {
        result.template = { id: template.id,
                            content: template.content }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // expand a symbol using the grammar
  expandSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    SymbolService.expandSymbol ({ id: symbolID })
      .then (function (expansion) {
        res.json ({ expansion: expansion })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // expand multiple symbols using the grammar
  expandSymbols: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolQueries = req.body.symbols || []
    Promise.map (symbolQueries, function (symbolQuery) {
      return SymbolService.expandSymbol (symbolQuery)
    }).then (function (expansions) {
        res.json ({ expansions: expansions })
    }).catch (function (err) {
      console.log(err)
      res.status(500).send(err)
    })
  },

  // suggest best N templates
  suggestTemplates: function (req, res) {
    var playerID = parseInt (req.params.player)
    var nSuggestions = 5
    return Template.find ({ previous: null })
      .then (function (templates) {
        templates.forEach (function (template) {
          template.rating = template.nRatings ? (template.sumRatings / template.nRatings) : 0
        })
        var suggestedTemplates = SortService.partialSort
        (templates, nSuggestions, function (a, b) { return b.rating - a.rating })
        .map (function (template) {
          return { id: template.id,
                   title: template.title }
        })
        res.json ({ templates: suggestedTemplates })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // suggest random reply
  suggestReply: function (req, res) {
    var playerID = parseInt (req.params.player)
    var previousID = parseInt (req.params.template)
    return Template.find ({ previous: previousID })
      .then (function (templates) {
        var result = {}
        if (templates.length) {
          var templateRating = templates.map (function (template) {
            return template.nRatings ? (template.sumRatings / template.nRatings) : 0
          })
          var template = templates[SortService.sampleByWeight (templateRating)]
          result.template = { id: template.id,
                              title: template.title,
                              content: template.content }
          result.more = (templates.length > 1)
        }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send(err)
      })
  },

  // suggest best N symbols (currently implemented using adjacencies)
  suggestSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var beforeQuery = req.body.before && req.body.before.length && req.body.before[req.body.before.length-1]
    var nSuggestions = 5
    var beforePromise = (beforeQuery
                         ? Symbol.findOne(beforeQuery).then (function (symbol) { return symbol ? symbol.id : null })
                         : new Promise (function (resolve, reject) { resolve (null) }))
    beforePromise.then (function (beforeSymbolID) {
      return Adjacency.find ({ predecessor: beforeSymbolID,
                               successor: { '!': null } })
        .sort ('weight DESC')
        .limit (nSuggestions)
        .populate ('successor')
    }).then (function (adjacencies) {
      res.json ({ symbols: adjacencies
                  .map (function (adj) { return { id: adj.successor.id,
                                                  name: adj.successor.name } }) })
    }).catch (function (err) {
      console.log(err)
      res.status(500).send(err)
    })
  },

};
