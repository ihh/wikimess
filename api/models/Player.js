/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var bcrypt = require('bcrypt');

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
          unique: true,
          required: true
      },

      password: {
            type: 'string',
//            minLength: 6,
            required: true
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

      // attributes to manage joining games
      waiting: {  // true if waiting to join a game
          type: 'boolean',
          defaultsTo: false
      }
  },

    beforeCreate: function(player, cb) {
        bcrypt.genSalt(10, function(err, salt) {
            bcrypt.hash(player.password, salt, function(err, hash) {
                if (err) {
                    console.log(err);
                    cb(err);
                } else {
                    player.password = hash;
                    cb();
                }
            });
        });
    }
};
