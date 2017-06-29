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

    // login info
    name: {
      type: 'string',
      unique: true
    },
    
    password: {
      type: 'string',
      //            minLength: 6,
      required: true
    },

    // bio
    displayName: {
      type: 'string'
    },

    gender: {
      type: 'string',
      enum: ['male', 'female', 'neither', 'secret'],
      defaultsTo: 'secret'
    },

    publicBio: { type: 'string' },
    privateBio: { type: 'string' },
    
    // privacy controls
    noMailUnlessFollowed: { type: 'boolean', defaultsTo: false },
    createsPublicTemplates: { type: 'boolean', defaultsTo: false },
    
    // social networks
    facebookId: {
      type: 'string',
      required: false,
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

  maxNameLen: 16,

  initAdmin: function() {
    return Player.find()
      .then (function (players) {
        return players.length
          ? true
          : Player.create ({ id: Player.adminUserId,
                             name: 'admin',
                             password: 'admin',
                             admin: true })
      })
  },
  adminUserId: 1,

  hashPassword: function (password, cb) {
    bcrypt.genSalt(10, function(err, salt) {
      bcrypt.hash(password, salt, function(err, hash) {
        if (err) {
          console.log(err);
          cb(err);
        } else {
          cb(null,hash);
        }
      });
    })
  },
  
  beforeCreate: function(player, cb) {
    player.displayName = player.displayName || player.name
    Player.hashPassword (player.password, function (err, hash) {
      player.password = hash
      cb()
    })
  },
};
