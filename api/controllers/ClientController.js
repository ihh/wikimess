/**
 * ClientController
 *
 * @description :: Server-side logic for client actions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var Promise = require('bluebird')
var extend = require('extend')
var bcrypt = require('bcrypt')

module.exports = {

  // actions
  // convert player name to ID
  byName: function (req, res) {
    var name = req.body.name
    Player.findOneByName (name)
      .exec (function (err, player) {
        if (err)
          res.status(500).send ({ message: err })
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
          res.status(500).send ({ message: err })
        else if (players.length)
          res.status(400).send ({error: "The name " + name + " is already in use"})
        else
          Player.findOrCreate ({ name: name,
                                 password: password })
          .exec (function (err, player) {
            if (err)
              res.status(500).send ({ message: err })
            else if (!player)
              res.status(500).send ({ message: "Player " + name + " not created"})
            else
              res.json ({ name: player.name, id: player.id })
          })
      })
  },

  // search all Players, with pagination
  searchAllPlayers: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = req.body.n ? parseInt(req.body.n) : 3
    Player.find ({ or: [{ displayName: { contains: query } },
                        { name: { contains: query } }],
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
                        players: players.slice(0,resultsPerPage).map (function (player) {
	                  return PlayerService.makePlayerSummary (player, following[player.id])
	                })
		      })
	  })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // search Players who are reachable, preferentially followed or following, with no pagination
  searchFollowedPlayers: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    var lowerCaseQuery = query.toLowerCase()
    var matches = []
    function matchFilter (player) {
      return (player.displayName.toLowerCase().indexOf (lowerCaseQuery) >= 0
              || player.name.toLowerCase().indexOf (lowerCaseQuery) >= 0)
        && !player.admin && player.human
    }
    // find players we're following who match the search criteria
    Follow.find ({ follower: searcherID })
      .populate ('followed')
      .then (function (follows) {
        matches = follows.map (function (follow) { return follow.followed })
          .filter (matchFilter)
        if (matches.length >= maxResults)
          return Promise.resolve()
        else
          return Follow.find ({ followed: searcherID })
          .populate ('follower')
          .then (function (follows) {
            matches = matches.concat (follows.map (function (follow) { return follow.follower })
                                      .filter (matchFilter))
          })
      }).then (function() {
        // find players who're following us and match the search criteria
        if (matches.length >= maxResults)
          return Promise.resolve()
        else
          return Player.find ({ or: [{ displayName: { contains: query } },
                                     { name: { contains: query } }],
                                noMailUnlessFollowed: false,
		                admin: false,
		                human: true })
          .limit (maxResults)
          .then (function (players) {
            matches = matches.concat (players)
          })
      }).then (function() {
        var gotID = {}
        matches = matches.filter (function (player) {
          var duplicate = gotID[player.id]
          gotID[player.id] = true
          return !duplicate
        })
        res.json ({ players: matches.map (function (player) { return PlayerService.makePlayerSummary (player, true) })
                    .slice (0, maxResults) })
      })
  },

  // search Symbols, preferentially owned, with no pagination
  searchOwnedSymbols: function (req, res) {
    var searcherID = parseInt(req.params.player), query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    Symbol.find ({ owner: searcherID,
                   name: query.name })
      .populate ('owner')
      .then (function (ownedSymbols) {
        var symbolPromise
        if (ownedSymbols.length >= maxResults)
          symbolPromise = new Promise (function (resolve, reject) { resolve([]) })
        else
          symbolPromise = Symbol
          .find ({ owner: { '!': searcherID },
                   name: query.name })
          .limit (maxResults - ownedSymbols.length)
          .populate ('owner')
        symbolPromise.then (function (unownedSymbols) {
          res.json ({ symbols: ownedSymbols.concat(unownedSymbols).map (function (symbol) {
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
                    symbols: symbols.slice(0,resultsPerPage).map (function (symbol) {
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
    var updateKeys = ['name', 'displayName', 'gender', 'publicBio', 'privateBio', 'noMailUnlessFollowed']
    var name = req.body.name
    var nameClashPromise = (typeof(name) === 'undefined'
                            ? Promise.resolve (false)
                            : Player.find ({ id: { '!': playerID },
                                             name: name })
                            .then (function (players) {
                              return players.length > 0
                            }))
    nameClashPromise.then (function (nameClash) {
      if (nameClash)
        res.status(400).send ({error: "The player name " + name + " is already in use"})
      else {
        var update = {}
        updateKeys.forEach (function (key) {
          if (typeof (req.body[key]) !== 'undefined')
            update[key] = req.body[key]
        })
        var passwordPromise
        if (req.body.newPassword)
          passwordPromise = Player.findOne ({ id: playerID })
            .then (function (player) {
              return new Promise (function (resolve, reject) {
                bcrypt.compare (req.body.oldPassword, player.password, function (err, res) {
                  if (!res)
                    reject (new Error ('Invalid Password'))
                  else
                    Player.hashPassword (req.body.newPassword, function (err, hash) {
                      if (err)
                        reject (err)
                      else {
                        update.password = hash
                        resolve()
                      }
                    })
                })
              })
            })
        else
          passwordPromise = Promise.resolve()

        return passwordPromise
          .then (function() {
            return Player.update ({ id: playerID }, update)
          }).then (function (updated) {
            if (updated.length)
              res.ok()
            else
              res.status(500).send ({ message: req.body.newPassword ? 'Password incorrect' : 'An error occurred.' })
          })
      }
    }).catch (function (err) {
      console.log(err)
      res.status(500).send ({ message: err })
    })
  },

  // get player status
  selfStatus: function (req, res) {
    var playerID = parseInt (req.params.player)
    Player.findOne ({ id: playerID })
      .then (function (player) {
        return PlayerService.makeStatus ({ player: player,
                                           isPublic: false })
      }).then (function (result) {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  otherStatusById: function (req, res) {
    var playerID = parseInt (req.params.player)
    var otherID = parseInt (req.params.id)
    Player.findOne ({ id: otherID })
      .then (function (other) {
        return PlayerService.makeStatus ({ player: other,
                                           follower: { id: playerID },
                                           isPublic: true })
      }).then (function (result) {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  getPlayerId: function (req, res) {
    var playerID = parseInt (req.params.player)
    var otherName = req.params.name
    var result = {}
    Player.findOne ({ name: otherName })
      .then (function (other) {
        if (other)
          result.player = { id: other.id,
                            name: other.name,
                            displayName: other.displayName }
        else
          result.player = null
      }).then (function() {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // list followers
  listFollowed: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = { id: playerID }
    var followInfo = {}
    Follow.find ({ follower: playerID })
      .populate ('followed')
      .then (function (follows) {
        result.followed = follows.map (function (follow) {
          var info = PlayerService.makePlayerSummary (follow.followed, true)
          followInfo[follow.followed.id] = info
          return info
        })
        return Follow.find ({ followed: playerID })
          .populate ('follower')
      }).then (function (followed) {
        result.followers = followed.map (function (follow) {
          var followedInfo = followInfo[follow.follower.id]
          if (followedInfo)
            followedInfo.reachable = true
          return PlayerService.makePlayerSummary (follow.follower, followedInfo && true)
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // add follower
  follow: function (req, res) {
    var playerID = req.params.player
    var otherID = req.params.other
    if (playerID === otherID)
      res.status(500).send (new Error ("You can't follow yourself"))
    else {
      var newFollow = { follower: playerID,
                        followed: otherID }
      Follow.findOrCreate (newFollow)
        .then (function (follow) {
          res.json (follow)
        }).catch (function (err) {
          console.log(err)
          res.status(500).send ({ message: err })
        })
    }
  },

  // remove follower
  unfollow: function (req, res) {
    Follow.destroy ({ follower: req.params.player,
                      followed: req.params.other })
      .exec (function (err, deleted) {
        if (err)
          res.status(500).send ({ message: err })
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
                             displayName: message.sender.displayName },
                   date: message.createdAt,
                   unread: !message.read }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
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
                                displayName: message.recipient.displayName },
                   date: message.createdAt }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
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
                                     name: message.sender.name,
                                     displayName: message.sender.displayName },
                           template: { id: message.template.id,
                                       content: message.template.content },
                           title: message.title,
                           body: message.body,
                           date: message.createdAt,
                           rating: message.rating }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
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
                                        name: message.recipient.name,
                                        displayName: message.recipient.displayName },
                           template: { id: message.template },
                           title: message.title,
                           body: message.body,
                           date: message.createdAt }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
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
    // check that the recipient is reachable
    Follow.find ({ follower: recipientID,
                   followed: playerID })
      .then (function (follows) {
        if (!follows.length)
          return Player.find ({ id: recipientID,
                                noMailUnlessFollowed: false })
          .then (function (players) {
            if (!players.length)
              throw new Error ("Recipient unreachable")
          })
      }).then (function() {
        // find, or create, the template
        var templatePromise
        if (typeof(template.id) !== 'undefined')
          templatePromise = Template.findOne ({ id: template.id })
        else {
          // give an initial weight of 1 to all symbol adjacencies in this template
          SymbolService.imposeSymbolLimit ([template.content], Symbol.maxTemplateSyms)
          templatePromise = SymbolService.updateAdjacencies (template.content, 1)
            .then (function() {
              // find previous Message
              var previousPromise = (typeof(previous) === 'undefined'
                                     ? new Promise (function (resolve, reject) { resolve(null) })
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
        })
    }).catch (function (err) {
      console.log(err)
      res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
      })
  },

  // create a new symbol
  newSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var result = {}
    var symInfo = { owner: playerID }
    if (req.body.symbol)
      extend (symInfo, { prefix: req.body.symbol.name,
                         rules: req.body.symbol.rules,
                         initialized: (req.body.symbol.rules && req.body.symbol.rules.length > 0) })
    Symbol.create (symInfo)
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
        res.status(500).send ({ message: err })
      })
  },

  // get a particular symbol
  getSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolID = parseInt (req.params.symid)
    var result = {}
    Symbol.findOneCached ({ id: symbolID })
      .then (function (symbol) {
        if (symbol) {
          var ownerID = symbol.owner
          result.symbol = { id: symbol.id,
                            owner: {} }
          if (ownerID === playerID || symbol.summary === null)
            result.symbol.rules = symbol.rules
          else {
            result.symbol.rules = []
            result.symbol.summary = symbol.summary
          }
          var ownerPromise = (ownerID === null
                              ? Promise.resolve()
                              .then (function() {
                                result.symbol.owner = null
                              })
                              : Player.findOne ({ id: ownerID })
                              .then (function (player) {
                                if (player.admin)
                                  result.symbol.owner.admin = true
                                else {
                                  result.symbol.owner = ownerID
                                  result.symbol.owner.name = player.name
                                }
                              }))
          ownerPromise.then (function() {
            return SymbolService.resolveReferences ([symbol])
          }).then (function (names) {
            result.name = names
            Symbol.subscribe (req, symbolID)
            res.json (result)
          }).catch (function (err) {
            console.log(err)
            res.status(500).send ({ message: err })
          })
        } else
          res.status(500).send ({ message: "Symbol not found" })
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

    if (Symbol.cache.byName[name] && Symbol.cache.byName[name].id !== symbolID)
      res.status(400).send ({error: "The symbol name " + name + " is already in use"})
    else {
      SymbolService.imposeSymbolLimit (update.rules, Symbol.maxRhsSyms)
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
          return Player.findOne ({ id: playerID })
        }).then (function (player) {
          result.symbol.owner.name = player.name
          Symbol.message (symbolID, extend ({ message: "update" },
                                            result))
          res.json (result)
        }).catch (function (err) {
          console.log(err)
          res.status(500).send ({ message: err })
        })
      }
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
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
      })
  },

  // expand multiple symbols using the grammar
  expandSymbols: function (req, res) {
    var playerID = parseInt (req.params.player)
    var symbolQueries = req.body.symbols || []
    SymbolService.expandSymbols (symbolQueries, Symbol.maxTemplateSyms)
      .then (function (expansions) {
        res.json ({ expansions: expansions })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // suggest best N templates
  suggestTemplates: function (req, res) {
    var playerID = parseInt (req.params.player)
    var nSuggestions = 5
    return Template.find ({ previous: null })
      .populate ('author')
      .then (function (templates) {
        templates.forEach (function (template) {
          template.rating = template.nRatings ? (template.sumRatings / template.nRatings) : 0
        })
        var suggestedTemplates = SortService.partialSort
        (templates, nSuggestions, function (a, b) { return b.rating - a.rating })
        .map (function (template) {
          return { id: template.id,
                   author: { id: template.author.id,
                             name: template.author.name,
                             displayName: template.author.displayName },
                   title: template.title }
        })
        res.json ({ templates: suggestedTemplates })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
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
        res.status(500).send ({ message: err })
      })
  },

  // suggest best N symbols (currently implemented using adjacencies)
  suggestSymbol: function (req, res) {
    var playerID = parseInt (req.params.player)
    var beforeQueries = req.body.before
    var temperature = req.body.temperature || 0
    var nSuggestions = 5
    
    function* beforeQueryGenerator() {
      while (beforeQueries.length)
        yield beforeQueries.pop()
    }

    function beforePromise (generator) {
      var iter = generator.next()
      if (iter.done)
        return Promise.resolve (null)
      else
        return Symbol.findOneCached (iter.value).then (function (symbol) {
          if (symbol)
            return Promise.resolve (symbol.id)
          return beforePromise (generator)
        })
    }

    beforePromise (beforeQueryGenerator())
      .then (function (beforeSymbolID) {
        var adjCache = Adjacency.cache[beforeSymbolID] || {}
        var symbolIDs
        if (temperature) {
          var allSymbolIDs = Object.keys (Symbol.cache.byId)
          var pseudocount = 1 / allSymbolIDs.length
          var heatedWeights = allSymbolIDs.map (function (symbolID) {
            return adjCache[symbolID] || pseudocount  // TODO: multiply pseudocount by Symbol rating
          }).map (function (weight) {
            return Math.pow (weight, 1 / temperature)
          })
          var indices = SortService.multiSampleByWeight (heatedWeights, nSuggestions)
          symbolIDs = indices.map (function (n) { return allSymbolIDs[n] })
        } else {
          symbolIDs = SortService.partialSort (Object.keys(adjCache).filter (function (symbolID) {
            return symbolID !== 'null'
          }), nSuggestions, function (a, b) { return adjCache[b] - adjCache[a] })
          if (!symbolIDs.length) {
            var allSymbolIDs = Object.keys (Symbol.cache.byId)
            // TODO: weight sample by Symbol rating
            if (allSymbolIDs.length)
              symbolIDs.push (allSymbolIDs [Math.floor (Math.random() * allSymbolIDs.length)])
          }
        }
        var symbols = symbolIDs.map (function (symbolID) { return Symbol.cache.byId[symbolID] })
        res.json ({ symbols: symbols
                    .map (function (symbol) { return { id: symbol.id,
                                                       name: symbol.name } }) })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

};
