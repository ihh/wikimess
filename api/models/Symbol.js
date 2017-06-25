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
      defaultsTo: [[]]
    },
  },

  // max depth for expansions
  maxDepth: 3,
  
  // lifecycle callbacks to autogenerate names
  autonamePrefix: 'script',
  autonameCount: 1,
  autonameRegex: /^script(\d+)$/,

  initAutonameCount() {
    return Symbol.find().then (function (symbols) {
      symbols.forEach (function (symbol) {
        Symbol.updateAutonameCount (symbol)
      })
    })
  },
  
  updateAutonameCount (symbol) {
    var match = Symbol.autonameRegex.exec (symbol.name)
    if (match)
      Symbol.autonameCount = Math.max (Symbol.autonameCount, parseInt(match[1]) + 1)
  },
  
  beforeCreate: function (symbol, callback) {
    if (!symbol.name)
      symbol.name = Symbol.autonamePrefix + (Symbol.autonameCount++)
    callback()
  },

  afterUpdate: function (symbol, callback) {
    Symbol.updateAutonameCount (symbol)
    callback()
  },
};

