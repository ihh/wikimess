/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
      id: {
          type: 'integer',
          autoIncrement: true,
          unique: true,
          primaryKey: true
      },

      name: {
          type: 'string',
          unique: true
      },

      // global stats for this player
      cash: {
          type: 'integer',
          defaultsTo: 0
      },
      
      // references to games
      player1games: {
          collection: 'game',
          via: 'player1'
      },

      player2games: {
          collection: 'game',
          via: 'player2'
      },

      // get all games for a player
      games: function (opts, cb) {

          var player = opts.player

          // Before doing anything else, check if a primary key value
          // was passed in instead of a record, and if so, lookup which
          // person we're even talking about:
          (function _lookupPlayerIfNecessary(afterLookup) {
              // (this self-calling function is just for concise-ness)
              if (typeof player === 'object') return afterLookup(null, player)
              Player.findOne(player).exec(afterLookup)
          })(function (err, player){
              if (err) return cb(err)
              if (!player) {
                  err = new Error()
                  err.message = require('util').format('Cannot find games for player w/ id=%s because that player does not exist.', player)
                  err.status = 404
                  return cb(err)
              }

              cb (player.player1games.concat (player.player2games))
          })
      },
      
      // attributes to manage joining games
      waiting: {  // true if waiting to join a game
          type: 'boolean',
          defaultsTo: false
      },
      waitingSince: { type: 'datetime' }  // time they started waiting
  }
};
