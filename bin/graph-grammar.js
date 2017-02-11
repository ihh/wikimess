#!/usr/bin/env node

var fs = require('fs'),
    extend = require('extend'),
    path = require('path'),
    getopt = require('node-getopt'),
    graphlib = require('graphlib'),
    colors = require('colors')

var defaultGrammarFilename = 'data/sandbox/grammar.json'

var opt = getopt.create([
  ['g' , 'grammar=PATH'    , 'path to grammar file (default="' + defaultGrammarFilename + '")'],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var grammarFilename = opt.options.grammar || defaultGrammarFilename
var grammar = JSON.parse (fs.readFileSync (grammarFilename))

var graph = new graphlib.Graph()
var nextId = 1

addNode (grammar.start)

var iterations = grammar.iterations
for (var iter = 0; iter < iterations; ++iter) {
  console.log(colors.cyan("Iteration " + (iter+1)))
  var nodes = graph.nodes(), edges = graph.edges()
  var sites = []
  function addSite (rule, lhs, rhs, match) {
    var weight = rule.weight || 1
    console.log ('Found match ' + colors.red(nodeList(lhs)) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
    sites.push ({ weight, lhs, rhs, match })
  }
  grammar.rules.forEach (function (rule, n) {
    rule.n = n
    var lhs = rule.lhs, rhs = rule.rhs
    if (typeof(rhs) === 'string')
      rhs = [rhs]
    if (!rhs.edge)
      rhs = { node: rhs, edge: rhs.slice(1).map (function (_node, n) { return [n,n+1] }) }
    if (typeof(lhs) === 'string') {
      var re = new RegExp(lhs)
      nodes.forEach (function (id) {
        var label = graph.node (id)
        var match = re.exec (label)
        if (match)
          addSite (rule, [id], rhs, match)
      })
    } else if (lhs.length == 2) {
      var srcRe = new RegExp(lhs[0]), destRe = new RegExp(lhs[1])
      edges.forEach (function (edge) {
        var srcLabel = graph.node(edge.v), destLabel = graph.node(edge.w)
        var srcMatch = srcRe.exec(srcLabel), destMatch = destRe.exec(destLabel)
        if (srcMatch && destMatch)
          addSite (rule, [edge.v, edge.w], rhs, srcMatch.concat(destMatch))
      })
    } else
      console.log ("Ignoring rule #" + n)
  })

  var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
  console.log(colors.blue("Total weight is " + totalWeight))
  if (totalWeight == 0)
    break
  
  var w = Math.random() * totalWeight, m = 0
  while (w > 0 && m < sites.length - 1)
    w -= sites[m++].weight

  var site = sites[m]
  var newLabels = site.rhs.node.map (function (labelExpr) {
    return newLabel (site.match, labelExpr)
  })
  var newNodes = newLabels.map (addNode)
  console.log ("Replacing nodes " + colors.red(nodeList(site.lhs)) + " with " + colors.green(nodeList(newNodes)))
  var oldSrc = site.lhs[0], oldDest = site.lhs[site.lhs.length - 1]
  var newSrc = newNodes[0], newDest = newNodes[newNodes.length - 1]
  reattachPredecessors (oldSrc, newSrc, newNodes)
  reattachSuccessors (oldDest, newDest, newNodes)
  if (oldSrc !== oldDest) {
    reattachPredecessors (oldDest, newDest, newNodes)
    reattachSuccessors (oldSrc, newSrc, newNodes)
  }
  site.rhs.edge.forEach (function (edge) {
    console.log ("Adding edge " + colors.green(nodeList([newNodes[edge[0]],newNodes[edge[1]]])))
    graph.setEdge (newNodes[edge[0]], newNodes[edge[1]])
  })
  site.lhs.forEach (function (id) {
    graph.removeNode (id)
  })

//  console.log (colors.yellow (JSON.stringify (graphlib.json.write (graph))))
}

console.log (graphlib.json.write (graph))


function addNode (label) {
  var id = nextId++
  graph.setNode (id, label)
  return id
}

function reattachPredecessors (oldId, newId, newNodes) {
  graph.predecessors(oldId).forEach (function (pred) {
    if (newNodes.indexOf(parseInt(pred)) < 0) {
      console.log ("Replacing incoming edge " + colors.red(nodeList([pred,oldId])) + " with " + colors.green(nodeList([pred,newId])))
      graph.removeEdge (pred, oldId)
      graph.setEdge (pred, newId)
    }
  })
}

function reattachSuccessors (oldId, newId, newNodes) {
  graph.successors(oldId).forEach (function (succ) {
    if (newNodes.indexOf(parseInt(succ)) < 0) {
      console.log ("Replacing outgoing edge " + colors.red(nodeList([oldId,succ])) + " with " + colors.green(nodeList([newId,succ])))
      graph.removeEdge (oldId, succ)
      graph.setEdge (newId, succ)
    }
  })
}

function newLabel (match, expr) {
  return expr.replace (/\\(\d+)/g, function (_m, n) { return match[parseInt(n)] })
}

function nodeList (nodes) {
  return nodes.map(nodeDesc).join (", ")
}

function nodeDesc (id) {
  return id + '(' + graph.node(id) + ')'
}
