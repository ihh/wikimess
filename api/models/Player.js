/**
 * Player.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var bcrypt = require('bcrypt');

var Promise = require('bluebird')
var extend = require('extend')

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

    botMessage: {
      model: 'message'
    },

    botInterval: {
      type: 'string',
      isIn: [// 'second', 'minute',
             'hour', 'day', 'week', 'never'],
      defaultsTo: 'never'
    },
    
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
    this.publish ([id], { verb: 'messaged', id: id, data: data })
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

  // broadcasts
  broadcastTimerInterval: {
    week: 1000*60*60*24*7,
    day: 1000*60*60*24,
    hour: 1000*60*60,
//    minute: 1000*60,
//    second: 1000
  },

  setBroadcastTimers: function() {
    if (!Player.broadcastTimer) {
      Player.broadcastTimer = {}
      var intervals = Player.broadcastTimerInterval
      Object.keys(intervals).forEach (function (intervalName) {
        var interval = Player.broadcastTimerInterval[intervalName]
        function broadcast() { Player.broadcastMessages (intervalName) }
        Player.broadcastTimer[intervalName] = setInterval (broadcast, interval)
      })
    }
  },

  broadcastMessages: function (botInterval) {
    return Player.find ({ botInterval: botInterval,
                          botMessage: { '!=': null } })
      .populate ('botMessage')
      .then (function (players) {
        return Promise.each (players, function (player) {
          var botMessage = player.botMessage
          var prevMessagePromise = Message.findOne ({ id: botMessage.previous })
          return Template.findOne ({ id: botMessage.template })
            .then (function (botTemplate) {
              return SymbolService.expandContent ({ rhs: botTemplate.content,
                                                    vars: botMessage.initVarVal })
                .then (function (expansion) {
                  return prevMessagePromise.then (function (prevMessage) {
                    return PlayerService.sendMessage ({
                      playerID: player.id,
                      recipientID: null,
                      player: player,
                      template: botTemplate,
                      title: botMessage.title,
                      body: { type: 'root',
                              rhs: expansion.tree },
                      previous: prevMessage,
                      tags: botTemplate.tags,
                      previousTags: botTemplate.previousTags,
                      isPublic: true
                    }).then (function (result) {
                      return Player.update ({ id: player.id },
                                            { botMessage: result.message.id })
                    })
                  })
                })
            })
        })
      })
  }
};
