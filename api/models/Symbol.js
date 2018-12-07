/**
 * Symbol.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var parseTree = require('bracery').ParseTree

module.exports = {

  primaryKey: 'id',

  attributes: {
    id: {
      type: 'number',
      autoIncrement: true,
      unique: true
    },

    name: {
      type: 'string',
      unique: true
    },

    copied: {
      model: 'symbol'
    },

    owner: {
      model: 'player'
    },

    owned: {
      type: 'boolean'
    },

    transferable: {
      type: 'boolean',
      defaultsTo: true
    },

    renamable: {
      type: 'boolean',
      defaultsTo: true
    },
    
    initialized: {
      type: 'boolean'
    },

    summary: {
      type: 'string'
    },
    
    rules: {
      type: 'json'
    },

    latestRevision: {
      model: 'revision'
    },
  },

  // limits for expansions
  maxDepth: 3,
  maxNodes: 600,
  maxRhsSyms: 100,
  maxTemplateSyms: 100,

  // in-memory cache
  cache: { byId: {},
           byName: {},
           isUsedBy: {},  // isUsedBy[x.name][y.name]=true iff x is used by y
           isCopiedBy: {},  // isCopiedBy[x.id][y.id]=true iff x is copied by y
         },

  // automatic naming
  noun: 'phrase',
  autoname: { defaultPrefix: 'phrase',
              maxSuffix: {},
              versionString: '_',
              regex: /^(.*?)_(\d+)$/ },

  // cache accessors
  initCache: function() {
    return Symbol.find().then (function (symbols) {
      symbols.forEach (function (symbol) {
        Symbol.updateCache (symbol)
      })
    })
  },

  setUsage: function (usingSymbolName, usedSymbolName) {
    Symbol.cache.isUsedBy[usedSymbolName] = Symbol.cache.isUsedBy[usedSymbolName] || {}
    Symbol.cache.isUsedBy[usedSymbolName][usingSymbolName] = true
  },

  clearUsage: function (usingSymbolName, usedSymbolName) {
    if (Symbol.cache.isUsedBy[usedSymbolName])
      delete Symbol.cache.isUsedBy[usedSymbolName][usingSymbolName]
  },
  
  updateCache: function (symbol, callback) {
    var oldSymbol = Symbol.cache.byId[symbol.id]

    var nameChanged = (oldSymbol && oldSymbol.name !== symbol.name)
    if (nameChanged)
      delete Symbol.cache.byName[oldSymbol.name]
    else if (oldSymbol === symbol && Symbol.cache.byName[symbol.name] !== symbol)
      throw new Error ("Symbol name " + symbol.name + " appears to have been edited in-place, invalidating cache")

    Symbol.cache.byId[symbol.id] = symbol
    Symbol.cache.byName[symbol.name] = symbol

    if (oldSymbol && oldSymbol.copied && oldSymbol.copied !== symbol.copied)
      throw new Error ("Symbol 'copied' field is not allowed to change")
    if (symbol.copied && !oldSymbol) {
      Symbol.cache.isCopiedBy[symbol.copied] = Symbol.cache.isCopiedBy[symbol.copied] || {}
      Symbol.cache.isCopiedBy[symbol.copied][symbol.id] = true
    }
    
    var match = Symbol.autoname.regex.exec (symbol.name)
    if (match)
      Symbol.autoname.maxSuffix[match[1]] = Math.max (Symbol.autoname.maxSuffix[match[1]] || 0, parseInt(match[2]))

    var newChild = Symbol.getUsedSymbolNames (symbol.rules)
    var oldChild = oldSymbol ? Symbol.getUsedSymbolNames (oldSymbol.rules) : {}
    Object.keys(oldChild).forEach (function (c) {
      if (nameChanged || !newChild[c])
        Symbol.clearUsage (oldSymbol.name, c)
    })
    Object.keys(newChild).forEach (function (c) {
      if (nameChanged || !oldChild[c])
        Symbol.setUsage (symbol.name, c)
    })
    if (nameChanged)
      Symbol.getUsingSymbols (oldSymbol.name)
      .forEach (function (usingSymbol) {
        Symbol.clearUsage (usingSymbol.name, oldSymbol.name)
        Symbol.setUsage (usingSymbol.name, symbol.name)
      })

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

  getUsedSymbolNames: function (rules) {
    var svc = this
    var isUsedSymbolName = {}
    rules.forEach (function (rhs) {
      parseTree.getSymbolNodes(rhs).forEach (function (rhsSym) {
        var rhsSymbol = Symbol.cache.byId[rhsSym.id]
        if (rhsSymbol)
          isUsedSymbolName[rhsSymbol.name] = true
      })
    })
    return isUsedSymbolName
  },

  getUsingSymbols: function (usedSymbolName) {
    var isUsedBy = Symbol.cache.isUsedBy[usedSymbolName]
    var users = isUsedBy ? Object.keys(isUsedBy) : []
    return users.map (function (usingSymbolName) {
      return Symbol.cache.byName[usingSymbolName]
    })
  },

  getUsedSymbols: function (usingSymbolName) {
    return Object.keys (Symbol.getUsedSymbolNames (Symbol.cache.byName[usingSymbolName].rules))
      .map (function (usedSymbolName) {
        return Symbol.cache.byName[usedSymbolName]
      })
  },

  getCopies: function (symbolId) {
    return Object.keys (Symbol.cache.isCopiedBy[symbolId] || {})
      .map (function (copyId) {
        return Symbol.cache.byId[copyId]
      })
  },

  getSubgrammar: function (symbolName) {
    var desc = {}, next = [Symbol.cache.byName[symbolName]]
    while (next.length) {
      var symbol = next.pop()
      if (!desc[symbol.id]) {
        desc[symbol.id] = symbol
        next = next.concat (Symbol.getUsedSymbols (symbol.name)
                            .filter (function (childSymbol) {
                              return !desc[childSymbol.id]
                            }))
      }
    }
    return Object.keys(desc).map (function (id) { return desc[id] })
  },
  
  id2name: function (id) {
    var sym = Symbol.cache.byId[id]
    return sym ? sym.name : sym
  },

  // lifecycle callbacks to update cache
  beforeCreate: function (symbol, callback) {
    symbol.owner = symbol.owner || Player.adminUserId
    symbol.owned = symbol.owned || false
    symbol.initialized = symbol.initialized || false
    symbol.summary = symbol.summary || ''
    symbol.rules = symbol.rules || [[]]
    symbol.name = symbol.name || Symbol.autoname.defaultPrefix
    if (Symbol.cache.byName[symbol.name]) {
      var prefix = symbol.name
      var nextSuffix = ''
      var match = Symbol.autoname.regex.exec (prefix)
      if (match)
        prefix = match[1]
      nextSuffix = (Symbol.autoname.maxSuffix[prefix] || 1) + 1
      if (match)
        nextSuffix = Math.max (nextSuffix, parseInt(match[2]))
      do
        symbol.name = prefix + Symbol.autoname.versionString + (nextSuffix++)
      while (Symbol.cache.byName[symbol.name])
    }
    callback()
  },
  
  afterCreate: function (symbol, callback) {
    Symbol.updateCache (symbol, callback)
  },

  beforeUpdate: function (symbol, callback) {
    if (!symbol.id) return callback()
    Symbol.findOne ({ id: symbol.id })
      .then (callback)
  },

  afterUpdate: function (symbol, callback) {
    if (typeof(symbol.rules) === 'string')  // disgusting hacky workaround for MySQL adapter's serialization of JSON
      symbol.rules = JSON.parse(symbol.rules)
    Symbol.updateCache (symbol, callback)
  },

  afterDestroy: function (symbols, callback) {
    symbols.forEach (function (symbol) {
      delete Symbol.cache.byId[symbol.id]
      delete Symbol.cache.byName[symbol.name]
    })
    callback()
  },

  parseID: function (text) { return parseInt(text) },

  // Sails 0.1-style message
  message: function (id, data) {
    this.publish ([id], { verb: 'messaged', id: id, data: data })
  },
};
