#!/usr/bin/env node

var fs = require('fs'),
    extend = require('extend'),
    path = require('path'),
    getopt = require('node-getopt'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors')

var defaultGrammarFilename = 'data/sandbox/grammar.json'

var opt = getopt.create([
  ['g' , 'grammar=PATH'    , 'path to grammar file (default="' + defaultGrammarFilename + '")'],
  ['i' , 'input=PATH'      , 'path to input graphlib JSON file'],
  ['o' , 'output=PATH'     , 'path to output graphlib JSON file'],
  ['d' , 'dot=PATH'        , 'save graphviz DOT file'],
  ['l' , 'limit=N'         , 'limit number of rule applications'],
  ['q' , 'quiet'           , 'do not print pretty log messages'],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

function warn() {
  if (!opt.options.quiet)
    console.warn.apply (console, arguments)
}

var grammarFilename = opt.options.grammar || defaultGrammarFilename
var grammarText = fs.readFileSync(grammarFilename).toString()
var grammar = eval ('(' + grammarText + ')')

var schema = {
  type: 'object',
  required: ['start','rules'],
  additionalProperties: false,
  properties: {
    start: { type: 'string' },
    limit: { type: 'number' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lhs','rhs'],
        additionalProperties: false,
        properties: {
          lhs: { oneOf: [{ type: 'string' },
                         { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } }] },
          rhs: { oneOf: [{ type: 'string' },
                         { type: 'array', items: { type: 'string' } },
                         { type: 'object',
                           additionalProperties: false,
                           required: ['node'],
                           properties: {
                             node: { type: 'array', items: { type: 'string' } },
                             edge: { type: 'array',
                                     items: { oneOf: [ { type: 'array', minItems: 2, maxItems: 2, items: [ { type: 'number' }, { type: 'number' } ] },
                                                       { type: 'array', minItems: 3, maxItems: 3, items: [ { type: 'number' }, { type: 'number' }, { type: 'string' } ] } ] } } } }] },
          condition: { type: 'string' },
          weight: { type: ['string','number'] },
        }
      }
    }
  }
}
if (!validate (grammar, schema, console.warn))
  process.exit()

var graph, nextId = 1

if (opt.options.input) {
  graph = graphlib.json.read (JSON.parse (fs.readFileSync (opt.options.input)))
  warn (colors.yellow ("Read grammar with " + graph.nodes().length + " nodes, " + graph.edges().length + " edges"))
  graph.nodes().forEach (function (id) {
    var n = parseInt (id)
    if (n) nextId = Math.max (nextId, n + 1)
  })
} else {
  graph = new graphlib.Graph()
  addNode (grammar.start)
  warn (colors.yellow ("Initializing grammar with " + grammar.start))
}

var limit = parseInt(opt.options.limit) || grammar.limit
for (var iter = 0; typeof(limit) === 'undefined' || iter < limit; ++iter) {
  warn(colors.cyan("Iteration " + (iter+1)))
  var nodes = graph.nodes(), edges = graph.edges()
  var sites = []
  function addSite (rule, lhs, rhs, match) {
    var weight = evalWeight (match, rule, {iter})
    warn ('Found match ' + nodeList(lhs,colors.red) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
    sites.push ({ weight, lhs, rhs, match, rule })
  }

  grammar.rules.forEach (function (rule, n) {
    rule.n = n
    var lhs = rule.lhs, rhs = rule.rhs
    if (typeof(rhs) === 'string')
      rhs = [rhs]
    if (!rhs.edge)
      rhs = { node: rhs, edge: rhs.slice(1).map (function (_node, n) { return [n,n+1] }) }

    if (typeof(lhs) === 'string') {
      // node replacement rule
      var re = new RegExp(lhs,'g')
      nodes.forEach (function (id) {
        var label = graph.node (id)
        var match = re.exec (label)
        if (match && evalCond (match, rule, {iter}))
          addSite (rule, [id], rhs, match)
      })

    } else if (lhs.length >= 2) {
      // edge replacement rule
      var hasEdgeRe = (lhs.length > 2)
      var srcRe = new RegExp(lhs[0],'g'), destRe = new RegExp(lhs[1],'g'), edgeRe = new RegExp(lhs[2],'g')
      edges.forEach (function (edge) {
        var srcLabel = graph.node(edge.v), destLabel = graph.node(edge.w), edgeLabel = graph.edge(edge)
        var srcMatch = srcRe.exec(srcLabel), destMatch = destRe.exec(destLabel), edgeMatch = (hasEdgeRe ? edgeRe.exec(edgeLabel) : [edgeLabel])
        if (srcMatch && destMatch && edgeMatch) {
          var match = srcMatch.concat (destMatch, edgeMatch)
          if (evalCond (match, rule, {iter}))
            addSite (rule, [edge.v, edge.w], rhs, match)
        }
      })
    } else
      warn ("Ignoring rule #" + n)
  })

  var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
  var w = Math.random() * totalWeight, m = -1
  while (w > 0 && ++m < sites.length - 1)
    w -= sites[m].weight

  warn(colors.blue("Total weight is " + totalWeight + "; " + (totalWeight > 0 ? ("sampled rule #" + sites[m].rule.n) : "quitting")))
  if (totalWeight == 0)
    break

  var site = sites[m]
  var newLabels = site.rhs.node.map (function (labelExpr) {
    return newLabel (site.match, labelExpr)
  })
  var newNodes = newLabels.map (addNode)
  warn ("Replacing nodes " + nodeList(site.lhs,colors.red) + " with " + nodeList(newNodes,colors.green))
  var oldSrc = site.lhs[0], oldDest = site.lhs[site.lhs.length - 1]
  var newSrc = newNodes[0], newDest = newNodes[newNodes.length - 1]
  reattachPredecessors (oldSrc, newSrc, site.lhs, newNodes)
  reattachSuccessors (oldDest, newDest, site.lhs, newNodes)
  if (oldSrc !== oldDest) {
    reattachPredecessors (oldDest, newDest, site.lhs, newNodes)
    reattachSuccessors (oldSrc, newSrc, site.lhs, newNodes)
  }
  site.rhs.edge.forEach (function (edge) {
    var label = newLabel(site.match,edge[2])
    warn ("Adding edge " + edgeDesc(newNodes[edge[0]],newNodes[edge[1]],label,colors.green,colors.green))
    graph.setEdge (newNodes[edge[0]], newNodes[edge[1]], label)
  })
  site.lhs.forEach (function (id) {
    graph.removeNode (id)
  })

//  warn (colors.yellow (JSON.stringify (graphlib.json.write (graph))))
}

var dotFilename = opt.options.dot
if (dotFilename) {
  var dot = ["digraph G {"]
      .concat (graph.nodes().map (function (id) { return '  ' + id + ' [label="' + graph.node(id) + '"];' }))
      .concat (graph.edges().map (function (edge) { return '  ' + edge.v + ' -> ' + edge.w + ' [label="' + (graph.edge(edge) || '') + '"];' }))
      .concat (['}',''])
      .join("\n")
  fs.writeFileSync (dotFilename, dot)
}

var output = JSON.stringify (graphlib.json.write (graph), null, 2)
if (opt.options.output)
  fs.writeFileSync (opt.options.output, output)
else if (!dotFilename)
  console.log (output)


function addNode (label) {
  var id = String (nextId++)
  graph.setNode (id, label)
  return id
}

function reattachPredecessors (oldId, newId, oldNodes, newNodes) {
  graph.predecessors(oldId).forEach (function (pred) {
    if (oldNodes.indexOf(pred) < 0 && newNodes.indexOf(pred) < 0) {
      var label = graph.edge (pred, oldId)
      warn ("Replacing incoming edge " + edgeDesc(pred,oldId,label,colors.green,colors.red) + " with " + edgeDesc(pred,newId,label,colors.green,colors.green))
      graph.removeEdge (pred, oldId)
      graph.setEdge (pred, newId, label)
    }
  })
}

function reattachSuccessors (oldId, newId, oldNodes, newNodes) {
  graph.successors(oldId).forEach (function (succ) {
    if (oldNodes.indexOf(succ) < 0 && newNodes.indexOf(succ) < 0) {
      var label = graph.edge (oldId, succ)
      warn ("Replacing outgoing edge " + edgeDesc(oldId,succ,label,colors.red,colors.green) + " with " + edgeDesc(newId,succ,label,colors.green,colors.green))
      graph.removeEdge (oldId, succ)
      graph.setEdge (newId, succ, label)
    }
  })
}

function newLabel (match, expr) {
  if (!expr) return expr
  if (expr.match(/^=/))
    return evalMatchExpr (match, expr.replace(/^=/,''), {})
  return expr.replace (/\\(\d+)/g, function (_m, n) { return match[parseInt(n)] })
}

function evalCond (match, rule, context) {
  return evalMatchExpr (match, rule.condition, context, true)
}

function evalWeight (match, rule, context) {
  return evalMatchExpr (match, rule.weight, context, 1)
}

function evalMatchExpr (match, expr, context, defaultVal) {
  if (typeof(expr) === 'undefined')
    return defaultVal
  if (typeof(expr) !== 'string')
    return expr
  match.forEach (function (m, n) { eval ('$' + n + '="' + String(m).replace('"','\\"') + '"') })
  Object.keys(context).forEach (function (key) { eval ('$' + key + '="' + String(context[key]).replace('"','\\"') + '"') })
  return eval(expr)
}

function nodeList (nodes, color) {
  return nodes.map((id) => nodeDesc(id,color)).join (",")
}

function nodeDesc (id, color, rev) {
  color = color.bind (colors)
  var idText = color(id), labelText = colors.inverse(color(graph.node(id)))
  return rev ? (labelText + idText) : (idText + labelText)
}

function edgeDesc (src, dest, label, srcColor, destColor) {
  var srcDesc = nodeDesc(src,srcColor), destDesc = nodeDesc(dest,destColor,true)
  return srcDesc + (label ? (colors.yellow('-') + colors.inverse(colors.yellow(label)) + colors.yellow('->')) : colors.yellow('->')) + destDesc
}

function validate (json, schema, errorCallback) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, schema, {nestedErrors: true})
  if (result.errors.length) {
    if (errorCallback) {
      var errs = result.errors.map (function (ve) { return ve.stack }).join("\n")
      errorCallback (new Error ("Schema validation error:\n" + errs))
    }
    return false
  }
  return true
}
