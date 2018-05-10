// api/services/SymbolService.js

var Promise = require('bluebird')
var extend = require('extend')

var parseTree = require('bracery').ParseTree

module.exports = {

  validateMessage: function (template, body, varVal) {
    var symbolName = {}
    return Symbol.find ({ id: (parseTree.getSymbolNodes (body.rhs)
			       .filter (function (node) { return node.id && !node.name })
			       .map (function (node) { return node.id })) })
      .then (function (symbols) {
	if (symbols)
	  symbols.forEach (function (symbol) { symbolName[symbol.id] = symbol.name })
	// call makeRhsExpansionText to verify that stored &eval texts are correct
	parseTree.makeRhsExpansionText ({ rhs: body.rhs,
					  vars: varVal,
					  makeSymbolName: function (symNode) { return symNode.name || symbolName[symNode.id] },
					  expandCallback: function() {
					    throw new Error ('unexpanded node')
					  },
                                          validateEvalText: true,
					  invalidEvalTextCallback: function (node, storedEvalText, evalText) {
					    throw new Error ("in &eval, stored evaluation text '" + storedEvalText + "' does not match dynamically computed value '" + evalText + "'")
					  } })
	// compare body to template
	return SymbolService.validateMessageRhs (template.content, body.rhs)
      })
  },

  validateMessageRhs: function (templateContent, bodyRhs, inQuote) {
    if (!templateContent)
      return Promise.reject('template content missing')
    if (!bodyRhs)
      return Promise.reject('body rhs missing')
    if (templateContent.length !== bodyRhs.length)
      return Promise.reject('template/body length mismatch')
    if (!templateContent.length)
      return Promise.resolve()
    return Promise.all (templateContent.map (function (templateNode, n) {
      var bodyNode = bodyRhs[n]
      if (typeof(templateNode) === 'string')
        return templateNode === bodyNode ? Promise.resolve() : Promise.reject('string mismatch')
      if (bodyNode.type !== (templateNode.type === 'alt' ? 'opt' : templateNode.type))
        return Promise.reject('type mismatch (' + bodyNode.type + ' !== ' + templateNode.type + ')')
      switch (templateNode.type) {
      case 'assign':
        if (templateNode.varname !== bodyNode.varname)
          return Promise.reject('varname mismatch in assign')
        return SymbolService.validateMessageRhs (templateNode.value, bodyNode.value, inQuote)
          .then (function() {
            if (templateNode.local || bodyNode.local)
              return SymbolService.validateMessageRhs (templateNode.local, bodyNode.local, inQuote)
          })
      case 'lookup':
        return templateNode.varname === bodyNode.varname ? Promise.resolve() : Promise.reject('varname mismatch in ' + templateNode.type)
      case 'cond':
        return SymbolService.validateMessageRhs (templateNode.test, bodyNode.test, inQuote)
          .then (SymbolService.validateMessageRhs (templateNode.t, bodyNode.t, inQuote))
          .then (SymbolService.validateMessageRhs (templateNode.f, bodyNode.f, inQuote))
      case 'func':
        if (templateNode.funcname !== bodyNode.funcname)
          return Promise.reject('funcname mismatch')
	switch (bodyNode.funcname) {
	case 'quote':
          return SymbolService.validateMessageRhs (templateNode.args, bodyNode.args, true)
	  break
	case 'eval':
          return SymbolService.validateMessageRhs (templateNode.args, bodyNode.args, inQuote)
	    .then (function() {
	      if (!inQuote)
		return SymbolService.validateMessageRhs (bodyNode.evaltext, bodyNode.value)
	    })
	  break
	default:
          return SymbolService.validateMessageRhs (templateNode.args, bodyNode.args, inQuote)
	  break
	}
      case 'alt':
        if (inQuote)
	  return SymbolService.validateMessageRhs (templateNode.opts, bodyNode.opts)
        return SymbolService.validateMessageRhs (templateNode.opts[bodyNode.n], bodyNode.rhs)
      case 'root':
        return SymbolService.validateMessageRhs (templateNode.rhs, bodyNode.rhs, inQuote)
      case 'sym':
        if ((templateNode.id && bodyNode.id) ? (templateNode.id !== bodyNode.id) : (templateNode.name !== bodyNode.name))
          Promise.reject('symbol id/name mismatch')
        else {
	  if (inQuote)
	    return Promise.resolve()
          var symbolQuery = templateNode.id ? { id: templateNode.id } : { name: templateNode.name }
          return Symbol.findOneCached (symbolQuery)
            .then (function (symbol) {
              if (!symbol)
		Promise.reject('symbol not found: ' + JSON.stringify(symbolQuery))
              else if (symbol.latestRevision !== bodyNode.rev) {
		Promise.reject('revision mismatch (message has ' + bodyNode.rev + ', latest is ' + symbol.latestRevision + ')')
              } else
		return SymbolService.validateMessageRhs (symbol.rules[bodyNode.n], bodyNode.rhs)
            })
        }
      case 'opt':
      default:
        break
      }
      return Promise.reject('unrecognized type')
    }))
  },

  makeSymbolInfo: function (symbol, playerID) {
    var ownerID = symbol.owner
    var result = { symbol: { id: symbol.id } }
    if (!symbol.renamable)
      result.symbol.fixname = true
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
  
  makeSymbolLinks: function (symbol, playerID) {
    var ownerID = symbol.owner
    var usingSymbols = Symbol.getUsingSymbols (symbol.name)
    var copySymbols = Symbol.getCopies (symbol.id)
    var usedSymbols
    if (ownerID === playerID || symbol.summary === null) {
      // caller is allowed to see (summaries of) rules
      usedSymbols = Symbol.getUsedSymbols (symbol.name)
    }
    var result = { symbol: { id: symbol.id,
                             used: (usedSymbols ? usedSymbols.map (function (sym) { return sym.id }) : undefined),
                             using: usingSymbols.map (function (sym) { return sym.id }),
                             copies: copySymbols.map (function (sym) { return sym.id }) } }
    return (symbol.copied
            ? Symbol.findOneCached (symbol.copied)
            : copiedSymbolPromise = Promise.resolve (null))
      .then (function (copiedSymbol) {
        if (copiedSymbol)
          result.symbol.copied = copiedSymbol.id
        var symbols = usingSymbols
            .concat (usedSymbols || [])
            .concat (copySymbols)
            .concat (copiedSymbol ? [copiedSymbol] : [])
        return SymbolService.resolveReferences (symbols)
      }).then (function (names) {
        result.name = names
        return result
      })
  },

  makeOwnerID: function (symbol) {
    var result = null  // passing 'null' to the client signifies that this symbol is not owned by anyone
    if (symbol.owned && symbol.owner) {
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
      parseTree.getSymbolNodes(rhs).forEach (function (rhsSym) {
        if (rhsSym.name && typeof(rhsSym.id) === 'undefined') {
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
        parseTree.getSymbolNodes(rhs).forEach (function (rhsSym) {
          if (rhsSym.id)
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
          var symInfo = extend ({ type: 'sym', rhs: [] },
                                (symbol
                                 ? { id: symbol.id, name: symbol.name }
                                 : { id: query.id, name: query.name, notfound: true }))

          if (!symbol)
            return Promise.resolve (symInfo)
            
          if (depth[symbol.id] >= Symbol.maxDepth)
            return Promise.resolve (extend (symInfo, { limit: { type: 'depth', n: Symbol.maxDepth } }))
      
          var nextDepth = extend ({}, depth)
          nextDepth[symbol.id] = (nextDepth[symbol.id] || 0) + 1
          ++info.nodes

          var rhs = parseTree.sampleParseTree (symbol.rules.length ? symbol.rules[symInfo.n = parseTree.randomIndex(symbol.rules,rng)] : [], rng)
          var rhsSyms = parseTree.getSymbolNodes (rhs)

          var revisionPromise
          if (symbol)
            revisionPromise = RevisionService.findLatestRevision (symbol.id)
            .then (function (revision) {
              symInfo.rev = revision ? revision.id : null
            })
          else
            revisionPromise = Promise.resolve()

          return revisionPromise
            .then (function() {
              return SymbolService.expandSymbols (rhsSyms.map (function (rhsSym) { return { id: rhsSym.id,
                                                                                            name: rhsSym.name } }),
                                                  Symbol.maxRhsSyms,
                                                  info,
                                                  nextDepth,
                                                  rng)
            }).then (function (rhsExpansions) {
              rhsExpansions.forEach (function (rhsExpansion, n) {
                extend (rhsSyms[n], rhsExpansion)
              })
              symInfo.rhs = rhs
              return symInfo
            })
        })
    }
    
    return remainingExpansionPromise (symGenerator())
  },

  expandRhs: function (rhs, rng) {
    var sampledRhs = parseTree.sampleParseTree (rhs, rng)
    var symNodes = parseTree.getSymbolNodes (sampledRhs)
    return SymbolService.expandSymbols (symNodes, null, null, null, rng)
      .then (function (expandedSymbols) {
        symNodes.forEach (function (node, n) {
          node.rhs = expandedSymbols[n].rhs
        })
        return sampledRhs
      })
  },
  
  expansionSymbols: function (expansion) {
    var symID = {}
    parseTree.getSymbolNodes(expansion.rhs).forEach (function (rhsSym) {
      symID[rhsSym.id] = true
    })
    var ids = Object.keys(symID).map (function (x) { return parseInt(x) })
    return ids
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
    var symbolIDsPromise = Promise.map (parseTree.getSymbolNodes(rhs),
                                        function (rhsSym) {
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
