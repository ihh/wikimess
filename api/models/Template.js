/**
 * Template.js
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

    title: {
      type: 'string',
      required: true
    },
    
    content: {
      type: 'json',
      required: true
    },

    author: {
      model: 'player',
      defaultsTo: function() { return Player.adminUserId }
    },

    previous: {
      model: 'template',
      defaultsTo: null
    },

    // privacy
    isPublic: {
      type: 'boolean',
      defaultsTo: true
    },

    // ratings
    nRatings: { type: 'integer', defaultsTo: 1 },
    sumRatings: { type: 'integer', defaultsTo: 1 },
  },

  // lifecycle callback to update Adjacency table
  afterCreate: function (template, callback) {
    SymbolService.updateAdjacencies (template.content, 1)
      .then (function() {
        callback()
      })
  }
};

