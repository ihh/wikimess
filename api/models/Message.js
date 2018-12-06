/**
 * Message.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  primaryKey: 'id',

  attributes: {
    id: {
      type: 'number',
      autoIncrement: true,
      unique: true
    },

    sender: {
      model: 'player'
    },

    recipient: {
      model: 'player'
    },

    previous: {
      model: 'message',
    },

    replies: {
      collection: 'message',
      via: 'previous'
    },
    
    template: {
      model: 'template',
      required: true
    },

    title: {
      type: 'string'
    },

    initVarVal: {
      type: 'json'
    },
    
    body: {
      type: 'json',
      required: true
    },

    // tweeter = template.author.twitterScreenName (denormalized)
    tweeter: {
      type: 'string'
    },

    // avatar = template.author.avatar (denormalized)
    avatar: {
      type: 'string'
    },

    tweetId: {
      type: 'string'
    },
    
    isBroadcast: { type: 'boolean' },
    read: { type: 'boolean' },
    senderDeleted: { type: 'boolean' },
    recipientDeleted: { type: 'boolean' }
  },

  parseID: function (text) { return parseInt(text) },

  // lifecycle updates
  beforeCreate: function (m, callback) {
    m.title = m.title || ''
    m.initVarVal = m.initVarVal || {}
    m.isBroadcast = m.isBroadcast || false
    m.read = m.read || false
    m.senderDeleted = m.senderDeleted || false
    m.recipientDeleted = m.recipientDeleted || false
    callback()
  },
};

