/**
 * Revision.js
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

    symbol: {
      model: 'symbol'
    },
    
    name: {
      type: 'string'
    },
    
    author: {
      model: 'player',
      defaultsTo: null
    },

    authored: {
      type: 'boolean'
    },

    owner: {
      model: 'player',
      defaultsTo: null
    },

    owned: {
      type: 'boolean'
    },

    transferable: {
      type: 'boolean'
    },
    
    summary: {
      type: 'string'
    },
    
    rules: {
      type: 'json'
    },

    // Revision number is purely decorative: a denormalized count of Revisions of the same Symbol at the time of creation (including this one)
    // It should NOT be used as an identifier!
    number: {
      type: 'integer',
      defaultsTo: 1
    },
  },

  beforeCreate: function (revision, cb) {
    if (revision.firstRevision)
      cb()
    else
      return RevisionService.findLatestRevision (revision.symbol)
      .then (function (prevRevision) {
        revision.number = (prevRevision ? (prevRevision.number || 0) : 0) + 1
        cb()
      })
  },

  parseID: function (text) { return parseInt(text) },
};

