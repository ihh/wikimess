/**
 * Symbol.js
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

    name: {
      type: 'string',
      unique: true
    },

    owner: {
      model: 'player',
      defaultsTo: null
    },

    initialized: {
      type: 'boolean',
      defaultsTo: false
    },
    
    rules: {
      type: 'json',
      defaultsTo: []
    },
  },

  // lifecycle callback to autogenerate name
  beforeCreate: function (symbol, callback) {
    if (!symbol.name)
      symbol.name = 'symbol' + symbol.id
    callback()
  },
};

