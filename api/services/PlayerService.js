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
    var player = info.player, follower = info.follower, messages = info.messages, before = info.before, limit = info.limit || 10
    
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
                human: player.human })

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
             human: player.human,
             name: player.name,
             displayName: player.displayName,
             reachable: !player.noMailUnlessFollowed,
             following: following }
  },

  makeLoginSummary: function (player) {
    return player && { id: player.id,
                       name: player.name,
                       displayName: player.displayName,
                       hidePassword: player.facebookId ? true : false,
                       noMailUnlessFollowed: player.noMailUnlessFollowed,
                       publicBio: player.publicBio,
                       privateBio: player.privateBio,
                       gender: player.gender
                     }
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
}
