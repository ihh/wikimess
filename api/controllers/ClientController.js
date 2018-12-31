/**
 * ClientController
 *
 * @description :: Server-side logic for client actions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var Promise = require('bluebird')
var extend = require('extend')
var deepcopy = require('deepcopy')
var bcrypt = require('bcrypt')

var parseTree = require('bracery').ParseTree
var VarsHelper = require('../../src/vars')

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
    var searcherID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = req.body.n ? parseInt(req.body.n) : 3
    Player.find ({ or: [{ displayName: { contains: query } },
                        { name: { contains: query } }],
		   admin: false,
		   searchable: true })
      .limit (resultsPerPage + 1)
      .skip (resultsPerPage * page)
      .then (function (players) {
        var playerIDs = players.map (function (player) { return player.id })
	return Follow.find ({ or: [{ follower: searcherID,
                                     followed: playerIDs },
                                   { followed: searcherID,
                                     follower: playerIDs }] })
          .then (function (follows) {
	    var following = {}, followedBy = {}
            follows.forEach (function (follow) {
              if (follow.follower === searcherID)
                following[follow.followed] = true
              if (follow.followed === searcherID)
                followedBy[follow.follower] = true
            })
	    res.json ({ page: page,
                        more: players.length > resultsPerPage,
                        players: players.slice(0,resultsPerPage).map (function (player) {
	                  var info = PlayerService.makePlayerSummary (player, following[player.id])
                          info.reachable = info.reachable || followedBy[player.id]
                          return info
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
    var searcherID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    var lowerCaseQuery = query.toLowerCase()
    var matches = []
    function matchFilter (player) {
      return (player.displayName.toLowerCase().indexOf (lowerCaseQuery) >= 0
              || player.name.toLowerCase().indexOf (lowerCaseQuery) >= 0)
        && !player.admin && player.searchable
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
		                searchable: true })
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
    var searcherID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var query = req.body.query
    var maxResults = req.body.n ? parseInt(req.body.n) : 3
    Symbol.find (_.extend ({ name: query.name },
                           searcherID
                           ? { owned: true,
                               owner: searcherID }
                           : { owned: false }))
      .populate ('owner')
      .then (function (ownedSymbols) {
        var symbolPromise
        if (ownedSymbols.length >= maxResults)
          symbolPromise = new Promise (function (resolve, reject) { resolve([]) })
        else
          symbolPromise = Symbol
          .find (_.extend ({ name: query.name },
                           searcherID
                           ? { or: [ { owned: false },
                                     { owned: true, owner: { '!=': searcherID } } ] }
                           : { owned: true }))
          .limit (maxResults - ownedSymbols.length)
          .populate ('owner')
        symbolPromise.then (function (unownedSymbols) {
          res.json ({ symbols: ownedSymbols.concat(unownedSymbols).map (function (symbol) {
            return { id: symbol.id,
                     name: symbol.name,
                     owner: SymbolService.makeOwnerID (symbol) } })
                    })
        })
      })
  },

  // search all Symbols, with pagination
  searchAllSymbols: function (req, res) {
    var query = req.body.query, page = parseInt(req.body.page) || 0
    var resultsPerPage = req.body.n ? parseInt(req.body.n) : 3
    Symbol.find ({ or: [{ name: { contains: query } },
                        { rules: { like: '%' + query + '%' } }] })
      .limit (resultsPerPage + 1)
      .skip (resultsPerPage * page)
      .populate ('owner')
      .then (function (symbols) {
        res.json ({ page: page,
                    more: symbols.length > resultsPerPage,
                    symbols: symbols.slice(0,resultsPerPage).map (function (symbol) {
                      return { id: symbol.id,
                               name: symbol.name,
                               owner: SymbolService.makeOwnerID (symbol) } })
                  })
      })
  },

  // configure Player info
  configurePlayer: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var updateKeys = ['name', 'displayName', 'gender', 'publicBio', 'privateBio', 'noMailUnlessFollowed', 'createsPublicTemplates', 'botMessage', 'botInterval']
    var name = req.body.name
    var nameClashPromise = (typeof(name) === 'undefined'
                            ? Promise.resolve (false)
                            : Player.find ({ id: { '!=': playerID },
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
            return Player.update ({ id: playerID },
                                  update)
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
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    Player.findOne ({ id: playerID })
      .then (function (player) {
        return PlayerService.makeStatus ({ player: player,
                                           messages: false })
      }).then (function (result) {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get a conversation thread, i.e. all messages between two players
  getThread: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var otherID = Player.parseID (req.params.id)
    Player.findOne ({ id: otherID })
      .then (function (other) {
        return PlayerService.makeStatus ({ player: other,
                                           follower: playerID ? { id: playerID } : null,
                                           messages: true })
      }).then (function (result) {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get a conversation thread (subsequent page)
  getThreadBefore: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var otherID = Player.parseID (req.params.id)
    var beforeID = Player.parseID (req.params.before)
    Player.findOne ({ id: otherID })
      .then (function (other) {
        return PlayerService.makeStatus ({ player: other,
                                           follower: playerID ? { id: playerID } : null,
                                           messages: true,
                                           before: beforeID })
      }).then (function (result) {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get a broadcast Message thread, forward in time: the Message itself and all descendants
  getBroadcastMessageForwardThread: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var messageID = Message.parseID (req.params.message)
    var result = {}
    Message.findOne ({ isBroadcast: true,
                       id: messageID })
      .populate ('template')
      .populate ('sender')
      .then (function (message) {
        if (message) {
          function subtreeRootedAt (msg) {
            return Message.find ({ previous: msg.id })
              .populate ('template')
              .populate ('sender')
              .then (function (replies) {
                replies = replies || []
                msg.replies = replies
                return Promise.map (replies, function (reply) {
                  return subtreeRootedAt (reply)
                }).then (function (repliesWithDescendants) {
                  return repliesWithDescendants.reduce (function (a, b) { return a.concat(b) },
                                                        [msg])
                })
              })
          }
          return subtreeRootedAt (message)
        }
        return []  // no message was found, return empty
      }).then (function (messages) {
        return PlayerService.getPlayersById (messages.map (function (message) { return message.template.author }))
          .then (function (authorById) {
            res.json
            ({ thread:
               messages.map (function (message) {
                 var author = authorById[message.template.author] || {}
                 return { id: message.id,
                          previous: message.previous,
                          next: message.replies.map (function (reply) {
                            return reply.id
                          }),
                          sender: (message.sender
                                   ? { id: message.sender.id,
                                       name: message.sender.name,
                                       displayName: message.sender.displayName }
                                   : null),
                          template: { id: message.template.id,
                                      content: message.template.content,
                                      author: { id: message.template.author,
                                                name: author.name,
                                                displayName: author.displayName },
                                      tags: message.template.tags },
			  tweeter: message.tweeter,  // == author.twitterScreenName, denormalized
                          avatar: message.avatar,  // == author.avatar, denormalized
	                  tweet: message.tweetId,
                          title: message.title,
                          vars: message.initVarVal,
                          body: message.body,
                          date: message.createdAt }
               })
             })
          })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
        },

  // find player ID
  getPlayerId: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
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
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
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
          return extend (PlayerService.makePlayerSummary (follow.follower, followedInfo && true),
                         { reachable: true })
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // add follower
  follow: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var otherID = Player.parseID (req.params.other)
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
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    Follow.destroy ({ follower: playerID,
                      followed: req.params.other })
      .exec (function (err, deleted) {
        if (err)
          res.status(500).send ({ message: err })
        else if (deleted.length)
          res.ok()
        else
          res.status(404).send ({error: "Player " + playerID + " does not follow player " + req.params.other})
      })
  },

  // inbox
  getInbox: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var result = { player: playerID }
    Message.find ({ recipient: playerID,
                    recipientDeleted: false })
      .populate ('sender')
      .then (function (messages) {
        result.messages = messages.map (function (message) {
          return { id: message.id,
                   title: message.title || parseTree.summarizeExpansion (message.body),
                   sender: { id: message.sender.id,
                             displayName: message.sender.displayName },
                   date: message.createdAt,
                   tweeter: message.tweeter,
                   avatar: message.avatar,
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
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
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
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var result = { player: playerID }
    Message.find ({ sender: playerID,
                    senderDeleted: false })
      .populate ('recipient')
      .then (function (messages) {
        result.messages = messages.map (function (message) {
          return { id: message.id,
                   title: message.title || parseTree.summarizeExpansion (message.body),
                   recipient: (message.recipient
                               ? { id: message.recipient.id,
                                   displayName: message.recipient.displayName }
                               : undefined),
                   tweeter: message.tweeter,
                   avatar: message.avatar,
                   date: message.createdAt }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // broadcasts
  getRecentBroadcasts: function (req, res) {
    var limit = req.params.limit ? parseInt(req.params.limit) : 10
    var result = { }
    Message.find ({ isBroadcast: true })
      .sort ('id DESC')
      .limit (limit)
      .populate ('sender')
      .then (function (messages) {
        result.messages = messages.map (function (message) {
          return { id: message.id,
                   title: message.title || parseTree.summarizeExpansion (message.body),
                   sender: (message.sender
                            ? { id: message.sender.id,
                                displayName: message.sender.displayName }
                            : undefined),
                   tweeter: message.tweeter,
                   avatar: message.avatar,
                   date: message.createdAt }
        })
        var sailsSocketsJoin = Promise.promisify (sails.sockets.join)
        return sailsSocketsJoin (req, 'news')
          .then (function() {
            res.json (result)
          })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get message
  getMessage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var messageID = Message.parseID (req.params.message)
    var result = {}
    Message.findOne ({ id: messageID,
                       or: [{ isBroadcast: true },
                            { recipient: playerID,
                              recipientDeleted: false },
                            { sender: playerID,
                              senderDeleted: false }] })
      .populate ('template')
      .populate ('sender')
      .populate ('recipient')
      .populate ('replies')
      .then (function (message) {
        var authorPromise
        if (message)
          authorPromise = PlayerService.getPlayersById ([message.template.author])
            .then (function (authorById) {
              var author = authorById[message.template.author] || {}
              result.message = { id: message.id,
                                 previous: message.previous,
                                 next: message.replies.map (function (reply) {
                                   return reply.id
                                 }),
                                 sender: (message.sender
                                          ? { id: message.sender.id,
                                              name: message.sender.name,
                                              displayName: message.sender.displayName }
                                          : null),
                                 recipient: (message.recipient
                                             ? { id: message.recipient.id,
                                                 name: message.recipient.name,
                                                 displayName: message.recipient.displayName }
                                             : undefined),
                                 template: { id: message.template.id,
                                             content: message.template.content,
                                             author: { id: message.template.author,
                                                       name: author.name,
                                                       displayName: author.displayName },
                                             tags: message.template.tags },
			         tweeter: message.tweeter,  // == author.twitterScreenName, denormalized
                                 avatar: message.avatar,  // == author.avatar, denormalized
			         tweet: message.tweetId,
                                 title: message.title,
                                 vars: message.initVarVal,
                                 body: message.body,
                                 date: message.createdAt }
            })
        else
          authorPromise = Promise.resolve()
        var updatedPromise
        if (message && !message.read && message.recipient && message.recipient.id === playerID)
          updatedPromise = function() {
	    return Message.update ({ id: messageID },
                                   { read: true })
	  }
        else
          updatedPromise = function() { return Promise.resolve() }
        return authorPromise
          .then (updatedPromise)
          .then (function() {
            res.json (result)
          })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // unsubscribe from broadcasts
  unsubscribeBroadcasts: function (req, res) {
    var sailsSocketsLeave = Promise.promisify (sails.sockets.leave)
    sailsSocketsLeave (req, 'news')
      .then (function() {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get received message header
  getReceivedMessageHeader: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var messageID = Message.parseID (req.params.message)
    var result = {}
    Message.findOne ({ recipient: playerID,
                       id: messageID,
                       recipientDeleted: false })
      .populate ('sender')
      .then (function (message) {
        result.message = { id: message.id,
                           title: message.title || parseTree.summarizeExpansion ({ type: 'root',
                                                                                   rhs: message.body.rhs }),
                           sender: { id: message.sender.id,
                                     name: message.sender.name,
                                     displayName: message.sender.displayName },
			   tweeter: message.tweeter,
                           avatar: message.avatar,
                           date: message.createdAt,
                           unread: !message.read }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // send message
  sendMessage: function (req, res) {
    PlayerService.sendMessage ({
      playerID: req.session && req.session.passport ? (req.session.passport.user || null) : null,
      recipientID: req.body.recipient ? Player.parseID (req.body.recipient) : null,
      player: req.user,
      template: req.body.template,
      title: req.body.title,
      body: req.body.body,
      previous: req.body.previous,
      tags: req.body.tags,
      previousTags: req.body.previousTags,
      draftID: Draft.parseID (req.body.draft),
      isPublic: req.body.isPublic || false
    }).then (function (result) {
      res.json (result)
    }).catch (function (err) {
      console.log(err)
      res.status(500).send ({ message: err })
    })
  },

  // delete message
  deleteMessage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var messageID = Message.parseID (req.params.message)
    Message.findOne ({ id: messageID,
                       or: [ { sender: playerID },
                             { recipient: playerID } ] })
      .populate ('template')
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
          .then (function() {
            return Player.update ({ botMessage: message.id },
                                  { botMessage: null })
          }).then (function() {
            return Template.update ({ id: message.template.id },
                                    { isPublic: false })
          })
      }).then (function() {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get drafts
  getDrafts: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var result = {}
    Draft.find ({ sender: playerID })
      .populate ('recipient')
      .then (function (drafts) {
        result.drafts = drafts.map (function (draft) {
          return { id: draft.id,
                   title: draft.title,
                   recipient: draft.recipient && { id: draft.recipient.id,
                                                   displayName: draft.recipient.displayName },
                   date: draft.updatedAt }
        })
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // get draft
  getDraft: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var player = req.user
    var draftID = Draft.parseID (req.params.draft)
    var result = {}
    Draft.findOne ({ id: draftID,
                     sender: playerID })
      .populate ('recipient')
      .populate ('previous')
      .then (function (draft) {
        result.draft = { id: draft.id,
                         recipient: draft.recipient && { id: draft.recipient.id,
                                                         name: draft.recipient.name,
                                                         displayName: draft.recipient.displayName },
                         previous: draft.previous ? draft.previous.id : null,
                         previousTemplate: draft.previousTemplate,
                         tags: draft.tags,
                         previousTags: draft.previousTags,
                         template: draft.template,
                         title: draft.title,
                         vars: (draft.previous
                                ? VarsHelper.nextVarVal ({ node: draft.previous.body,
                                                           initVarVal: draft.previous.initVarVal,
                                                           sender: player,
                                                           recipient: draft.recipient },
                                                        parseTree)
                                : VarsHelper.defaultVarVal (player, draft.recipient, draft.tags)),
                         body: draft.body,
                         date: draft.updatedAt }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // save draft
  saveDraft: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var player = req.user, recipient
    var draft = req.body.draft
    var result = {}
    return Draft.create ({ sender: playerID,
                           recipient: draft.recipient,
                           previous: draft.previous,
                           previousTemplate: draft.previousTemplate,
                           tags: draft.tags,
                           previousTags: draft.previousTags,
                           template: draft.template,
                           title: draft.title,
                           body: draft.body })
      .then (function (created) {
        result.draft = { id: created.id }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // update draft
  updateDraft: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var draftID = Draft.parseID (req.params.draft)
    var draft = req.body.draft
    Draft.update ({ id: draftID,
                    sender: playerID },
                  draft)
      .then (function (updated) {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // delete draft
  deleteDraft: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var draftID = Draft.parseID (req.params.draft)
    Draft.destroy ({ id: draftID,
                     sender: playerID })
      .then (function (destroyed) {
        res.ok()
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get all symbols owned by a player
  getSymbolsByOwner: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var result = { owner: playerID }
    Player.findOne ({ id: playerID })
      .then (function (player) {
        if (!playerID || !player) {
          // if no player was specified, silently return an empty list, rather than returning all unowned symbols
          result.symbols = []
          return []
        }
        return Symbol.find ({ owned: true,
                              owner: playerID })
          .then (function (symbols) {
            result.symbols = symbols.map (function (symbol) {
              symbol.owner = player
              return { id: symbol.id,
                       owner: SymbolService.makeOwnerID (symbol),
                       rules: symbol.rules }
            })
            Symbol.subscribe (req, symbols.map (function (symbol) { return symbol.id }))
            return SymbolService.resolveReferences (symbols)
          })
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
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var result = {}
    var gotPlayerID = (playerID ? true : false)
    var symInfo = { owned: gotPlayerID,
                    owner: playerID }
    if (req.body.symbol) {
      var name = req.body.symbol.name
      var rules = req.body.symbol.rules
      var copiedSymbolId = typeof(req.body.symbol.copy) !== 'undefined' ? Symbol.parseID(req.body.symbol.copy) : null
      var copiedSymbol = copiedSymbolId ? Symbol.cache.byId[copiedSymbolId] : null
        
      if (rules && !SchemaService.validateRules (rules, res.badRequest.bind(res)))
        return

      if (copiedSymbol && !rules) {
        // for all "downstream" symbols that are used by copiedSymbol, and have player-owned copies (downstreamCopy), change downstream->downstreamCopy in rules for new symbol
        var dsCache = {}  // cache the mapping to ensure it's consistent
        rules = copiedSymbol.rules.map (function (rhs) {
          var rhsCopy = deepcopy(rhs)
          parseTree.getSymbolNodes(rhsCopy)
            .forEach (function (rhsSym) {
              var downstreamSymbol = (rhsSym.id
                                      ? Symbol.cache.byId[rhsSym.id]
                                      : Symbol.cache.byName[rhsSym.name])
              if (downstreamSymbol && downstreamSymbol.owner !== playerID) {
                if (dsCache[downstreamSymbol.id]) {  // cached?
                  rhsSym.id = dsCache[downstreamSymbol.id]
                  delete rhsSym.name
                } else {
                  var downstreamSymbolCopies = Symbol.getCopies (downstreamSymbol.id)
                      .filter (function (sym) { return sym.owner === playerID })
                  if (downstreamSymbolCopies.length) {
                    var downstreamSymbolCopy = downstreamSymbolCopies[0]
                    dsCache[downstreamSymbol.id] = downstreamSymbolCopy.id
                    rhsSym.id = downstreamSymbolCopy.id
                    delete rhsSym.name
                  }
                }
              }
            })
          return rhsCopy
        })
      }
      var initialized = (rules && rules.length > 0)
        
      extend (symInfo, { name: name,
                         copied: copiedSymbolId,
                         rules: rules,
                         initialized: initialized })
      
      Symbol.create (symInfo)
        .then (function (symbol) {
          result.symbol = { id: symbol.id,
                            owner: { id: playerID },
                            rules: symbol.rules }
          result.name = {}
          result.name[symbol.id] = symbol.name

          var revisions = [], symbolUpdate = {}
          if (copiedSymbol && copiedSymbol.owner !== playerID) {
            // for all "upstream" symbols that use copiedSymbol, and are owned by the player, change copiedSymbol->newSymbol in rules for upstream symbol
            Symbol.getUsingSymbols(copiedSymbol.name).forEach (function (upstreamSymbol) {
              if (upstreamSymbol.owner === playerID) {
                var newRules = upstreamSymbol.rules.map (function (rhs) {
                  var rhsCopy = deepcopy(rhs)
                  parseTree.getSymbolNodes(rhsCopy).forEach (function (rhsSym) {
                    if (rhsSym.id === copiedSymbol.id || rhsSym.name === copiedSymbol.name) {
                      rhsSym.id = symbol.id
                      delete rhsSym.name
                    }
                  })
                  return rhsCopy
                })
                symbolUpdate[upstreamSymbol.id] = { rules: newRules }
                revisions.push ({ symbol: upstreamSymbol.id,
                                  author: playerID,
                                  authored: gotPlayerID,
                                  rules: deepcopy(newRules) })
              }
            })
          }

          revisions.push (initialized
                          ? { symbol: symbol.id,
                              name: symbol.name,
                              owner: playerID,
                              owned: gotPlayerID,
                              firstRevision: true,
                              author: playerID,
                              authored: gotPlayerID,
                              transferable: symbol.transferable,
                              summary: symbol.summary,
                              rules: deepcopy(symbol.rules) }
                          : { symbol: symbol.id,
                              name: symbol.name,
                              firstRevision: true,
                              owned: gotPlayerID,
                              owner: playerID,
                              author: playerID,
                              authored: gotPlayerID })

          return SymbolService.resolveReferences ([symbol])
            .then (function (names) {
              extend (result.name, names)
              return playerID ? Player.findOne({id:playerID}) : Promise.resolve()
            }).then (function (player) {
              return Promise.all (Object.keys(symbolUpdate).map (function (upstreamSymbolId) {
                return Symbol.update ({ id: upstreamSymbolId },
                                      symbolUpdate[upstreamSymbolId])
                  .then (function (update) {
                    var upstreamSymbol = Symbol.cache.byId[upstreamSymbolId]
                    Symbol.message (upstreamSymbolId,
                                    { message: "update",
                                      symbol: { id: upstreamSymbolId,
                                                name: upstreamSymbol.name,
                                                owner: (player
                                                        ? { id: player.id,
                                                            name: player.name }
                                                        : null),
                                                rules: upstreamSymbol.rules,
                                                initialized: true },
                                      name: result.name })
                  })
              }))
            }).then (function() {
              return Revision.createEach (revisions)
            }).then (function() {
              Symbol.subscribe (req, [symbol.id])
              res.json (result)
            })
        }).catch (function (err) {
          console.log(err)
          res.status(500).send ({ message: err })
        })
      }
  },
  
  // get a particular symbol
  getSymbol: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    var result = {}
    Symbol.findOneCached ({ id: symbolID })
      .then (function (symbol) {
        if (symbol)
          return SymbolService.makeSymbolInfo (symbol, playerID)
          .then (function (result) {
            Symbol.subscribe (req, [symbolID])
            res.json (result)
          }).catch (function (err) {
            console.log(err)
            res.status(500).send ({ message: err })
          })
        res.status(500).send ({ message: "Symbol not found" })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get recent revisions of a symbol
  getRecentSymbolRevisions: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    var resultsPerPage = req.params.n ? parseInt(req.params.n) : 10
    var page = req.params.page ? parseInt(req.params.page) : 0
    var result = { }
    Symbol.find ({ id: symbolID })
      .then (function (symbol) {
        if (!symbol.owned || symbol.owner === playerID || !symbol.summary)
          return Revision.find ({ symbol: symbolID })
          .sort ('number DESC')
          .skip (page * resultsPerPage)
          .limit (resultsPerPage + 1)
        return []
      }).then (function (revisions) {
        if (revisions.length > resultsPerPage) {
          revisions = revisions.slice (0, resultsPerPage)
          result.more = true
        }
        return Player.find
        ({ id: revisions.filter
           (function (revision) {
             return revision.author
           }).map (function (revision) {
             return revision.author
           })
         }).then (function (players) {
           var playerName = {}
           if (players)
             players.forEach (function (player) {
               playerName[player.id] = player.name
             })
           result.revisions = revisions.map (function (revision, n) {
             var summary = RevisionService.makeRevisionSummary (revision, playerName)
             if (page === 0 && n === 0)
               summary.current = true
             return summary
           })
           res.json (result)
         })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  getSymbolRevision: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    var revisionID = Symbol.parseID (req.params.revid)
    var result = {}
    Symbol.findOne ({ id: symbolID })
      .then (function (symbol) {
        if (!symbol.owned || symbol.owner === playerID || !symbol.summary)
          return Revision.findOne ({ id: revisionID,
                                  symbol: symbolID })
          .then (function (revision) {
            if (revision)
              result.revision = RevisionService.makeRevisionInfo (revision)
          })
      }).then (function() {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  getSymbolRevisionDiff: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    var revisionID = Symbol.parseID (req.params.revid)
    var result = {}
    Symbol.findOne ({ id: symbolID })
      .then (function (symbol) {
        if (!symbol.owned || symbol.owner === playerID || !symbol.summary)
          return Revision.findOne ({ id: revisionID,
                                     symbol: symbolID })
          .then (function (revision) {
            result.revision = RevisionService.makeRevisionInfo (revision)
            result.diff = RevisionService.makeDiff (revision, symbol)
          })
      }).then (function() {
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },
  
  // get links (uses, used by, copies, copied by) for a symbol
  getSymbolLinks: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    var result = {}
    Symbol.findOneCached ({ id: symbolID })
      .then (function (symbol) {
        if (symbol)
          return SymbolService.makeSymbolLinks (symbol, playerID)
          .then (function (result) {
            res.json (result)
          }).catch (function (err) {
            console.log(err)
            res.status(500).send ({ message: err })
          })
        res.status(500).send ({ message: "Symbol not found" })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // get a particular symbol by name, or create it (uninitialized)
  getOrCreateSymbolByName: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolName = req.params.symname
    var result = {}
    Symbol.findOneCached ({ name: symbolName })
      .then (function (symbol) {
        if (symbol)
          return symbol
        else
          return Symbol.create ({ name: symbolName,
                                  rules: [[symbolName.replace(/_/g,' ')]],
                                  owned: false,
                                  owner: null })
      }).then (function (symbol) {
        return SymbolService.makeSymbolInfo (symbol, playerID)
      }).then (function (result) {
        Symbol.subscribe (req, [result.symbol.id])
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // store a particular symbol
  putSymbol: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var gotPlayerID = (playerID ? true : false)
    var symbolID = Symbol.parseID (req.params.symid)
    var name = req.body.name
    var rules = req.body.rules
    if (SchemaService.validateRules (rules, res.badRequest.bind(res))) {
      var update = extend ({ initialized: true },
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
            return Symbol.findOne ({ id: symbolID,
                                     or: ([ { owned: false } ].concat
                                          (playerID
                                           ? [{ owned: true,
                                                owner: playerID }]
                                           : [])) })
          }).then (function (symbol) {
            result.name[symbolID] = name
            if (symbol.transferable) {
              symbol.owned = update.owned = gotPlayerID
              symbol.owner = update.owner = playerID
            }

            if (JSON.stringify(rules) === JSON.stringify(symbol.rules))
              return Promise.resolve()

            var revision = { symbol: symbolID,
                             rules: rules,
                             name: name,
                             author: playerID,
                             authored: gotPlayerID,
                             owned: symbol.owned,
                             owner: symbol.owner }

            return Revision.create (revision)
          }).then (function() {
            var query = { id: symbolID }
            if (name)
              query.or = [{ name: name },
                          { renamable: true }]
            return Symbol.update (query,
                                  update)
          }).then (function (symbol) {
            return Player.findOne ({ id: playerID })
          }).then (function (player) {
            if (player)
              result.symbol.owner.name = player.name
            Symbol.message (symbolID, extend ({ message: "update" },
                                              result))
            res.json (result)
          }).catch (function (err) {
            console.log(err)
            res.status(500).send ({ message: err })
          })
      }
    }
  },

  // release ownership of a symbol
  releaseSymbol: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var symbolID = Symbol.parseID (req.params.symid)
    Symbol.update ({ id: symbolID,
                     owned: true,
                     owner: playerID },
                   { owned: false,
                     owner: null,
                     transferable: false })
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
    var playerID = req.session && req.session.passport ? req.session.passport.user : null
    Player.subscribe (req, [playerID])
    res.ok()
  },

  // unsubscribe from notifications for a player
  unsubscribePlayer: function (req, res) {
    var playerID = req.session && req.session.passport ? req.session.passport.user : null
    Player.unsubscribe (req, [playerID])
    res.ok()
  },

  // unsubscribe from notifications for a symbol
  unsubscribeSymbol: function (req, res) {
    var symbolID = Symbol.parseID (req.params.symid)
    Symbol.unsubscribe (req, [symbolID])
    res.ok()
  },

  // get a particular template
  getTemplate: function (req, res) {
    var playerID = req.session && req.session.passport ? (req.session.passport.user || null) : null
    var templateID = Template.parseID (req.params.template)
    var result = {}
    Template.findOne ({ id: templateID,
                        or: [{ author: playerID },
                             { isPublic: true }] })
      .populate ('author')
      .then (function (template) {
        if (template)
          result.template = { id: template.id,
                              content: template.content,
                              title: template.title,
			      tweeter: template.author ? template.author.twitterScreenName : null,
			      avatar: template.author ? template.author.avatar : null,
                              author: (template.author
                                       ? { id: template.author.id,
                                           name: template.author.name,
                                           displayName: template.author.displayName }
                                       : undefined),
                              tags: template.tags,
                              previousTags: template.previousTags }
        res.json (result)
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // expand a Bracery parse tree using the grammar
  expandContent: function (req, res) {
    SymbolService.expandContent ({ rhs: req.body.content,
                                   rhsText: req.body.text,
                                   vars: req.body.vars })
      .then (function (expansion) {
        res.json ({ expansion: expansion })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // suggest best N templates
  suggestTemplates: function (req, res) {
    return TemplateService.suggestTemplates()
      .then (function (templates) {
        res.json ({ templates: templates })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // suggest best N templates by a particular author
  suggestTemplatesBy: function (req, res) {
    return TemplateService.suggestTemplates ({ author: req.params.author })
      .then (function (templates) {
        res.json ({ templates: templates })
      }).catch (function (err) {
        console.log(err)
        res.status(500).send ({ message: err })
      })
  },

  // suggest random reply
  suggestReply: function (req, res) {
    var playerID = req.session && req.session.passport ? req.session.passport.user : null
    var previousID = Template.parseID (req.params.template)
    var tagArray = PlayerService.makeTagArray (req.param('tags',''))
    var query = Template.find ({ or: [{ author: playerID },
                                      { isPublic: true }] })
        .where ({ or: [{ previous: previousID }]
                  .concat (tagArray.map (function (tag) {
		    return { previousTags: { contains: ' ' + tag + ' ' } }
                  })) })
    return query
      .populate ('author')
      .then (function (templates) {
        // exclude templates whose previousTags include '!tag' or '-tag' (for any of our tags)
        // this would probably be more efficiently done in the query, but Waterline doesn't seem to support negation of 'contains' queries
        templates = templates.filter (function (template) {
          return !tagArray.reduce (function (foundExcludedTag, tag) {
            return foundExcludedTag || (template.previousTags.indexOf (' !' + tag + ' ') >= 0) || (template.previousTags.indexOf (' -' + tag + ' ') >= 0)
          }, false)
        })
        // exclude templates whose previousTags include '+tag' for any tags that we don't have
        templates = templates.filter (function (template) {
          var tempPrevTags = template.previousTags.split()
          return !tempPrevTags.reduce (function (missingRequiredTag, tempPrevTag) {
            return missingRequiredTag || (tempPrevTag[0] === '+' && tagArray.indexOf(' ' + tempPrevTag.substr(1) + ' ') < 0)
          }, false)
        })
        // exclude authors who have noMailUnlessFollowed set, unless they follow the original template author
        var isShyAuthor = {}, isPrivateAuthor = {}
        templates.forEach (function (template) {
          var authorID = template.author.id
          if (authorID !== playerID) {
            if (!template.author.createsPublicTemplates)
              isPrivateAuthor[authorID] = true
            else if (template.author.noMailUnlessFollowed)
              isShyAuthor[authorID] = true
          }
        })
        templates = templates.filter (function (template) {
          return !isPrivateAuthor[template.author.id]
        })
        var shyAuthors = Object.keys(isShyAuthor)
        if (!shyAuthors.length)
          return templates
        return Template.findOne ({ id: previousID })
          .then (function (previousTemplate) {
            return Follow.find ({ followed: previousTemplate.author })
              .where ({ or: shyAuthors.map (function (shyAuthor) { return { follower: shyAuthor } }) })
          }).then (function (follows) {
            if (follows)
              follows.forEach (function (follow) {
                delete isShyAuthor[follow.follower]
              })
            return templates.filter (function (template) {
              return !isShyAuthor[template.author.id]
            })
          })
      }).then (function (templates) {
        // sample by weight
        var result = {}
        if (templates.length) {
          var templateWeight = templates.map (function (template) {
            return template.weight
          })
          var template = templates[SortService.sampleByWeight (templateWeight)]
          result.template = { id: template.id,
                              title: template.title,
			      tweeter: template.author ? template.author.twitterScreenName : null,
			      avatar: template.author ? template.author.avatar : null,
                              author: (template.author
                                       ? { id: template.author.id,
                                           name: template.author.name,
                                           displayName: template.author.displayName }
                                       : undefined),
			      tags: template.tags,
			      previousTags: template.previousTags,
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
            return adjCache[symbolID] || pseudocount
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
