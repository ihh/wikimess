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
  
  capitalize: function (text) {
    return text.charAt(0).toUpperCase() + text.substr(1)
  },

  makeStatus: function (info) {
    var player = info.player || {}, follower = info.follower, messages = info.messages, before = info.before, limit = info.limit || 10
    
    var status = {}
    if (!before)
      extend (status,
              { id: player.id,
                name: player.name,
                displayName: player.displayName,
                gender: player.gender,
                publicBio: player.publicBio,
                nSenderRatings: player.nSenderRatings,
                sumSenderRatings: player.sumSenderRatings,
                nAuthorRatings: player.nAuthorRatings,
                sumAuthorRatings: player.sumAuthorRatings,
                sumAuthorRatingWeights: player.sumAuthorRatingWeights,
                searchable: player.searchable })

    if (follower) {
      if (!player.noMailUnlessFollowed)
        status.reachable = true

      var followPromise
      if (before)
        followPromise = Promise.resolve(true)
      else
        followPromise = Follow.find ({ or: [{ follower: follower.id, followed: player.id },
                                            { followed: follower.id, follower: player.id }] })
        .then (function (follows) {
          follows.forEach (function (follow) {
            if (follow.follower === follower.id && follow.followed === player.id)
              status.following = true
            else if (follow.followed === follower.id && follow.follower === player.id) {
              status.privateBio = player.privateBio
              status.reachable = true
            }
          })
        })
      
      var messagePromise
      if (messages) {
       var query = { or: [{ sender: player.id, recipient: follower.id, recipientDeleted: false },
                          { sender: follower.id, recipient: player.id, senderDeleted: false }] }
        if (before)
          query.id = { '<': before }
        messagePromise = Message.find (query)
          .sort ('id DESC')
          .limit (limit + 1)
          .then (function (msgs) {
            if (msgs.length > limit) {
              msgs.pop()
              status.more = true
            }
            status.messages = msgs.map (function (message) {
              var toFollower = message.recipient === follower
              return { id: message.id,
                       sender: message.sender,
                       body: message.body,
                       date: message.createdAt,
                       rating: toFollower ? message.rating : undefined }
            })
            var messagesToFollower = msgs.filter (function (m) { return m.recipient === follower })
            return Message.update ({ id: messagesToFollower.map (function (m) { return m.id }) },
                                   { read: true })
          }).then (function() {
            if (!before)
              return Draft.find ({ sender: follower.id,
                                   recipient: player.id })
              .sort('createdAt ASC')
              .limit(1)
              .then (function (drafts) {
                if (drafts.length) {
                  var draft = drafts[0]
                  status.draft = { id: draft.id,
                                   template: draft.template,
                                   body: draft.body }
                }
              })
          })
      }

      return followPromise
        .then (function() {
          return messagePromise
        }).then (function() {
          return status
        })
    } else {
      status.privateBio = player.privateBio
      return Promise.resolve (status)
    }
  },

  makePlayerSummary: function (player, following) {
    return { id: player.id,
             searchable: player.searchable,
             name: player.name,
             displayName: player.displayName,
             reachable: !player.noMailUnlessFollowed,
             following: following }
  },

  makeLoginSummary: function (player) {
    return player && { id: player.id,
                       name: player.name,
                       displayName: player.displayName,
                       hidePassword: (player.facebookId || player.twitterId) ? true : false,
                       noMailUnlessFollowed: player.noMailUnlessFollowed,
                       publicBio: player.publicBio,
                       privateBio: player.privateBio,
                       gender: player.gender
                     }
  },

  makeHomepage: function (playerID) {
    var homepagePromise, vars = { init: false }, result = { vars: vars }
    if (playerID)
      homepagePromise = Player.findOne({ id: playerID })
      .then (function (player) {
        if (player) {
          vars.init = true
          vars.initConfig = { player: PlayerService.makeLoginSummary (player) }
          result.player = player
        }
        return result
      })
    else
      homepagePromise = Promise.resolve (result)
    return homepagePromise
  },
  
  makeUniquePlayerName: function (prefix, count) {
    prefix = prefix.replace (/[^A-Za-z0-9_]/g, '')
    var suffix = (count || '').toString()
    var trialName = prefix.substr (0, Player.maxNameLen - suffix.length) + suffix
    return Player.find ({ name: trialName })
      .then (function (players) {
        if (players.length)
          return PlayerService.makeUniquePlayerName (prefix, (count || 0) + 1)
        return trialName
      })
  },

  sendMessage: function (config) {
    var playerID = config.playerID || null
    var recipientID = config.recipientID || null
    var template = config.template
    var title = config.title
    var body = config.body
    var previous = config.previous
    var tags = config.tags || ''
    var previousTags = config.previousTags || ''
    var draftID = Draft.parseID (config.draft)
    var isPublic = config.isPublic || false
    var result = {}, notification = {}
    // check that the recipient is reachable
    var reachablePromise
    if (recipientID === null)
      reachablePromise = Promise.resolve()
    else
      reachablePromise = Follow.find ({ follower: recipientID,
                                        followed: playerID })
      .then (function (follows) {
        if (!follows.length)
          return Player.find ({ id: recipientID,
                                noMailUnlessFollowed: false })
          .then (function (players) {
            if (!players.length)
              throw new Error ("Recipient unreachable")
          })
      })
    return reachablePromise.then (function() {
      // find, or create, the template
      var templatePromise
      if (typeof(template.id) !== 'undefined')
        templatePromise = Template.findOne ({ id: template.id,
                                              or: [{ author: playerID },
                                                   { isPublic: true }] })
      else {
        // impose limits
        SymbolService.imposeSymbolLimit ([template.content], Symbol.maxTemplateSyms)
        // find previous Message
        var previousPromise = (typeof(previous) === 'undefined'
                               ? new Promise (function (resolve, reject) { resolve(null) })
                               : (Message.findOne ({ id: previous })
                                  .populate ('template')
                                  .then (function (message) { return message.template })))
        templatePromise = previousPromise.then (function (previousTemplate) {
          // create the Template
          var content = template.content
          return Template.create ({ title: title,
                                    author: playerID,
                                    content: content,
                                    previous: previousTemplate,
                                    tags: tags.split(/\s+/).filter (function (tag) { return tag !== '' }).join(' '),
                                    previousTags: ' ' + previousTags + ' ',
                                    isRoot: (previousTemplate ? false : true),
                                    isPublic: isPublic })
            .then (function (template) {
              // this is a pain in the arse, but Waterline's create() method unwraps single-element arrays (!??!?#$@#?) so we have to do an update() to be sure
              return Template.update ({ id: template.id },
                                      { content: content })
                .then (function() {
                  return template
                })
            })
        })
      }
      return templatePromise.then (function (template) {
        result.template = { id: template.id }
        // create the Message
        return Message.create ({ sender: playerID,
                                 recipient: recipientID,
                                 isBroadcast: !recipientID,
                                 template: template,
                                 previous: previous,
                                 title: title,
                                 body: body })
      }).then (function (message) {
        result.message = { id: message.id }
        notification.message = "incoming"
        notification.id = message.id
        // delete the Draft
        var draftPromise
        if (draftID)
          draftPromise = Draft.destroy ({ id: draftID,
                                          sender: playerID })
        else
          draftPromise = Promise.resolve()
        return draftPromise
      }).then (function() {
        if (recipientID === null)
          result.message.path = '/m/' + result.message.id  // broadcast; give sender a URL to advertise
        else
          Player.message (recipientID, notification)    // send the good news to recipient
        return result
      })
    })
  }
}
