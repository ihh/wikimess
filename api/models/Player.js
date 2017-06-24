/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var bcrypt = require('bcrypt');
// var Faces = require('../../assets/js/ext/facesjs/faces.js')

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

    // administrator?
    admin: {
      type: 'boolean',
      defaultsTo: false
    },
    
    // bot players
    human: {
      type: 'boolean',
      defaultsTo: true
    },
    
    newSignUp: {
      type: 'boolean',
      defaultsTo: true
    },

    // ratings
    nSenderRatings: { type: 'integer', defaultsTo: 0 },
    sumSenderRatings: { type: 'integer', defaultsTo: 0 },
    nAuthorRatings: { type: 'integer', defaultsTo: 0 },
    sumAuthorRatings: { type: 'float', defaultsTo: 0 },
    sumAuthorRatingWeights: { type: 'float', defaultsTo: 0 },
  },

  initAdmin: function() {
    return Player.find()
      .then (function (players) {
        return players.length
          ? true
          : Player.create ({ name: 'admin', password: 'admin', admin: true })
      })
  },
  
  beforeCreate: function(player, cb) {
    player.displayName = player.displayName || player.name
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
