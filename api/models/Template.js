/**
 * Template.js
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

    title: {
      type: 'string'
    },
    
    content: {
      type: 'json',
      required: true
    },

    author: {
      model: 'player'
    },

    previous: {
      model: 'template'
    },

    tags: {
      type: 'string'
    },

    previousTags: {
      type: 'string'
    },

    // root of reply chain?
    isRoot: {
      type: 'boolean',
      defaultsTo: true
    },

    // privacy
    isPublic: {
      type: 'boolean',
      defaultsTo: true
    },

    // suggestion weight
    weight: {
      type: 'number',
      defaultsTo: 1
    }
  },

  // lifecycle callback to update Adjacency table
  afterCreate: function (template, callback) {
    SymbolService.updateAdjacencies (template.content, 1)
      .then (function() {
        callback()
      })
  },

  parseID: function (text) { return parseInt(text) },

  // lifecycle callbacks
  beforeCreate: function (t, callback) {
    t.title = t.title || ''
    t.author = t.author || Player.adminUserId
    t.previous = t.previous || null
    t.tags = t.tags || ''
    t.previousTags = t.previousTags || ''
    callback()
  }
};

