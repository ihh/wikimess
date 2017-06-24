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

  // helpers
  // this helper (responseSender) is rather pointless, should probably be refactored out
  // or at least created dynamically when needed and not passed around (inconsistently) as it currently is
  responseSender: function (res) {
    return function (err, json) {
      if (err) {
        console.log (err)
        res.send (500, typeof(err) === 'object' ? err.toString() : err)
      } else
        res.json (json)
    }
  },

  findPlayer: function (req, res, makeJson, assocs) {
    return PlayerService.findPlayerByID (req.params.player, res, makeJson, assocs)
  },

  findOther: function (req, res, makeJson, assocs) {
    return PlayerService.findPlayerByID (req.params.other, res, makeJson, assocs)
  },

  findPlayerByID: function (id, res, makeJson, assocs) {
    var rs = PlayerService.responseSender (res)
    var query = Player.findById (id)
    if (assocs)
      assocs.forEach (function (assoc) {
        query.populate (assoc)
      })
    query.exec (function (err, players) {
      if (err)
        rs(err)
      else if (players.length != 1)
        res.status(404).send("Player " + id + " not found")
      else
        makeJson (players[0], rs)
    })
  },
  
  capitalize: function (text) {
    return text.charAt(0).toUpperCase() + text.substr(1)
  },

  makeStatus: function (info) {
    var rs = info.rs, player = info.player, follower = info.follower, local = info.local, isPublic = info.isPublic

    var status = { id: player.id,
                   name: player.displayName,
                   nSenderRatings: player.nSenderRatings,
                   sumSenderRatings: player.sumSenderRatings,
                   nAuthorRatings: player.nAuthorRatings,
                   sumAuthorRatings: player.sumAuthorRatings,
                   sumAuthorRatingWeights: player.sumAuthorRatingWeights,
                   human: player.human }

    if (follower) {
      var seenEventId = {}
      Follow.find ({ follower: follower.id, followed: player.id })
      .then (function (follows) {
        status.following = (follows.length > 0)
        rs (null, status)
      }).catch (rs)
    } else
      rs (null, status)
  },

  makePlayerSummary: function (player, following) {
    return { id: player.id,
             human: player.human,
             name: player.displayName,
             following: following }
  }
}
