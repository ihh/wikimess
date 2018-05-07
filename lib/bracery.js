var ParseTree = require('../assets/js/wikimess/parsetree')
var extend = ParseTree.extend

var RhsParser = require('../misc/parsers/rhs')

var Bracery = function (config) {
  extend (this,
          { rules: {} },
          config || {})
  return this
}

Bracery.prototype.maxExpandCalls = 5  // max number of &eval{} calls per expansion
Bracery.prototype.maxRecursionDepth = 3  // max number of recursive expansions of the same symbol
Bracery.prototype.rng = Math.random

function parseRhs (rhsText) {
  var result
  try {
    result = RhsParser.parse (rhsText)
  } catch (e) {
    console.warn(e)
    result = [rhsText]
  }
  return result
}

Bracery.prototype.addRules = function (name, rules) {
  if (arguments.length > 2 || typeof(rules) === 'string')
    rules = Array.prototype.splice.call (arguments, 1)
  this.rules[name] = (this.rules[name] || []).concat (rules.map (parseRhs))
  return this.rules[name]
}

Bracery.prototype.expandSymbol = function (config) {
  var bracery = this
  var symbolName = config.name
  var depth = extend ({}, config.depth || {})
  var symbolDepth = depth[symbolName] || 0
  var maxRecursionDepth = config.maxRecursionDepth || bracery.maxRecursionDepth
  var expansion
  if (symbolDepth < maxRecursionDepth) {
    depth[symbolName] = symbolDepth + 1
    var rules = this.rules[symbolName]
    if (rules) {
      var rhs = ParseTree.randomElement (rules, this.rng)
      expansion = bracery.expandRhs (extend ({}, config, { rhs: rhs }))
    }
  }
  return expansion || []
}

Bracery.prototype.expandRhs = function (config) {
  var sampledTree = ParseTree.sampleParseTree (config.rhs)
  this.expandAllSymbols (extend ({}, config, { rhs: sampledTree }))
  return sampledTree
}

Bracery.prototype.expandAllSymbols = function (config) {
  var bracery = this
  unexpandedSymbols (config.rhs).forEach (function (node) {
    node.rhs = bracery.expandSymbol (extend ({}, config, { name: node.name }))
  })
}

function unexpandedSymbols (rhs) {
  return ParseTree.getSymbolNodes (rhs)
    .filter (function (node) { return !node.rhs })
}

function throwCallback (info) {
  info.inThrowCallback = true  // hack hack hack
  throw info
  return null
}

function makeSymbolName (node) {
  return node.name
}

Bracery.prototype.doEvaluations = function (config) {
  var bracery = this
  var rhs = config.rhs
  var initNode = { type: 'root', rhs: rhs }
  var done
  var expandCalls = 0
  var maxExpandCalls = config.maxExpandCalls || bracery.maxExpandCalls
  while (!done) {
    // it is a bit inefficient here to start back at the root again every time, but simpler code-wise, and not too slow
    try {
      expansion = ParseTree.makeExpansionText ({ node: initNode,
                                                 vars: {},
                                                 expandCallback: throwCallback,
                                                 makeSymbolName: makeSymbolName })
    } catch (e) {
      if (!e.inThrowCallback) {  // disgusting hack
        console.error (e)
        throw e
      }
      var expandNode = e.node, expandText = e.text
      if (expandCalls < maxExpandCalls) {
        expandNode.evaltext = parseRhs (expandText)
        expandNode.value = bracery.expandRhs (extend ({}, config, { rhs: parsedExpandText }))
        ++expandCalls
      } else {
        expandNode.evalText = []
        expandNode.value = []
      }
    }
    done = true
  }
}

Bracery.prototype.expand = function (symbolName) {
  var expansion = [{ type: 'sym', name: symbolName }]
  while (unexpandedSymbols (expansion).length) {
    this.expandAllSymbols ({ rhs: expansion })
    this.doEvaluations ({ rhs: expansion })
  }
  var text = ParseTree.makeRhsExpansionText ({ rhs: expansion,
                                               vars: {} })
  return { text: text,
           tree: { type: 'root', rhs: expansion } }
}

module.exports = Bracery
