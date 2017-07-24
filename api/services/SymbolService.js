// api/services/SymbolService.js

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {

  makeSymbolInfo: function (symbol, playerID) {
    var ownerID = symbol.owner
    var result = { symbol: { id: symbol.id } }
    if (ownerID === playerID || symbol.summary === null)
      result.symbol.rules = symbol.rules
    else {
      result.symbol.rules = []
      result.symbol.summary = symbol.summary
    }
    var ownerPromise = (ownerID === null
                        ? Promise.resolve()
                        .then (function() {
                          result.symbol.owner = null
                        })
                        : Player.findOne ({ id: ownerID })
                        .then (function (player) {
                          if (player.admin)
                            result.symbol.owner = { admin: true }
                          else
                            result.symbol.owner = { id: ownerID,
                                                    name: player.name }
                        }))
    return ownerPromise.then (function() {
      return SymbolService.resolveReferences ([symbol])
    }).then (function (names) {
      result.name = names
      return result
    })
  },

  makeOwnerID: function (symbol) {
    var result = null
    var locked = (Date.parse(symbol.updatedAt) + symbol.ownershipTerm > Date.now())
    if (symbol.owner && locked) {
      if (typeof(symbol.owner) === 'object')
        result = { id: symbol.owner.id,
                   login: symbol.owner.name,
                   name: symbol.owner.displayName }
      else
        result = { id: symbol.owner }
    }
    return result
  },
  
  imposeSymbolLimit: function (rules, limit) {
    rules.forEach (function (rhs) {
      var rhsTrim = rhs.filter (function (rhsSym, n) {
        return typeof(rhsSym) === 'string' || n < limit
      })
      if (rhsTrim.length < rhs.length)
        rhsTrim.push ('_(too many ' + Symbol.noun + 's)_')
      Array.prototype.splice.apply (rhs, [0, rhs.length].concat (rhsTrim.reduce (function (rhsAcc, rhsSym) {
        if (typeof(rhsSym) === 'string' && rhsAcc.length > 0 && typeof(rhsAcc[rhsAcc.length-1]) === 'string')
          rhsAcc[rhsAcc.length-1] = rhsAcc[rhsAcc.length-1].replace(/\s+$/,'') + ' ' + rhsSym.replace(/^\s+/,'')
        else
          rhsAcc.push (rhsSym)
        return rhsAcc
      }, [])))
    })
  },
  
  createReferences: function (rules) {
    var refs = {}
    rules.forEach (function (rhs) {
      rhs.forEach (function (rhsSym) {
        if (typeof(rhsSym) === 'object' && rhsSym.name && typeof(rhsSym.id) === 'undefined') {
          refs[rhsSym.name] = refs[rhsSym.name] || []
          refs[rhsSym.name].push (rhsSym)
        }
        delete rhsSym.name
      })
    })
    var promise
    var refNames = Object.keys(refs), refSymbols = {}
    if (refNames.length)
      promise = Promise.map (refNames, function (refName) {
        return Symbol.findOrCreate ({ name: refName },
                                    { name: refName,
                                      owner: null })
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

  expandSymbol: function (symbolQuery, maxSyms) {
    return SymbolService.expandSymbols ([symbolQuery], maxSyms)
      .then (function (expansions) {
        return expansions[0]
      })
  },

  expandSymbols: function (symbols, maxSyms, info, depth, rng) {
    maxSyms = maxSyms || Symbol.maxRhsSyms
    info = info || { nodes: 0 }
    depth = depth || {}
    rng = rng || Math.random

    var results = []

    function* symGenerator() {
      var n = 0
      while (n < symbols.length)
        yield n++
    }

    function remainingExpansionPromise (generator) {
      var iter = generator.next()
      var n = iter.value
      if (iter.done || info.nodes >= Symbol.maxNodes || n > maxSyms + 1)  // terminate early if we've hit a limit
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
      var symbolQueryOrString = symbols[n]
      if (typeof(symbolQueryOrString) === 'string')
        return Promise.resolve (symbolQueryOrString)

      if (n >= Symbol.maxRhsSyms)
        return Promise.resolve (extend (symbolQueryOrString, { limit: { type: 'symbols', n: Symbol.maxRhsSyms } }))

      if (info.nodes >= Symbol.maxNodes)
        return Promise.resolve (extend (symbolQueryOrString, { limit: { type: 'nodes', n: Symbol.maxNodes } }))

      var query = {}
      if (typeof(symbolQueryOrString.id) === 'undefined')
        query.name = symbolQueryOrString.name
      else
        query.id = symbolQueryOrString.id
      
      return Symbol.findOneCached (query)
        .then (function (symbol) {
          var symInfo = extend ({ rhs: [] },
                                (symbol
                                 ? { id: symbol.id, name: symbol.name }
                                 : { id: query.id, name: query.name }))
          if (!symbol)
            return Promise.resolve (symInfo)

          if (typeof(symbolQueryOrString) === 'object')
            ['cap', 'upper', 'plural', 'a'].forEach (function (key) {
              if (symbolQueryOrString[key])
                symInfo[key] = symbolQueryOrString[key]
            })
            
          if (depth[symbol.id] >= Symbol.maxDepth)
            return Promise.resolve (extend (symInfo, { limit: { type: 'depth', n: Symbol.maxDepth } }))
      
          var nextDepth = extend ({}, depth)
          nextDepth[symbol.id] = (nextDepth[symbol.id] || 0) + 1
          ++info.nodes

          var rhsSyms = symbol.rules.length ? symbol.rules[Math.floor(rng() * symbol.rules.length)] : []

          return SymbolService.expandSymbols (rhsSyms, Symbol.maxRhsSyms, info, nextDepth, rng)
            .then (function (rhsExpansions) {
              symInfo.rhs = rhsExpansions
              return Promise.resolve (symInfo)
            })
        })
    }
    
    return remainingExpansionPromise (symGenerator())
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
//    sails.log.debug ('Awarding '+weight+' stars to rhs ('+rhs.filter((r)=>typeof(r)==='object').map((r)=>r.id||r.name).join(',')+')')
    var symbolIDsPromise = Promise.map (rhs.filter (function (rhsSym) {
      return typeof(rhsSym) === 'object'
    }), function (rhsSym) {
      return (typeof(rhsSym.id) !== 'undefined'
              ? Promise.resolve (rhsSym.id)
              : Symbol.findOneCached ({ name: rhsSym.name })
              .then (function (symbol) { return symbol ? symbol.id : null }))
    })

    return symbolIDsPromise.then (function (symbolIDs) {
      var paddedSymbolIDs = [null].concat(symbolIDs).concat([null])
      var updatePromises = paddedSymbolIDs.map (function (id, n) {
        if (n === 0)
          return null
        var predId = paddedSymbolIDs[n-1]
        return Adjacency.findOrCreate ({ predecessor: predId,
                                         successor: id })
          .then (function (adj) {
//            sails.log.debug ('Awarding '+weight+' stars to symbol adjacency '+adj.id+' ('+(Symbol.id2name(adj.predecessor)||'null')+','+(Symbol.id2name(adj.successor)||'null')+')')
            return Adjacency.update ({ id: adj.id },
                                     { weight: adj.weight + weight })
          })
      })
      return Promise.all (updatePromises)
    })
  },

};
