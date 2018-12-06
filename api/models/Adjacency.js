/**
 * Adjacency.js
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

    predecessor: {
      model: 'symbol'
    },

    successor: {
      model: 'symbol'
    },

    weight: {
      type: 'number'
    },
  },
    
  // in-memory cache
  cache: {},

  // cache accessors
  initCache: function() {
    return Adjacency.find().then (function (adjacencies) {
      adjacencies.forEach (function (adjacency) {
        Adjacency.updateCache (adjacency)
      })
    })
  },
  
  updateCache: function (adj, callback) {
    Adjacency.cache[adj.predecessor] = Adjacency.cache[adj.predecessor] || {}
    Adjacency.cache[adj.predecessor][adj.successor] = adj.weight
    if (callback)
      callback()
  },

  // lifecycle updates
  beforeCreate: function (adj, callback) {
    adj.weight = adj.weight || 0
    callback()
  },

  afterCreate: function (adj, callback) {
    Adjacency.updateCache (adj, callback)
  },

  afterUpdate: function (adj, callback) {
    Adjacency.updateCache (adj, callback)
  },

  afterDestroy: function (adjs, callback) {
    adjs.forEach (function (adj) {
      if (Adjacency.cache[adj.predecessor])
        delete Adjacency.cache[adj.predecessor][adj.successor]
    })
    callback()
  },

};

