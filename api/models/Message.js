/**
 * Message.js
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
      type: 'string',
      defaultsTo: ''
    },

    initVarVal: {
      type: 'json',
      defaultsTo: {}
    },
    
    body: {
      type: 'json',
      required: true
    },
    
    isBroadcast: { type: 'boolean', defaultsTo: false },
    read: { type: 'boolean', defaultsTo: false },
    senderDeleted: { type: 'boolean', defaultsTo: false },
    recipientDeleted: { type: 'boolean', defaultsTo: false },

    rating: { type: 'integer', defaultsTo: null },
  },

  parseID: function (text) { return parseInt(text) }
};

