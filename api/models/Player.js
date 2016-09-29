/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var bcrypt = require('bcrypt');
var Faces = require('../../assets/js/ext/facesjs/faces.js')

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

      displayName: {
          type: 'string'
      },
      
      password: {
            type: 'string',
//            minLength: 6,
            required: true
        },

      facebookId: {
          type: 'string',
          unique: true
      },
      
      // bot players
      human: {
          type: 'boolean',
          defaultsTo: true
      },

      botmind: {
	  type: 'json',
	  defaultsTo: {
	      strategy: 'mood',
	      swipeRightProb: { happy: .5,
		                sad: .5,
		                angry: .5,
		                surprised: .5 }
	  }
      },
      
      // global stats for this player
      global: {
          type: 'json',
          defaultsTo: {
              // a special Global indicating the player's home location
	      home: 'root'
          }
      },

      initialMood: {
	  type: 'string',
	  defaultsTo: 'happy'
      },

      avatarConfig: {
          type: 'json'
      },

      newSignUp: {
          type: 'boolean',
          defaultsTo: true
      },

      // crude locking mechanism
      lastLockTime: {
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
        player.displayName = player.displayName || player.name
        player.avatarConfig = player.avatarConfig || Faces.generateSet()
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
    },
};
