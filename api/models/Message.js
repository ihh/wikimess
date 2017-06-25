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
      model: 'player',
      required: true
    },

    recipient: {
      model: 'player',
      required: true
    },

    previous: {
      model: 'message',
    },
    
    template: {
      model: 'template',
      required: true
    },

    title: {
      type: 'string',
      required: true
    },
    
    body: {
      type: 'json',
      required: true
    },
    
    read: { type: 'boolean', defaultsTo: false },
    senderDeleted: { type: 'boolean', defaultsTo: false },
    recipientDeleted: { type: 'boolean', defaultsTo: false },

    rating: { type: 'integer', defaultsTo: null },
  }
};

