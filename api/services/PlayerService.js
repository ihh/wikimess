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
    var player = info.player, follower = info.follower, isPublic = info.isPublic

    var status = { id: player.id,
                   name: player.name,
                   displayName: player.displayName,
                   gender: player.gender,
                   publicBio: player.publicBio,
                   nSenderRatings: player.nSenderRatings,
                   sumSenderRatings: player.sumSenderRatings,
                   nAuthorRatings: player.nAuthorRatings,
                   sumAuthorRatings: player.sumAuthorRatings,
                   sumAuthorRatingWeights: player.sumAuthorRatingWeights,
                   human: player.human }

    if (follower) {
      if (!player.noMailUnlessFollowed)
        status.reachable = true
      return Follow.find ({ or: [{ follower: follower.id, followed: player.id },
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
    return { id: player.id,
             name: player.name,
             displayName: player.displayName,
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
