/**
 * Draft.js
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
      type: 'string'
    },

    previousTags: {
      type: 'string'
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

  // lifecycle updates
  beforeCreate: function (draft, callback) {
    draft.tags = draft.tags || ''
    draft.previousTags = draft.previousTags || ''
    callback()
  },
};

