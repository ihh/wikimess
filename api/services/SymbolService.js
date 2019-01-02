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

  validateMessageRhs: function (origTemplateContent, origBodyRhs, inQuote) {
    if (!origTemplateContent)
      return Promise.reject('template content missing')
    if (!origBodyRhs)
      return Promise.reject('body rhs missing')
    // Strip footers before proceeding with validation
    // This is a hole, but is a quick kludge to prevent mismatches that can otherwise occur
    // when a choice footer (&$accept or &$reject) has been appended to a message,
    // but is missing from the template
    // (since template parser can't know in advance if $accept or $reject are defined)
    var templateContent = parseTree.stripFooter (origTemplateContent)
    var bodyRhs = parseTree.stripFooter (origBodyRhs)
    if (templateContent.length !== bodyRhs.length)
      return Promise.reject('template/body length mismatch (' + templateContent.length + ' !== ' + bodyRhs.length + ')')
    if (!templateContent.length)
      return Promise.resolve()
    return Promise.all (templateContent.map (function (templateNode, n) {
      var bodyNode = bodyRhs[n]
      if (typeof(templateNode) === 'string')
        return templateNode === bodyNode ? Promise.resolve() : Promise.reject('string mismatch')
      if (bodyNode.type !== (templateNode.type + (templateNode.type === 'alt' || templateNode.type === 'rep' ? '_sampled' : '')))
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
		return SymbolService.validateMessageRhs (bodyNode.evaltree, bodyNode.value)
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
      case 'rep':
        if (bodyNode.n < templateNode.min || bodyNode.n > templateNode.max)
          return Promise.reject('invalid number of reps')
        return Promise.all (bodyNode.reps.map (function (rep) { return SymbolService.validateMessageRhs (templateNode.unit, rep) }))
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
      case 'list':
      case 'alt_sampled':
      case 'rep_sampled':
      default:
        break
      }
      return Promise.reject('unrecognized type')
    }))
  },

  makeSymbolInfo: function (symbol, playerID) {
    var ownerID = symbol.owner, owned = symbol.owned
    var result = { symbol: { id: symbol.id } }
    if (!symbol.renamable)
      result.symbol.fixname = true
    if (ownerID === playerID || !symbol.summary)
      result.symbol.rules = symbol.rules
    else {
      result.symbol.rules = []
      result.symbol.summary = symbol.summary
    }
    var ownerPromise = (ownerID === null || !owned
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
    if (ownerID === playerID || !symbol.summary) {
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

  makeSymbolQuery: function (expandConfig) {
    var node = expandConfig.node
    var symbolQuery = {}
    if (node && typeof(node.id) !== 'undefined')
      symbolQuery.id = node.id
    else if (node && typeof(node.name) !== 'undefined')
      symbolQuery.name = node.name
    else if (expandConfig.symbolName)
      symbolQuery.name = expandConfig.symbolName
    return symbolQuery
  },
  
  expandContent: function (config) {
    var rhs = config.rhs || parseTree.parseRhs (config.rhsText)
    var varVal = config.vars || {}
    var sampledTree = parseTree.sampleParseTree (rhs, config)
    return parseTree.makeRhsExpansionPromise
    (extend ({},
             config,
             { rhs: sampledTree,
               vars: varVal,
               disableParse: true,
               get: function (getConfig) {
                 return Symbol.findOneCached (SymbolService.makeSymbolQuery (getConfig))
                   .then (function (symbol) {
                     var rulesRhs = symbol && symbol.rules.map (function (rule) { return parseTree.makeRhsText (rule) })
                     return (rulesRhs && rulesRhs.length
                             ? (rulesRhs.length === 1
                                ? rulesRhs
                                : [parseTree.leftSquareBraceChar + rulesRhs.join (parseTree.pipeChar) + parseTree.rightSquareBraceChar])
                             : [''])
                   })
               },
               expand: function (expandConfig) {
                 var node = expandConfig.node
                 return Symbol.findOneCached (SymbolService.makeSymbolQuery (expandConfig))
                   .then (function (symbol) {
                     var result
                     if (symbol) {
                       var n = parseTree.randomIndex (symbol.rules)
                       result = parseTree.sampleParseTree (symbol.rules[n], config)
                       node.id = symbol.id
                       node.rev = symbol.latestRevision
                       node.n = n
                     } else
                       result = []
                     return result
                   })
               }
             }))
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
    var symNodes = parseTree.getSymbolNodes (rhs)
    if (!symNodes.length)
      return Promise.resolve()
    var symbolIDsPromise = Promise.map (symNodes,
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
