/**
 * Revision.js
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

    symbol: {
      model: 'symbol'
    },
    
    name: {
      type: 'string'
    },
    
    author: {
      model: 'player'
    },

    authored: {
      type: 'boolean'
    },

    owner: {
      model: 'player'
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
      type: 'number'
    },
  },

  beforeCreate: function (revision, cb) {
    revision.author = revision.author || null
    revision.owner = revision.owner || null
    if (revision.firstRevision) {
      revision.number = 1
      cb()
    } else
      return RevisionService.findLatestRevision (revision.symbol)
      .then (function (prevRevision) {
        revision.number = (prevRevision ? (prevRevision.number || 0) : 0) + 1
        cb()
      })
  },

  afterCreate: function (revision, cb) {
    Symbol.update ({ id: revision.symbol },
                   { latestRevision: revision.id })
      .then (function() {
        cb()
      })
  },

  parseID: function (text) { return parseInt(text) },
};

