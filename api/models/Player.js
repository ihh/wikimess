/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var bcrypt = require('bcrypt');

module.exports = {

  primaryKey: 'id',

  attributes: {
    id: {
      type: 'number',
      autoIncrement: true,
      unique: true
    },

    // login info
    name: {
      type: 'string',
      unique: true
    },
    
    password: {
      type: 'string',
      // minLength: 6,
      // required: true
    },

    // bio
    displayName: {
      type: 'string'
    },

    gender: {
      type: 'string',
      isIn: ['male', 'female', 'neither', 'secret']
    },

    publicBio: { type: 'string' },
    privateBio: { type: 'string' },

    avatar: { type: 'string' },
    
    // privacy controls
    noMailUnlessFollowed: { type: 'boolean' },
    createsPublicTemplates: { type: 'boolean' },
    searchable: { type: 'boolean', defaultsTo: true },
    
    // social networks
    facebookId: {
      type: 'string',
      required: false,
//      unique: true
    },

    twitterId: {
      type: 'string',
      required: false,
//      unique: true
    },

    twitterScreenName: {
      type: 'string',
      required: false
    },

    twitterAccessToken: {
      type: 'string',
      required: false
    },

    twitterAccessTokenSecret: {
      type: 'string',
      required: false
    },

    // administrator?
    admin: {
      type: 'boolean'
    },
    
    // show signup flow?
    newSignUp: {
      type: 'boolean',
      defaultsTo: true
    }
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

  parseID: function (text) { return parseInt(text) },

  // Sails 0.1-style message
  message: function (id, data) {
    this.publish ({ verb: 'messaged', id: id, data: data })
  },
  
  // lifecycle callbacks
  beforeCreate: function(player, cb) {
    player.displayName = player.displayName || player.name
    player.gender = player.gender || 'secret'
    player.noMailUnlessFollowed = player.noMailUnlessFollowed || false
    player.createsPublicTemplates = player.createsPublicTemplates || false
    player.admin = player.admin || false
    player.password = player.password || ''
    Player.hashPassword (player.password, function (err, hash) {
      player.password = hash
      cb()
    })
  },
};
