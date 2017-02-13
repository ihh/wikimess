var extend = require('extend'),
    deepcopy = require('deepcopy'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors'),
    MersenneTwister = require('mersennetwister')

function isArray (obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function Grammar (json, opts) {
  opts = opts || {}
  this.rules = []
  if (json) {
    this.validate (json)
    extend (this, json)
  }
  extend (this, opts)
  this._init()
}

function makeGraphSchema (lhs) {
  return {
    oneOf: [{ type: 'array', items: { type: 'string' } },  // interpreted as a chain of nodes
            { type: 'string' },  // interpreted as a single node
            { type: 'object',
              required: ['node'],
              additionalProperties: false,
              properties: {
                node: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    oneOf: [{ type: 'string' },  // interpreted as a label
                            { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },  // interpreted as [id,label]
                            { type: 'object',
                              additionalProperties: false,
                              required: ['id'],
                              properties: extend ({
                                id: { '$ref': '#/definitions/identifier' },
                                label: { type: 'string' }
                              }, lhs ? {} : {
                                head: { '$ref': '#/definitions/identifier_or_list' },
                                tail: { '$ref': '#/definitions/identifier_or_list' }
                              })
                            }]
                  }
                },
                edge: {
                  type: 'array',
                  items: {
                    oneOf: [{ type: 'array', minItems: 2, maxItems: 4, items: { type: ['string','number'] } },  // interpreted as [v,w,label,id]
                            { type: 'object',
                              additionalProperties: false,
                              required: ['v','w'],
                              properties: extend ({
                                v: { '$ref': '#/definitions/identifier' },
                                w: { '$ref': '#/definitions/identifier' },
                                label: { type: 'string' },
                              }, lhs ? { id: { '$ref': '#/definitions/identifier' } } : {})
                            }]
                  }
                }
              }
            }]
  }
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
          lhs: makeGraphSchema(true),
          rhs: makeGraphSchema(false),
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
    identifier_or_list: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { '$ref': '#/definitions/identifier' } }]
    }
  }
}

Grammar.prototype.warn = function() {
  if (this.verbose)
    console.warn.apply (console, arguments)
}

Grammar.prototype.validate = function (json) {
  var validator = new jsonschema.Validator()
  var result = validator.validate (json, this.schema, {nestedErrors: true})
  if (result.errors.length) {
    var errs = result.errors.map (function (ve) { return ve.stack }).join("\n")
    throw new Error ("Schema validation error:\n" + errs)
  }
}

Grammar.prototype._init = function (errorCallback) {
  var grammar = this
  this.rules.forEach (function (rule, n) {
    rule.n = n
    rule.type = rule.type || n

    function checkNodeId (id, desc, isNodeId) {
      if (!isNodeId[id]) throw new Error ("In " + name + ", " + desc + ": " + id + " is not a node ID")
    }

    var linkHeadTailRhs = false
    function checkGraph (prop, nodeIdFactory, isLhsNodeId) {
      var isNodeId = {}, isEdgeId = {}
      var name = 'rule #' + rule.n + ' ' + prop
      
      // do some auto-expansion of syntactic sugar
      if (typeof(rule[prop]) === 'string') {
        // a string expands to a single node, and triggers automatic linking of head & tail
        linkHeadTailRhs = true
        rule[prop] = { node: [{ id: 'a', label: rule[prop] }] }
      } else if (isArray(rule[prop])) {
        // an array of strings expands to a chain of nodes, and triggers automatic linking of head & tail
        linkHeadTailRhs = true
        rule[prop] = { node: rule[prop].map (function (label, n) { return { id: nodeIdFactory(n), label: label } }),
                       edge: rule[prop].slice(1).map (function (_label, n) { return [ nodeIdFactory(n), nodeIdFactory(n+1) ] }) }
      }

      var graph = rule[prop]
      graph.node = graph.node.map (function (node, n) {
        // if a node is a string, interpret it as a label, and auto-assign it an ID
        // if a node is a 2-tuple, interpret it as an [id,label] pair
        return typeof(node) === 'string' ? { id: nodeIdFactory(n), label: node } : (isArray(node) ? { id: node[0], label: node[1] } : node)
      })
      if (prop === 'rhs' && linkHeadTailRhs) {
        graph.node[0].head = rule.lhs.node[0].id
        graph.node[graph.node.length - 1].tail = rule.lhs.node[rule.lhs.node.length - 1].id
      }
      graph.node.forEach (function (node) {
        // if head/tail is a string, convert it to a single-element array
        if (typeof(node.head) === 'string') node.head = [node.head]
        if (typeof(node.tail) === 'string') node.tail = [node.tail]
      })
      if (graph.edge)
        graph.edge = graph.edge.map (function (edge) {
          // if an edge is a 2-, 3- or 4-tuple, interpret it as [v,w,label,edge]
          var e = isArray(edge) ? { v: edge[0], w: edge[1], label: edge[2], id: edge[3] } : edge
          e.v = String (e.v)
          e.w = String (e.w)
          e.label = e.label && String (e.label)
          e.id = e.id && String (e.id)
        return e
        })

      // validate IDs
      graph.node.forEach (function (node) {
        if (isNodeId[node.id]) throw new Error ("In " + name + ": duplicate node ID " + node.id)
        isNodeId[node.id] = true
        if (isLhsNodeId) {
          if (node.head)
            node.head.forEach (function (head) { checkNodeId (head, 'node ' + node.id + ' head', isLhsNodeId) })
          if (node.tail)
            node.tail.forEach (function (tail) { checkNodeId (tail, 'node ' + node.id + ' tail', isLhsNodeId) })
        }
      })
      if (graph.edge)
        graph.edge.forEach (function (edge) {
          checkNodeId (edge.v, 'edge.v', isNodeId)
          checkNodeId (edge.w, 'edge.w', isNodeId)
          if (edge.id) {
            if (isNodeId[edge.id] || isEdgeId[edge.id]) throw new Error ("In " + name + ": duplicate edge ID " + edge.id)
            isEdgeId[edge.id] = true
          }
        })
      return isNodeId
    }
    var isLhsNodeId = checkGraph ('lhs', (n) => String.fromCharCode(97+n))
    checkGraph ('rhs', (n) => String(n), isLhsNodeId)
    rule.lhsGraph = grammar.makeGraph (rule.lhs)
  })
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
  this.rules.forEach (function (rule) {
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

      var isomorphs = new SubgraphSearch (graph, rule.lhsGraph).isomorphisms
      isomorphs.forEach (function (isomorph) {
        if (context.evalCond (isomorph, rule)) {
          var weight = context.evalWeight (isomorph, rule)
          context.warn ('Found match ' + context.nodeList(isomorph.assign,colors.red) + ' to rule #' + rule.n + ' with weight ' + colors.blue(weight))
          if (rule.lhs.edge)
            rule.lhs.edge.forEach (function (edge, n) {
              if (edge.id)
                isomorph.match[edge.id] = isomorph.edgeMatch[n]
            })
          sites.push ({ weight, isomorph, rule })
        }
      })
    })

    var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
    var w = mt.rnd() * totalWeight, m = -1
    while (w > 0 && ++m < sites.length - 1)
      w -= sites[m].weight

    context.warn(colors.blue("Total weight is " + totalWeight + "; " + (totalWeight > 0 ? ("sampled rule #" + sites[m].rule.n) : "quitting")))
    if (totalWeight == 0)
      break

    var site = sites[m], isomorph = site.isomorph, rule = site.rule, oldId = isomorph.assign
    ++ruleCount[rule.type]
    var newLabel = {}, newId = {}
    rule.rhs.node.forEach (function (node) {
      newLabel[node.id] = context.newLabel (isomorph, node.label)
      newId[node.id] = context.addNode (newLabel[node.id])
    })
    context.warn ("Replacing nodes " + context.nodeList(oldId,colors.red) + " with " + context.nodeList(newId,colors.green))
    if (rule.lhs.edge)
      rule.lhs.edge.forEach (function (edge) {
        graph.removeEdge (oldId[edge.v], oldId[edge.w])
      })
    rule.lhs.node.forEach (function (node) {
      if (newId[node.id]) {
        context.reattachOutgoing (oldId[node.id], newId[node.id])
        context.reattachIncoming (oldId[node.id], newId[node.id])
      } else {
        var headId, tailId
        rule.rhs.node.forEach (function (rhsNode) {
          if (rhsNode.head && rhsNode.head.indexOf(node.id) >= 0) headId = rhsNode.id
          if (rhsNode.tail && rhsNode.tail.indexOf(node.id) >= 0) tailId = rhsNode.id
        })
        if (headId)
          context.reattachIncoming (oldId[node.id], newId[headId])
        if (tailId)
          context.reattachOutgoing (oldId[node.id], newId[tailId])
      }
      graph.removeNode (oldId[node.id])
    })
    if (rule.rhs.edge)
      rule.rhs.edge.forEach (function (edge) {
        var label = context.newLabel (isomorph, edge.label)
        context.addEdge (newId[edge.v], newId[edge.w], label)
        context.warn ("Adding edge " + context.edgeDesc(newId[edge.v],newId[edge.w],label,colors.green,colors.green))
      })
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
function SubgraphSearch (graph, subgraph) {
  extend (this, { graph, subgraph })
  this.mapping = { assign: {}, match: {} }
  this.subnodes = subgraph.nodes()
  this.subedges = subgraph.edges()
  
  var possibleAssignments = {}
  this.subnodes.forEach (function (sid) {
    var pa = {}
    graph.nodes().forEach (function (gid) {
      pa[gid] = true
    })
    possibleAssignments[sid] = pa
  })

  this.isomorphisms = this.search (possibleAssignments)
}

SubgraphSearch.prototype.testEdgeMatch = function (v, w, labelPattern) {
  if (!this.graph.hasEdge(v,w))
    return false
  var label = this.graph.edge(v,w)
  return labelPattern ? new RegExp(labelPattern).exec(label) : [label]
}

SubgraphSearch.prototype.updatePossibleAssignments = function (possibleAssignments) {
  var search = this, subgraph = this.subgraph
  var changed
  do {
    changed = false
    this.subnodes.forEach (function (i) {
      Object.keys(possibleAssignments[i]).forEach (function (j) {
        var pred = subgraph.predecessors(j), succ = subgraph.successors(j)
        if (succ)
          succ.forEach (function (x) {
            var foundMatch = false, label = subgraph.edge(i,x)
            Object.keys(possibleAssignments[x]).forEach (function (y) {
              foundMatch = foundMatch || search.testEdgeMatch (j, y, label)
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
              foundMatch = foundMatch || search.testEdgeMatch (y, j, label)
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

SubgraphSearch.prototype.search = function (possibleAssignments) {
  var ss = this, mapping = this.mapping, graph = this.graph, subgraph = this.subgraph, subnodes = this.subnodes, subedges = this.subedges
  this.updatePossibleAssignments (possibleAssignments)
  var nAssigned = Object.keys(mapping.assign).length
  var edgeMatch
  if (nAssigned) {
    var lastAssigned = subnodes[nAssigned-1]
    var edgeNotFound = false
    edgeMatch = subedges.map (function (edge) {
      var match
      if (!edgeNotFound && edge.v <= lastAssigned && edge.w <= lastAssigned) {
        match = ss.testEdgeMatch (mapping.assign[edge.v], mapping.assign[edge.w], edge.label)
        if (!match)
          edgeNotFound = true
      }
      return match
    })
    if (edgeNotFound)
      return []
  }
  if (nAssigned == subnodes.length) {
    var result = deepcopy(mapping)
    result.edgeMatch = edgeMatch
    return [result]
  }
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
        results = results.concat (ss.search (newPossibleAssignments))
        delete mapping.assign[nextToAssign]
        delete mapping.match[nextToAssign]
        delete possibleAssignments[nextToAssign][j]
        ss.updatePossibleAssignments (possibleAssignments)
      }
    }
  })
  return results
}

// Convert graphlib graph to graphviz dot format
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
}

Context.prototype.evalCond = function (isomorph, rule) {
  return this.evalMatchExpr (isomorph, rule.condition, true)
}

Context.prototype.evalWeight = function (isomorph, rule) {
  return this.evalMatchExpr (isomorph, rule.weight, 1)
}

Context.prototype.makeExtendedContext = function (isomorph) {
  var context = this
  var extendedContext = {}
  var keys = ['iter','graph']
  keys.forEach (function (key) { extendedContext['$'+key] = context[key] })
  Object.keys(isomorph.assign).forEach (function (id) {
    extendedContext[id] = { id: isomorph.assign[id] }
  })
  Object.keys(isomorph.match).forEach (function (id) {
    var match = isomorph.match[id]
    extendedContext[id] = extend (extendedContext[id] || {},
                                  { label: match[0],
                                    match: match })
  })
  return extendedContext
}

Context.prototype.evalMatchExpr = function (isomorph, expr, defaultVal) {
  if (typeof(expr) === 'undefined')
    return defaultVal
  if (typeof(expr) !== 'string')
    return expr
  var extendedContext = this.makeExtendedContext(isomorph)
  Object.keys(extendedContext).forEach (function (key) {
    eval ('$' + key + '="' + String(extendedContext[key]).replace('"','\\"') + '"')
  })
  return eval(expr)
}

Context.prototype.newLabel = function (isomorph, expr) {
  if (!expr) return expr
  var extendedContext = this.makeExtendedContext(isomorph)
  return expr.replace (/\${([a-zA-Z_0-9\.\$]+)}/g, function (_m, v) {
    return eval ('extendedContext.' + v) || ''
  })
}

Context.prototype.reattachIncoming = function (oldId, newId) {
  var context = this, graph = this.graph
  var incoming = graph.predecessors(oldId)
  if (incoming)
    incoming.forEach (function (pred) {
      var label = graph.edge (pred, oldId)
      context.addEdge (pred, newId, label)
      graph.removeEdge (pred, oldId)
      context.warn ("Replacing incoming edge " + context.edgeDesc(pred,oldId,label,colors.green,colors.red) + " with " + context.edgeDesc(pred,newId,label,colors.green,colors.green))
    })
}

Context.prototype.reattachOutgoing = function (oldId, newId) {
  var context = this, graph = this.graph
  var outgoing = graph.successors(oldId)
  if (outgoing)
    outgoing.forEach (function (succ) {
      var label = graph.edge (oldId, succ)
      context.addEdge (newId, succ, label)
      graph.removeEdge (oldId, succ)
      context.warn ("Replacing outgoing edge " + context.edgeDesc(oldId,succ,label,colors.red,colors.green) + " with " + context.edgeDesc(newId,succ,label,colors.green,colors.green))
    })
}

Context.prototype.nodeList = function (assign, color) {
  var context = this
  return '{' + Object.keys(assign).map((id) => (id+':'+context.nodeDesc(assign[id],color))).join (",") + '}'
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
