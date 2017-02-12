var extend = require('extend'),
    deepcopy = require('deepcopy'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors'),
    MersenneTwister = require('mersennetwister')

function Grammar (json, opts) {
  opts = opts || {}
  this.rules = []
  if (json && this.validate (json, opts.validationError))
    extend (this, json)
  extend (this, opts)
}

Grammar.prototype.schema = {
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
          lhs: { "$ref": "#/definitions/graph" },
          rhs: { "$ref": "#/definitions/graph" },
          condition: { type: 'string' },
          weight: { type: ['string','number'] },
          type: { type: 'string' },
          limit: { type: 'number' },
          delay: { type: 'number' },
        }
      }
    }
  },
  definitions: {
    identifier: {
      type: 'string',
      pattern: '^[a-zA-Z_][a-zA-Z_0-9]*$'
    },
    graph: {
      type: 'object',
      required: ['node'],
      additionalProperties: false,
      properties: {
        node: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { "$ref": "#/definitions/identifier" },
              label: { type: 'string' }
            }
          }
        },
        edge: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['v','w'],
            properties: {
              id: { "$ref": "#/definitions/identifier" },
              v: { "$ref": "#/definitions/identifier" },
              w: { "$ref": "#/definitions/identifier" },
              label: { type: 'string' },
            }
          }
        }
      }
    }
  }
}

Grammar.prototype.warn = function() {
  if (this.verbose)
    console.warn.apply (console, arguments)
}

Grammar.prototype.validate = function (json, errorCallback) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, this.schema, {nestedErrors: true})
  if (result.errors.length) {
    if (errorCallback) {
      var errs = result.errors.map (function (ve) { return ve.stack }).join("\n")
      errorCallback (new Error ("Schema validation error:\n" + errs))
    }
    return false
  }
  return true
}

Grammar.prototype.evolve = function (opts) {
  var grammar = this
  opts = opts || {}

  var mt = new MersenneTwister (opts.seed)
  var context = new Context ({ grammar: this }, opts)
  
  if (opts.graph) {
    context.graph = opts.graph
    context.warn (colors.yellow ("Initial grammar has " + context.graph.nodes().length + " nodes, " + context.graph.edges().length + " edges"))
    context.findNextIds()
  } else {
    context.graph = new graphlib.Graph()
    context.addNode (grammar.start)
    context.warn (colors.yellow ("Initializing grammar with " + grammar.start))
  }
  var graph = context.graph
  
  var ruleCount = {}
  this.rules.forEach (function (rule, n) {
    rule.n = n
    rule.type = rule.type || n
    rule.lhsGraph = grammar.makeGraph (rule.lhs)
    rule.rhsGraph = grammar.makeGraph (rule.rhs)
    ruleCount[rule.type] = 0
  })

  var limit = parseInt(opts.limit) || this.limit
  for (var iter = 0; typeof(limit) === 'undefined' || iter < limit; ++iter) {
    var nodes = graph.nodes(), edges = graph.edges(), sites = []

    context.iter = iter
    context.warn (colors.cyan ("Iteration " + (iter+1)))

    this.rules.forEach (function (rule, n) {
      if (rule.limit && ruleCount[rule.type] >= rule.limit)
        return
      if (rule.delay && iter < rule.delay)
        return

      var lhs = rule.lhsGraph, rhs = rule.rhsGraph

      var isomorphs = grammar.subgraphIsomorphisms (graph, lhs)
      isomorphs.forEach (function (isomorph) {
        if (context.evalCond (isomorph, rule)) {
          var weight = this.evalWeight (isomorph, rule)
          this.warn ('Found match ' + this.nodeList(lhs,colors.red) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
  this.sites.push ({ weight, lhs, rhs, match, rule, edge })
        console.log(match)
      })

/*
      if (typeof(lhs) === 'string') {
        // node replacement rule
        var re = new RegExp(lhs,'g')
        nodes.forEach (function (id) {
          var label = graph.node (id)
          var match = re.exec (label)
          if (match && context.evalCond (match, [id], undefined, rule))
            context.addSite (rule, [id], rhs, match)
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
	    var ids = [edge.v, edge.w]
            if (context.evalCond (match, ids, edge, rule))
              context.addSite (rule, ids, rhs, match, edge)
          }
        })
      } else
        context.warn ("Ignoring rule #" + n)
*/
    })

    /*
    var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
    var w = mt.rnd() * totalWeight, m = -1
    while (w > 0 && ++m < sites.length - 1)
      w -= sites[m].weight

    context.warn(colors.blue("Total weight is " + totalWeight + "; " + (totalWeight > 0 ? ("sampled rule #" + sites[m].rule.n) : "quitting")))
    if (totalWeight == 0)
      break

    var site = sites[m]
    ++ruleCount[site.rule.type]
    var newLabels = site.rhs.node.map (function (labelExpr) {
      return context.newLabel (site.match, site.lhs, site.edge, labelExpr)
    })
    var newNodes = newLabels.map (context.addNode.bind(context))
    context.warn ("Replacing nodes " + context.nodeList(site.lhs,colors.red) + " with " + context.nodeList(newNodes,colors.green))
    var oldSrc = site.lhs[0], oldDest = site.lhs[site.lhs.length - 1]
    var newSrc = newNodes[0], newDest = newNodes[newNodes.length - 1]
    if (site.edge)
      graph.removeEdge (site.edge)
    context.reattachOutgoing (oldDest, newDest)
    context.reattachIncoming (oldSrc, newSrc)
    if (oldSrc !== oldDest) {
      context.reattachOutgoing (oldSrc, newSrc)
      context.reattachIncoming (oldDest, newDest)
    }
    site.rhs.edge.forEach (function (edge) {
      var label = context.newLabel (site.match, site.lhs, site.edge, edge[2])
      context.addEdge (newNodes[edge[0]], newNodes[edge[1]], label)
      context.warn ("Adding edge " + context.edgeDesc(newNodes[edge[0]],newNodes[edge[1]],label,colors.green,colors.green))
    })
    site.lhs.forEach (function (id) {
      graph.removeNode (id)
    })
    */
  }

  return graph
}

Grammar.prototype.makeGraph = function (json) {
  var graph = new graphlib.Graph()
  json.node.forEach (function (node) {
    graph.setNode (node.id, node.label)
  })
  if (json.edge)
    json.edge.forEach (function (edge) {
      graph.setEdge (edge.v, edge.w, edge.label)
    })
  return graph
}

// Implementation of Ullmann (1976)
// via http://stackoverflow.com/questions/13537716/how-to-partially-compare-two-graphs/13537776#13537776
Grammar.prototype.subgraphIsomorphisms = function (graph, subgraph) {
  var mapping = { assign: {}, match: {} }
  var possibleAssignments = {}
  subgraph.nodes().forEach (function (sid) {
    var pa = {}
    graph.nodes().forEach (function (gid) {
      pa[gid] = true
    })
    possibleAssignments[sid] = pa
  })
  return this.subgraphSearch (graph, subgraph, mapping, possibleAssignments)
}

Grammar.prototype.testEdgeMatch = function (graph, v, w, labelPattern) {
  return graph.hasEdge(v,w) && (!labelPattern || new RegExp(labelPattern).exec(graph.edge(v,w)))
}

Grammar.prototype.updatePossibleAssignments = function (graph, subgraph, possibleAssignments) {
  var grammar = this
  var subnodes = subgraph.nodes()
  var changed
  do {
    changed = false
    subnodes.forEach (function (i) {
      Object.keys(possibleAssignments[i]).forEach (function (j) {
        var pred = subgraph.predecessors(j), succ = subgraph.successors(j)
        if (succ)
          succ.forEach (function (x) {
            var foundMatch = false, label = subgraph.edge(i,x)
            Object.keys(possibleAssignments[x]).forEach (function (y) {
              foundMatch = foundMatch || grammar.testEdgeMatch (graph, j, y, label)
            })
            if (!foundMatch) {
              delete possibleAssignments[i][j]
              changed = true
            }
          })
        if (pred)
          pred.forEach (function (x) {
            var foundMatch = false, label = subgraph.edge(x,i)
            Object.keys(possibleAssignments[x]).forEach (function (y) {
              foundMatch = foundMatch || grammar.testEdgeMatch (graph, y, j, label)
            })
            if (!foundMatch) {
              delete possibleAssignments[i][j]
              changed = true
            }
          })
      })
    })
  } while (changed)
}

Grammar.prototype.subgraphSearch = function (graph, subgraph, mapping, possibleAssignments) {
  var grammar = this
  grammar.updatePossibleAssignments (graph, subgraph, possibleAssignments)
  var subnodes = subgraph.nodes().sort()
  var nAssigned = Object.keys(mapping.assign).length
  if (nAssigned) {
    var lastAssigned = subnodes[nAssigned-1]
    var edgeNotFound = false
    subgraph.edges().forEach (function (edge) {
      if (edge.v <= lastAssigned && edge.w <= lastAssigned)
        if (!graph.hasEdge(mapping.assign[edge.v],mapping.assign[edge.w]))
          edgeNotFound = true
    })
    if (edgeNotFound)
      return []
  }
  if (nAssigned == subnodes.length)
    return [ deepcopy(mapping) ]
  var nextToAssign = subnodes[nAssigned]
  var sLabel = subgraph.node(nextToAssign)
  var sPattern = new RegExp ('^' + sLabel + '$')
  var results = []
  Object.keys(possibleAssignments[nextToAssign]).forEach (function (j) {
    var jUsed = false
    Object.keys(mapping.assign).forEach (function (i) {
      if (mapping.assign[i] === j)
        jUsed = true
    })
    if (!jUsed) {
      var gLabel = graph.node(j)
      var match = sLabel ? sPattern.exec(gLabel) : [gLabel]
      if (match) {
        mapping.match[nextToAssign] = match.slice(0)
        mapping.assign[nextToAssign] = j
        var newPossibleAssignments = deepcopy (possibleAssignments)
        newPossibleAssignments[nextToAssign] = {}
        newPossibleAssignments[nextToAssign][j] = true
        results = results.concat (grammar.subgraphSearch (graph, subgraph, mapping, newPossibleAssignments))
        delete mapping.assign[nextToAssign]
        delete mapping.match[nextToAssign]
        delete possibleAssignments[nextToAssign][j]
        grammar.updatePossibleAssignments (graph, subgraph, possibleAssignments)
      }
    }
  })
  return results
}

Grammar.prototype.toDot = function (graph) {
  return ["digraph G {"]
    .concat (graph.nodes().map (function (id) { return '  ' + id + ' [label="' + graph.node(id) + '"];' }))
    .concat (graph.edges().map (function (edge) { return '  ' + edge.v + ' -> ' + edge.w + ' [label="' + (graph.edge(edge) || '') + '"];' }))
    .concat (['}',''])
    .join("\n")
}

function Context (json, opts) {
  extend (this, json, { nextNodeId: 1 })
  this.warn = this.grammar.warn
  this.verbose = this.grammar.verbose
  extend (this, opts)
}

Context.prototype.findNextIds = function() {
  this.graph.nodes().forEach (function (id) {
    var n = parseInt (id)
    if (n) this.nextNodeId = Math.max (this.nextNodeId, n + 1)
  })
}

Context.prototype.addNode = function (label) {
  var id = String (this.nextNodeId++)
  this.graph.setNode (id, label)
  return id
}

Context.prototype.addEdge = function (src, dest, label) {
  this.graph.setEdge (src, dest, label)
  return id
}

Context.prototype.addSite = function (rule, lhs, rhs, match, edge) {
  var weight = this.evalWeight (match, lhs, edge, rule)
  this.warn ('Found match ' + this.nodeList(lhs,colors.red) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
  this.sites.push ({ weight, lhs, rhs, match, rule, edge })
}

Context.prototype.newLabel = function (isomorph, expr) {
  if (!expr) return expr
  if (expr.match(/^=/))
    return this.evalMatchExpr (isomorph, expr.replace(/^=/,''))
  return expr.replace (/\\(\d+)/g, function (_m, n) { return match[parseInt(n)] })
}

Context.prototype.evalCond = function (isomorph, rule) {
  return this.evalMatchExpr (isomorph, rule.condition, true)
}

Context.prototype.evalWeight = function (isomorph, rule) {
  return this.evalMatchExpr (isomorph, rule.weight, 1)
}

Context.prototype.evalMatchExpr = function (isomorph, expr, defaultVal) {
  var context = this
  if (typeof(expr) === 'undefined')
    return defaultVal
  if (typeof(expr) !== 'string')
    return expr
  var extendedContext = { id: isomorph.assign }
  var keys = ['iter','graph']
  keys.forEach (function (key) { extendedContext[key] = context[key] })
  isomorph.match.forEach (function (id) { extendedContext[id] = isomorph.match[id] })
  Object.keys(extendedContext).forEach (function (key) {
    eval ('$' + key + '="' + String(extendedContext[key]).replace('"','\\"') + '"')
  })
  return eval(expr)
}

Context.prototype.reattachIncoming = function (oldId, newId) {
  var context = this, graph = this.graph
  graph.inEdges(oldId).forEach (function (edge) {
    var label = graph.edge (edge)
    context.addEdge (edge.v, newId, label)
    graph.removeEdge (edge)
    context.warn ("Replacing incoming edge " + context.edgeDesc(edge.v,oldId,label,colors.green,colors.red) + " with " + context.edgeDesc(edge.v,newId,label,colors.green,colors.green))
  })
}

Context.prototype.reattachOutgoing = function (oldId, newId) {
  var context = this, graph = this.graph
  graph.outEdges(oldId).forEach (function (edge) {
    var label = graph.edge (edge)
    context.addEdge (newId, edge.w, label)
    graph.removeEdge (edge)
    context.warn ("Replacing outgoing edge " + context.edgeDesc(oldId,edge.w,label,colors.red,colors.green) + " with " + context.edgeDesc(newId,edge.w,label,colors.green,colors.green))
  })
}

Context.prototype.nodeList = function (nodes, color) {
  return nodes.map((id) => this.nodeDesc(id,color)).join (",")
}

Context.prototype.nodeDesc = function (id, color, rev) {
  color = color.bind (colors)
  var idText = color(id), labelText = colors.inverse(color(this.graph.node(id)))
  return rev ? (labelText + idText) : (idText + labelText)
}

Context.prototype.edgeDesc = function (src, dest, label, srcColor, destColor) {
  var srcDesc = this.nodeDesc(src,srcColor), destDesc = this.nodeDesc(dest,destColor,true)
  return srcDesc + colors.yellow('-') + (label ? colors.inverse(colors.yellow(label)) : '') + colors.yellow('>') + destDesc
}

module.exports = { Grammar }
