// api/services/SymbolService.js

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {

  createReferences: function (rules) {
    var refs = {}
    rules.forEach (function (rhs, ruleNum) {
      var rhsTrim = rhs.filter (function (rhsSym, n) {
        return typeof(rhsSym) === 'string' || n < Symbol.maxRhsSyms
      })
      if (rhsTrim.length < rhs.length)
        rhsTrim.push ('_(too many scripts)_')
      rules[ruleNum] = rhsTrim.reduce (function (rhsAcc, rhsSym) {
        if (typeof(rhsSym) === 'string' && rhsAcc.length > 0 && typeof(rhsAcc[rhsAcc.length-1]) === 'string')
          rhsAcc[rhsAcc.length-1] = rhsAcc[rhsAcc.length-1].replace(/\s+$/,'') + ' ' + rhsSym.replace(/^\s+/,'')
        else
          rhsAcc.push (rhsSym)
        return rhsAcc
      }, [])
    })
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

  expandSymbol: function (symbolQuery, rng, depth, info) {
    rng = rng || Math.random
    depth = depth || {}
    info = info || { nodes: 0 }
    var result = {}
    return Symbol.findOne (symbolQuery)
      .then (function (symbol) {
        if (!symbol) {
          result.id = symbolQuery.id
          result.name = symbolQuery.name
          result.unresolved = true
          return []
        } else {
          result.id = symbol.id
          result.name = symbol.name
          var rhsSyms = symbol.rules.length ? symbol.rules[Math.floor(rng() * symbol.rules.length)] : []
          function* rhsSymGenerator() {
            var n = 0
            while (n < rhsSyms.length)
              yield n++
          }
          function remainingExpansionPromise (generator) {
            var iter = generator.next()
            var n = iter.value
            if (iter.done || info.nodes >= Symbol.maxNodes || n > Symbol.maxRhsSyms + 1)  // terminate early if we've hit a limit
              return Promise.resolve ([])
            return symbolExpansionPromise (n)
              .then (function (symbolExpansion) {
                return remainingExpansionPromise (generator)
                  .then (function (remainingExpansion) {
                    return [symbolExpansion].concat (remainingExpansion)
                  })
              })
          }
          function symbolExpansionPromise (n) {
            var rhsSym = rhsSyms[n]
            if (typeof(rhsSym) === 'string')
              return Promise.resolve (rhsSym)
            if (n >= Symbol.maxRhsSyms)
              return Promise.resolve ({ id: rhsSym.id, name: rhsSym.name, limit: { rhsSyms: Symbol.maxRhsSyms }, rhs: [] })
            if (info.nodes >= Symbol.maxNodes)
              return Promise.resolve ({ id: rhsSym.id, name: rhsSym.name, limit: { nodes: Symbol.maxNodes }, rhs: [] })
            if (depth[rhsSym] >= Symbol.maxDepth)
              return Promise.resolve ({ id: rhsSym.id, name: rhsSym.name, limit: { depth: Symbol.maxDepth }, rhs: [] })
            var nextDepth = extend ({}, depth)
            nextDepth[rhsSym] = (nextDepth[rhsSym] || 0) + 1
            ++info.nodes
            return SymbolService.expandSymbol ({ id: rhsSym.id }, rng, nextDepth, info)
          }
          return remainingExpansionPromise (rhsSymGenerator())
        }
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
    if (typeof(expansion) === 'object' && typeof(expansion.id) !== 'undefined') {
      symID[expansion.id] = true
      expansion.rhs.forEach (function (rhsSym) {
        SymbolService.tagExpansionSymbols (rhsSym, symID)
      })
    }
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

  updateAdjacencies: function (rhs, weight) {
    var symbolIDs = rhs.filter (function (rhsSym) {
      return typeof(rhsSym) === 'object' && typeof(rhsSym.id) !== 'undefined'
    }).map (function (rhsSym) {
      return rhsSym.id
    })
    var paddedSymbolIDs = [null].concat(symbolIDs).concat([null])
    var updatePromises = paddedSymbolIDs.map (function (id, n) {
      if (n === 0)
        return null
      var predId = paddedSymbolIDs[n-1]
      return Adjacency.findOrCreate ({ predecessor: predId,
                                       successor: id })
        .then (function (adj) {
          return Adjacency.update ({ id: adj.id },
                                   { weight: adj.weight + weight })
        })
    })
    return Promise.all (updatePromises)
  },
};
