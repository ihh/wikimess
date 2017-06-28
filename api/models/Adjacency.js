/**
 * Adjacency.js
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

    predecessor: {
      model: 'symbol'
    },

    successor: {
      model: 'symbol'
    },

    weight: {
      type: 'integer',
      defaultsTo: 0
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
};

