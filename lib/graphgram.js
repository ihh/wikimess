var extend = require('extend'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors')

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

  var graph, nextId = 1
  function addNode (label) {
    var id = String (nextId++)
    graph.setNode (id, label)
    return id
  }

  if (opts.graph) {
    graph = opts.graph
    grammar.warn (colors.yellow ("Initial grammar has " + graph.nodes().length + " nodes, " + graph.edges().length + " edges"))
    graph.nodes().forEach (function (id) {
      var n = parseInt (id)
      if (n) nextId = Math.max (nextId, n + 1)
    })
  } else {
    graph = new graphlib.Graph()
    addNode (grammar.start)
    grammar.warn (colors.yellow ("Initializing grammar with " + grammar.start))
  }

  var limit = parseInt(opts.limit) || this.limit
  for (var iter = 0; typeof(limit) === 'undefined' || iter < limit; ++iter) {
    grammar.warn (colors.cyan ("Iteration " + (iter+1)))
    var nodes = graph.nodes(), edges = graph.edges(), sites = []
    var context = new Context ({ iter, graph, grammar, sites })

    this.rules.forEach (function (rule, n) {
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
          if (match && context.evalCond (match, [id], rule))
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
            if (context.evalCond (match, [edge.v, edge.w], rule))
              context.addSite (rule, [edge.v, edge.w], rhs, match)
          }
        })
      } else
        grammar.warn ("Ignoring rule #" + n)
    })

    var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
    var w = Math.random() * totalWeight, m = -1
    while (w > 0 && ++m < sites.length - 1)
      w -= sites[m].weight

    grammar.warn(colors.blue("Total weight is " + totalWeight + "; " + (totalWeight > 0 ? ("sampled rule #" + sites[m].rule.n) : "quitting")))
    if (totalWeight == 0)
      break

    var site = sites[m]
    var newLabels = site.rhs.node.map (function (labelExpr) {
      return context.newLabel (site.match, site.lhs, labelExpr)
    })
    var newNodes = newLabels.map (addNode)
    grammar.warn ("Replacing nodes " + context.nodeList(site.lhs,colors.red) + " with " + context.nodeList(newNodes,colors.green))
    var oldSrc = site.lhs[0], oldDest = site.lhs[site.lhs.length - 1]
    var newSrc = newNodes[0], newDest = newNodes[newNodes.length - 1]
    context.reattachPredecessors (oldSrc, newSrc, site.lhs, newNodes)
    context.reattachSuccessors (oldDest, newDest, site.lhs, newNodes)
    if (oldSrc !== oldDest) {
      context.reattachPredecessors (oldDest, newDest, site.lhs, newNodes)
      context.reattachSuccessors (oldSrc, newSrc, site.lhs, newNodes)
    }
    site.rhs.edge.forEach (function (edge) {
      var label = context.newLabel (site.match, site.lhs, edge[2])
      grammar.warn ("Adding edge " + context.edgeDesc(newNodes[edge[0]],newNodes[edge[1]],label,colors.green,colors.green))
      graph.setEdge (newNodes[edge[0]], newNodes[edge[1]], label)
    })
    site.lhs.forEach (function (id) {
      graph.removeNode (id)
    })

    //  grammar.warn (colors.yellow (JSON.stringify (graphlib.json.write (graph))))
  }

  return graph
}

Grammar.prototype.toDot = function (graph) {
  return ["digraph G {"]
    .concat (graph.nodes().map (function (id) { return '  ' + id + ' [label="' + graph.node(id) + '"];' }))
    .concat (graph.edges().map (function (edge) { return '  ' + edge.v + ' -> ' + edge.w + ' [label="' + (graph.edge(edge) || '') + '"];' }))
    .concat (['}',''])
    .join("\n")
}

function Context (json) {
  extend (this, json)
}

Context.prototype.addSite = function (rule, lhs, rhs, match) {
  var weight = this.evalWeight (match, lhs, rule)
  this.grammar.warn ('Found match ' + this.nodeList(lhs,colors.red) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
  this.sites.push ({ weight, lhs, rhs, match, rule })
}

Context.prototype.newLabel = function (match, ids, expr) {
  if (!expr) return expr
  if (expr.match(/^=/))
    return this.evalMatchExpr (match, ids, expr.replace(/^=/,''))
  return expr.replace (/\\(\d+)/g, function (_m, n) { return match[parseInt(n)] })
}

Context.prototype.evalCond = function (match, ids, rule) {
  return this.evalMatchExpr (match, ids, rule.condition, true)
}

Context.prototype.evalWeight = function (match, ids, rule) {
  return this.evalMatchExpr (match, ids, rule.weight, 1)
}

Context.prototype.evalMatchExpr = function (match, ids, expr, defaultVal) {
  var context = this
  if (typeof(expr) === 'undefined')
    return defaultVal
  if (typeof(expr) !== 'string')
    return expr
  var extendedContext = {}
  var keys = ['iter','graph']
  keys.forEach (function (key) { extendedContext[key] = context[key] })
  match.forEach (function (match, n) { extendedContext[String(n)] = match })
  extendedContext.src = ids[0]
  extendedContext.dest = ids[1]
  Object.keys(extendedContext).forEach (function (key) { eval ('$' + key + '="' + String(extendedContext[key]).replace('"','\\"') + '"') })
  return eval(expr)
}

Context.prototype.reattachPredecessors = function (oldId, newId, oldNodes, newNodes) {
  var context = this, graph = this.graph, grammar = this.grammar
  graph.predecessors(oldId).forEach (function (pred) {
    if (oldNodes.indexOf(pred) < 0 && newNodes.indexOf(pred) < 0) {
      var label = graph.edge (pred, oldId)
      grammar.warn ("Replacing incoming edge " + context.edgeDesc(pred,oldId,label,colors.green,colors.red) + " with " + context.edgeDesc(pred,newId,label,colors.green,colors.green))
      graph.removeEdge (pred, oldId)
      graph.setEdge (pred, newId, label)
    }
  })
}

Context.prototype.reattachSuccessors = function (oldId, newId, oldNodes, newNodes) {
  var context = this, graph = this.graph, grammar = this.grammar
  graph.successors(oldId).forEach (function (succ) {
    if (oldNodes.indexOf(succ) < 0 && newNodes.indexOf(succ) < 0) {
      var label = graph.edge (oldId, succ)
      grammar.warn ("Replacing outgoing edge " + context.edgeDesc(oldId,succ,label,colors.red,colors.green) + " with " + context.edgeDesc(newId,succ,label,colors.green,colors.green))
      graph.removeEdge (oldId, succ)
      graph.setEdge (newId, succ, label)
    }
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
  return srcDesc + (label ? (colors.yellow('-') + colors.inverse(colors.yellow(label)) + colors.yellow('->')) : colors.yellow('->')) + destDesc
}

module.exports = { Grammar }
