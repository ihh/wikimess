// api/services/SymbolService.js

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {

  createReferences: function (rules) {
    var refs = {}
    rules.forEach (function (rhs) {
      rhs.forEach (function (rhsSym) {
        if (typeof(rhsSym) === 'object' && rhsSym.name && typeof(rhsSym.id) === 'undefined') {
          refs[rhsSym.name] = refs[rhsSym.name] || []
          refs[rhsSym.name].push (rhsSym)
        }
      })
    })
    var promise
    var refNames = Object.keys(refs), refSymbols = {}
    if (refNames.length)
      promise = Promise.map (refNames, function (refName) {
        return Symbol.findOrCreate ({ name: refName })
          .then (function (refSymbol) {
            refs[refName].forEach (function (rhsSym) {
              rhsSym.id = refSymbol.id
            })
            return refSymbol
          })
      })
    else
      promise = new Promise (function (resolve, reject) { resolve([])} )
    return promise
  },

  resolveReferences: function (symbols) {
    var referenced = {}, name = {}
    symbols.forEach (function (symbol) {
      name[symbol.id] = symbol.name
      symbol.rules.forEach (function (rhs) {
        rhs.forEach (function (rhsSym) {
          if (typeof(rhsSym) === 'object' && rhsSym.id)
            referenced[rhsSym.id] = true
        })
      })
    })
    var refID = Object.keys(referenced).filter (function (id) { return !(id in name) })
    return Symbol.find ({ id: refID })
      .then (function (refSymbols) {
        refSymbols.forEach (function (refSymbol) {
          name[refSymbol.id] = refSymbol.name
        })
        return name
      })
  },

  expandSymbol: function (symbolID, rng, depth) {
    rng = rng || Math.random
    depth = depth || {}
    var result = { id: symbolID }
    return Symbol.findOne ({ id: symbolID })
      .then (function (symbol) {
        if (!symbol)
          throw new Error ('Symbol ' + symbolID + ' not found')
        result.name = symbol.name
        var rhsSyms = symbol.rules.length ? symbol.rules[Math.floor(rng() * symbol.rules.length)] : []
        return Promise.map (rhsSyms, function (rhsSym) {
          if (typeof(rhsSym) === 'string')
            return rhsSym
          if (depth[rhsSym] >= Symbol.maxDepth)
            return ''
          var nextDepth = extend ({}, depth)
          nextDepth[rhsSym] = (nextDepth[rhsSym] || 0) + 1
          return SymbolService.expandSymbol (rhsSym.id, rng, nextDepth)
        })
      }).then (function (rhsVals) {
        result.rhs = rhsVals
        return result
      })
  },

  expansionSymbols: function (expansion) {
    var symID = {}
    SymbolService.tagExpansionSymbols (expansion, symID)
    return Object.keys(symID)
  },
  
  tagExpansionSymbols: function (expansion, symID) {
    symID[expansion.id] = true
    expansion.rhs.forEach (function (rhsSym) {
      if (typeof(rhsSym) === 'object')
        SymbolService.tagExpansionSymbols (rhsSym, symID)
    })
  },

  expansionAuthors: function (expansion) {
    return Symbol.find ({ id: SymbolService.expansionSymbols (expansion) })
      .then (function (symbols) {
        var playerID = {}
        symbols.forEach (function (symbol) {
          if (symbol.owner)
            playerID[symbol.owner] = true
        })
        return Object.keys (playerID)
      })
  },
};
