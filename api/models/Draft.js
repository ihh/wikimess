/**
 * Draft.js
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
      model: 'player'
    },

    previous: {
      model: 'message'
    },

    previousTemplate: {
      model: 'template'
    },

    tags: {
      type: 'string',
      defaultsTo: '',
    },

    previousTags: {
      type: 'string',
      defaultsTo: '',
    },
    
    template: {
      type: 'json'
    },

    title: {
      type: 'string'
    },
    
    body: {
      type: 'json'
    },

  },

  parseID: function (text) { return parseInt(text) },
};

