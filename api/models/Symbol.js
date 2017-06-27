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

  // limits for expansions
  maxDepth: 3,
  maxNodes: 100,
  maxRhsSyms: 20,
  maxTemplateSyms: 20,

  // in-memory cache
  cache: { byId: {},
           byName: {} },

  // automatic naming
  autoname: { defaultPrefix: 'script',
              maxSuffix: {},
              regex: /^(.*?)(\d+)$/ },

  // cache accessors
  initCache: function() {
    return Symbol.find().then (function (symbols) {
      symbols.forEach (function (symbol) {
        Symbol.updateCache (symbol)
      })
    })
  },
  
  updateCache: function (symbol, callback) {
    Symbol.cache.byId[symbol.id] = symbol
    Symbol.cache.byName[symbol.name] = symbol
    var match = Symbol.autoname.regex.exec (symbol.name)
    if (match)
      Symbol.autoname.maxSuffix[match[1]] = Math.max (Symbol.autoname.maxSuffix[match[1]] || 0, parseInt(match[2]))
    if (callback)
      callback()
  },

  findOneCached: function (query) {
    if (Object.keys(query).length === 1) {
      if (query.id)
        return Promise.resolve (Symbol.cache.byId[query.id])
      if (query.name)
        return Promise.resolve (Symbol.cache.byName[query.name])
    }
    return Symbol.findOne (query)
  },
  
  // lifecycle callbacks to update cache
  beforeCreate: function (symbol, callback) {
    if (!symbol.name) {
      var prefix = symbol.prefix || Symbol.autoname.defaultPrefix
      var nextSuffix = ''
      if (Symbol.cache.byName[prefix]) {
        var match = Symbol.autoname.regex.exec (prefix)
        if (match)
          prefix = match[1]
        nextSuffix = (Symbol.autoname.maxSuffix[prefix] || 0) + 1
        if (match)
          nextSuffix = Math.max (nextSuffix, parseInt(match[2]))
      }
      symbol.name = prefix + nextSuffix
      delete symbol.prefix
    }
    callback()
  },
  
  afterCreate: function (symbol, callback) {
    Symbol.updateCache (symbol, callback)
  },

  afterUpdate: function (symbol, callback) {
    Symbol.updateCache (symbol, callback)
  },

  afterDestroy: function (symbols, callback) {
    symbols.forEach (function (symbol) {
      delete cache.byId[symbol.id]
      delete cache.byName[symbol.name]
    })
    callback()
  },
};
