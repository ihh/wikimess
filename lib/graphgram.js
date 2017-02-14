var _ = require('lodash'),
    extend = require('extend'),  // NB: skips undefined values, unlike lodash extend (or lodash assign)
    merge = _.merge,
    deepcopy = require('deepcopy'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors'),
    MersenneTwister = require('mersennetwister'),
    SubgraphSearch = require('./subgraph').SubgraphSearch

function isArray (obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

// special terms used in lhs label expressions
var equalsKey = '$equals',
    containsKey = '$contains',
    findKey = '$find',  // recursive descent search
    notKey = '$not',
    andKey = '$and',
    orKey = '$or'

// special terms used in rhs label expressions
var evalKey = '$eval',
    extendKey = '$extend',  // skips undefined values
    assignKey = '$assign',  // does not skip undefined values
    mergeKey = '$merge'  // is recursive

function Grammar (json) {
  this.rules = []
  if (json) {
    this.validate (json)
    extend (this, json)
  }
  this._init()
}

function makeGraphSchema (lhs) {
  var labelSchema = { '$ref': (lhs ? '#/definitions/lhs_label' : '#/definitions/rhs_label') }
  return {
    oneOf: [{ type: 'array', items: { type: 'string' } },  // interpreted as a chain of nodes
            { type: 'string' },  // interpreted as a single node
            { type: 'object',
              required: lhs ? ['node'] : [],
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
                              properties: extend ({
                                id: { '$ref': '#/definitions/identifier' },
                                label: labelSchema,
                              }, lhs ? {
                                strict: { type: 'boolean' }  // if true, then matching graph node cannot have any neighbors that are not in the subgraph
                              } : {
                                head: { '$ref': '#/definitions/identifier_or_list' },  // if an lhs node is specified here, incoming edges to that lhs node will be attached
                                tail: { '$ref': '#/definitions/identifier_or_list' }   // if an lhs node is specified here, outgoing edges from that lhs node will be attached
                              })
                            }]
                  }
                },
                edge: {
                  type: 'array',
                  items: {
                    anyOf: [{ type: 'array',
			      minItems: 2,
			      maxItems: lhs ? 4 : 3,
			      items: [ { type: ['string','number'] },  // v
				       { type: ['string','number'] },  // w
				       labelSchema ]  // label
                              .concat (lhs ? [{type:'string'}] : []) },  // id
                            { type: 'object',
                              additionalProperties: false,
                              required: ['v','w'],
                              properties: extend ({
                                v: { '$ref': '#/definitions/identifier' },
                                w: { '$ref': '#/definitions/identifier' },
                                label: labelSchema
                              }, lhs ? { id: { '$ref': '#/definitions/identifier' } } : {})
                            }].concat (lhs ? [] : [{
                              type: 'object',
                              additionalProperties: false,
                              required: ['id'],
                              properties: { id: { '$ref': '#/definitions/identifier' } }
                            }, { type: 'string' }])
                  }
                }
              }
            }]
  }
}

function makeGrammarSchema (topLevel, staged) {
  return extend ({
    type: 'object',
    required: (topLevel ? ['start'] : []).concat (staged ? ['stages'] : ['rules']),
    additionalProperties: false,
    properties: extend
    (staged
     ? { stages: { type: 'array', minItems: 1, items: { '$ref': '#/definitions/subgrammar' } } }
     : { rules: { '$ref': '#/definitions/rules' } },
     { name: { type: 'string' },
       limit: { type: 'number' },  // maximum number of rule applications
       induced: { type: 'boolean' } },  // default 'induced', overridden by 'induced' for individual stages/rules
     topLevel ? {start:{}} : {})
  })
}

Grammar.prototype.schema = {
  oneOf: [ makeGrammarSchema(true,false),
	   makeGrammarSchema(true,true) ],
  definitions: {
    identifier: {
      type: 'string',
      pattern: '^[a-zA-Z_][a-zA-Z_0-9]*$'
    },
    identifier_or_list: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { '$ref': '#/definitions/identifier' } }]
    },
    lhs_label: {
      oneOf: [{ type: ['string','number','boolean','array'] },
              { type: 'object',
                maxProperties: 1,
                additionalProperties: false,
                properties: {
                  '$equals': { '$ref': '#/definitions/lhs_label' },
                  '$contains': { '$ref': '#/definitions/lhs_label' },
                  '$find': { '$ref': '#/definitions/lhs_label' },
                  '$not': { '$ref': '#/definitions/lhs_label' },
                  '$and': { type: 'array', minItems: 1, items: { '$ref': '#/definitions/lhs_label' } },
                  '$or': { type: 'array', minItems: 1, items: { '$ref': '#/definitions/lhs_label' } }
                }
              },
              { type: 'object',
                additionalProperties: false,
                patternProperties: {
                  '^[^$].*$': { '$ref': '#/definitions/lhs_label' }
                }
              }]
    },
    rhs_label: {
      oneOf: [{ type: ['string','number','boolean','array'] },
              { type: 'object',
                maxProperties: 1,
                additionalProperties: false,
                properties: {
                  '$eval': { type: ['string','array','object'] },
                  '$extend': { type: 'array', minItems: 2, items: { '$ref': '#/definitions/rhs_label' } },
                  '$assign': { type: 'array', minItems: 2, items: { '$ref': '#/definitions/rhs_label' } },
                  '$merge': { type: 'array', minItems: 2, items: { '$ref': '#/definitions/rhs_label' } }
                }
              },
              { type: 'object',
                additionalProperties: false,
                patternProperties: {
                  '^[^$].*$': { '$ref': '#/definitions/rhs_label' }
                }
              }]
    },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lhs','rhs'],
        additionalProperties: false,
        properties: {
	  name: { type: 'string' },
          lhs: makeGraphSchema(true),
          rhs: makeGraphSchema(false),
          induced: { type: 'boolean' },  // if true, match lhs using induced subgraph search
          condition: { type: 'string' },  // eval'd string. Use $id.label for labels, $id.match[n] for n'th matching group, $$iter for iteration#, $$graph for graph
          weight: { type: ['string','number'] },  // string is eval'd using same expansions as 'condition'
          limit: { type: 'number' },  // max number of times this rule can be used
          type: { type: 'string' },  // if set, then 'limit' for this rule applies to all rules of this type
          delay: { type: 'number' },  // minimum number of iterations (rule applications) before this rule can be used
        }
      }
    },
    subgrammar: makeGrammarSchema(false,false)
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

Grammar.prototype._init = function() {
  var grammar = this
  this.name = this.name || 'graph-grammar'
  if (this.stages)
    this.stages = this.stages.map ((subgrammar, n) => new Grammar (extend ( { start: null,
									      name: this.name + ' stage #' + n,
									      induced: this.induced },
									    subgrammar)))
  this.rules.forEach (function (rule, n) {
    rule.n = n
    rule.type = rule.type || n
    rule.name = rule.name || ('rule #' + rule.n)
    if (typeof(rule.induced) === 'undefined')
      rule.induced = grammar.induced

    var linkHeadTailRhs = false, headOrTail = {}
    function checkGraph (prop, nodeIdFactory, lhsInfo) {
      var isNodeId = {}, isEdgeId = {}
      var name = rule.name + ' ' + prop
      
      // do some auto-expansion of syntactic sugar
      if (typeof(rule[prop]) === 'string') {
        // a string expands to a single node, and triggers automatic linking of head & tail
        linkHeadTailRhs = true
        rule[prop] = { node: [{ id: 'a', label: rule[prop] }] }
      } else if (isArray(rule[prop])) {
        // an array of strings expands to a chain of nodes, and triggers automatic linking of head & tail
        linkHeadTailRhs = true
        rule[prop] = { node: rule[prop].map (function (label, n) { return { id: nodeIdFactory(n), label: label, strict: (n == 0 || n == rule[prop].length - 1) } }),
                       edge: rule[prop].slice(1).map (function (_label, n) { return [ nodeIdFactory(n), nodeIdFactory(n+1) ] }) }
      }

      var graph = rule[prop]
      // if node is missing on rhs, copy it from lhs
      if (typeof(graph.node) === 'undefined')
        graph.node = deepcopy (rule.lhs.node)
      graph.node = graph.node.map (function (node, n) {
        // if a node is a string or number, interpret it as a label, and auto-assign it an ID
        // if a node is a 2-tuple, interpret it as an [id,label] pair
	if (isArray(node))
	  return { id: node[0], label: node[1] }
	else if (typeof(node) === 'object') {
	  if (typeof(node.id) === 'undefined')
	    node.id = nodeIdFactory(n)
	  // if a node doesn't have a label but has the ID of an LHS node, then copy the label over
	  if (typeof(node.label) === 'undefined' && lhsInfo && lhsInfo.isNodeId[node.id]) {
	    node.label = {}
	    node.label[evalKey] = '$' + node.id + '.label'
	  }
	  return node
	}
	return { id: nodeIdFactory(n), label: node }
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
          // if an edge is a string, interpret it as an id
          // if an edge is a 2-, 3- or 4-tuple, interpret it as [v,w,label,id]
          var e = typeof(edge) === 'string' ? { id: edge } : (isArray(edge) ? { v: edge[0], w: edge[1], label: edge[2], id: edge[3] } : edge)
          e.v = e.v && String (e.v)
          e.w = e.w && String (e.w)
          e.id = e.id && String (e.id)
	  // if an edge doesn't have a label but has the ID of an LHS edge, then copy the label over
	  if (e.id && lhsInfo && lhsInfo.isEdgeId[e.id]) {
            if (typeof(e.label) === 'undefined') {
	      e.label = {}
	      e.label[evalKey] = '$' + e.id + '.label'
            }
            // if v or w is undefined, copy those over
            if (typeof(e.v) === 'undefined') e.v = lhsInfo.isEdgeId[e.id].v
            if (typeof(e.w) === 'undefined') e.w = lhsInfo.isEdgeId[e.id].w
	  }
          return e
        })

      // all done with syntactic sugar
      // now validate IDs
      var heads = {}, tails = {}
      function checkNodeId (id, desc, isNodeId) {
        if (!isNodeId[id]) throw new Error ("In " + name + ", " + desc + ": " + id + " is not a node ID")
      }
      function countNodeId (id, linkType, count, rhsNodeId) {
        checkNodeId (id, 'node ' + rhsNodeId + ' ' + linkType, lhsInfo.isNodeId)
        if (count[id])
          throw new Error ("In " + name + ": " + id + " appears as " + linkType + " for more than one rhs node")
        count[id] = true
        if (id !== rhsNodeId)
          headOrTail[id] = linkType
      }
      graph.node.forEach (function (node) {
        if (isNodeId[node.id]) throw new Error ("In " + name + ": duplicate node ID " + node.id)
        isNodeId[node.id] = node
        if (lhsInfo) {
          if (node.head)
            node.head.forEach (function (head) { countNodeId (head, 'head', heads, node.id) })
          if (node.tail)
            node.tail.forEach (function (tail) { countNodeId (tail, 'tail', tails, node.id) })
        }
      })
      if (graph.edge)
        graph.edge.forEach (function (edge) {
          checkNodeId (edge.v, 'edge.v', isNodeId)
          checkNodeId (edge.w, 'edge.w', isNodeId)
          if (edge.id) {
            if (isNodeId[edge.id] || isEdgeId[edge.id]) throw new Error ("In " + name + ": duplicate edge ID " + edge.id)
            isEdgeId[edge.id] = edge
          }
        })

      return { isNodeId, isEdgeId }
    }
    var lhsInfo = checkGraph ('lhs', (n) => String.fromCharCode(97+n))
    var rhsInfo = checkGraph ('rhs', (n) => String(n), lhsInfo)
    Object.keys(headOrTail).forEach (function (id) {
      if (rhsInfo.isNodeId[id])
        throw new Error ("In " + rule.name + ": lhs node " + id + " is listed as " + headOrTail[id] + " for an rhs node, but is also an rhs node ID")
    })
    rule.lhsGraph = grammar.makeGraph (rule.lhs)
  })
}

Grammar.prototype.evolve = function (opts) {
  var grammar = this
  opts = opts || {}

  var mt = opts.rnd || new MersenneTwister (opts.seed)
  var context = new Context ({ grammar: this }, { verbose: opts.verbose })

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
  var limit = typeof(opts.limit) !== 'undefined' ? parseInt(opts.limit) : this.limit

  if (this.stages) {
    var iterations = 0
    this.stages.forEach (function (subgrammar, stage) {
      var subLimit = limit
      if (typeof(subgrammar.limit) !== 'undefined' && (typeof(subLimit) === 'undefined' || subgrammar.limit < subLimit))
        subLimit = subgrammar.limit

      if (subLimit == 0 || (typeof(opts.stage) !== 'undefined' && stage != parseInt(opts.stage))) {
        context.warn (colors.cyan ("Skipping " + subgrammar.name + " of " + grammar.name))
        return
      }
      
      context.warn (colors.cyan ("Entering " + subgrammar.name + " of " + grammar.name))
      var info = subgrammar.evolve ({ graph: graph,
				      verbose: opts.verbose,
				      limit: subLimit,
				      rnd: mt })
      iterations += info.iterations
      if (typeof(limit) === 'number')
	limit -= info.iterations
    })
    return { iterations, graph }
  }
  
  var ruleCount = {}
  this.rules.forEach (function (rule) {
    ruleCount[rule.type] = 0
  })

  var iter
  for (iter = 0; typeof(limit) === 'undefined' || iter < limit; ++iter) {
    var nodes = graph.nodes(), edges = graph.edges(), sites = []

    context.iter = iter
    context.warn (colors.cyan ("Iteration " + (iter+1) + " of " + grammar.name))

    this.rules.forEach (function (rule, n) {
      if (rule.limit && ruleCount[rule.type] >= rule.limit)
        return
      if (rule.delay && iter < rule.delay)
        return
      
      var isomorphs = new SubgraphSearch (graph, rule.lhsGraph, { labelMatch }).isomorphisms
      isomorphs.forEach (function (isomorph) {
        var mismatch = false
        rule.lhs.node.forEach (function (node) {
          mismatch = mismatch || (node.strict && rule.lhsGraph.neighbors(node.id).length != graph.neighbors(isomorph.assign[node.id]).length)
        })
        if (rule.induced)
          rule.lhs.node.forEach (function (iNode) {
            var si = iNode.id, gi = isomorph.assign[si]
            rule.lhs.node.forEach (function (jNode) {
              var sj = jNode.id, gj = isomorph.assign[sj]
              mismatch = mismatch || (graph.hasEdge(gi,gj) && !subgraph.hasEdge(si,sj))
            })
          })
	if (!mismatch) {
          if (rule.lhs.edge)
            rule.lhs.edge.forEach (function (edge, n) {
              if (edge.id) {
                isomorph.match[edge.id] = isomorph.edgeMatch[n]
		isomorph.label[edge.id] = graph.edge (isomorph.assign[edge.v], isomorph.assign[edge.w])
	      }
            })
          if (context.evalCond (isomorph, rule)) {
            var weight = context.evalWeight (isomorph, rule)
            context.warn ('Found match ' + context.nodeList(isomorph.assign,colors.red) + ' to ' + rule.name + ' with weight ' + colors.blue(weight))
            sites.push ({ weight, isomorph, rule })
          }
	}
      })
    })

    var totalWeight = sites.reduce (function (total, s) { return total + s.weight }, 0)
    var w = mt.rnd() * totalWeight, m = -1
    while (w > 0 && ++m < sites.length - 1)
      w -= sites[m].weight

    context.warn(colors.blue("Total weight is " + totalWeight + "; " + (totalWeight > 0 ? ("sampled " + sites[m].rule.name) : "quitting")))
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

  return { iterations: iter,
	   graph: graph }
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

// Convert graphlib graph to graphviz dot format
Grammar.prototype.toDot = function (graph) {
  var grammar = this
  return ["digraph G {"]
    .concat (graph.nodes().map (function (id) {
      return '  ' + id + grammar.dotAttrs(graph.node(id)) + ';'
    })).concat (graph.edges().map (function (edge) {
      return '  ' + edge.v + ' -> ' + edge.w + grammar.dotAttrs(graph.edge(edge)) + ';'
    })).concat (['}',''])
    .join("\n")
}

Grammar.prototype.dotAttrs = function (label) {
  var attrText = ''
  if (typeof(label) === 'string') attrText = ' [label="' + label + '"]'
  else if (typeof(label) === 'object' && label.dot)
    attrText = ' [' + Object.keys(label.dot).map((a) => (a + '="' + label.dot[a] + '"')).join(',') + ']'
  return attrText
}

function Context (json, opts) {
  extend (this, json, { nextNodeId: 1 })
  this.warn = this.grammar.warn
  this.verbose = this.grammar.verbose
  extend (this, opts)
}

Context.prototype.findNextIds = function() {
  var context = this
  this.graph.nodes().forEach (function (id) {
    var n = parseInt (id)
    if (n) context.nextNodeId = Math.max (context.nextNodeId, n + 1)
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
    extendedContext[id] = extend (extendedContext[id] || {},
                                  { label: isomorph.label[id],
                                    match: isomorph.match[id].match })
  })
  return extendedContext
}

function mapObject (obj, f) {
  var result = {}
  Object.keys(obj).forEach (function (k) { result[k] = f(obj[k]) })
  return result
}

Context.prototype.evalMatchExpr = function (isomorph, expr, defaultVal) {
  var evalMatchExprForIsomorph = this.evalMatchExpr.bind (this, isomorph)
  if (typeof(expr) === 'undefined')
    return defaultVal
  else if (typeof(expr) === 'string') {
    var extendedContext = this.makeExtendedContext(isomorph)
    var defs = Object.keys(extendedContext).map (function (key) {
      return '$' + key + '=' + JSON.stringify(extendedContext[key]) + ';'
    }).join('')
    return eval(defs + expr)
  } else if (isArray(expr))
    return expr.map (evalMatchExprForIsomorph)
  else if (typeof(expr) === 'object')
    return mapObject (expr, evalMatchExprForIsomorph)
  else
    return expr
}

function labelMatch (gLabel, sLabel, opts) {
  opts = opts || {}
  if (typeof(sLabel) === 'undefined')
    return { match: gLabel }
  var typesMatch = (typeof(sLabel) === typeof(gLabel))
  if (typeof(sLabel) === 'string') {
    var match
    return typesMatch && (match = new RegExp('^'+sLabel+'$').exec (gLabel)) && { match: match.slice(0) }
  } else if (isArray(sLabel)) {
    if (!isArray(gLabel) || sLabel.length !== gLabel.length)
      return false
    var allMatch = true
    var match = sLabel.map (function (s, n) {
      var m
      if (allMatch) {
	m = labelMatch (gLabel[n], s, opts)
	if (!m) allMatch = false
      }
      return m && m.match
    })
    return allMatch && { match }
  } else if (typeof(sLabel) === 'object') {
    var match = {}, clauseMatch
    if (sLabel[equalsKey])
      return labelMatch (gLabel, sLabel[equalsKey], extend ({}, opts, {exact:true}))
    if (sLabel[containsKey])
      return labelMatch (gLabel, sLabel[containsKey], extend ({}, opts, {exact:false}))
    if (sLabel[notKey])
      return !labelMatch (gLabel, sLabel[notKey], opts) && {}
    if (sLabel[andKey])
      return sLabel[andKey].reduce (function (allTrue, clause) {
        return allTrue && (clauseMatch = labelMatch (gLabel, clause, opts)) && extend (match, clauseMatch.match)
      }, true) && { match }
    if (sLabel[orKey])
      return sLabel[orKey].reduce (function (anyTrue, clause) {
        return anyTrue || ((clauseMatch = labelMatch (gLabel, clause, opts)) && ((match = clauseMatch.match) || true))
      }, false) && { match }
    if (sLabel[findKey]) {
      var findLabel = sLabel[findKey]
      function find (g) {
        var result = labelMatch (g, findLabel, opts)
        if (isArray(g))
          result = g.reduce (function (r, c) { return r || find(c) }, result)
        else if (typeof(g) === 'object')
          result = Object.keys(g).reduce (function (r, k) { return r || find(g[k]) }, result)
        return result
      }
      return find (gLabel)
    }

    var allMatch = typesMatch && (!opts.exact || Object.keys(gLabel).length == Object.keys(sLabel).length)
    Object.keys(sLabel).forEach (function (k) {
      if (allMatch) {
	var m = labelMatch (gLabel[k], sLabel[k], opts)
	if (m)
	  match[k] = m.match
	else
	  allMatch = false
      }
    })
    return allMatch && { match }
  } else
    return typesMatch && gLabel === sLabel && { match: gLabel }
}

Context.prototype.newLabel = function (isomorph, expr) {
  var newLabelForIsomorph = this.newLabel.bind (this, isomorph)
  if (typeof(expr) === 'string') {
    var extendedContext = this.makeExtendedContext(isomorph)
    return expr.replace (/\${([a-zA-Z_0-9\.\$\[\]]+)}/g, function (_m, v) {
      return eval ('extendedContext.' + v) || ''
    })
  } else if (isArray(expr))
    return expr.map (newLabelForIsomorph)
  else if (typeof(expr) === 'object') {
    if (expr[evalKey])
      return this.evalMatchExpr (isomorph, expr[evalKey])
    if (expr[extendKey])
      return extend.apply (null, expr[extendKey].map (newLabelForIsomorph))
    if (expr[assignKey])
      return _.assign.apply (null, expr[assignKey].map (newLabelForIsomorph))
    if (expr[mergeKey])
      return merge.apply (null, expr[mergeKey].map (newLabelForIsomorph))
    return mapObject (expr, newLabelForIsomorph)
  } else
    return expr
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

Context.prototype.labelString = function (label) {
  return typeof(label) === 'object' ? JSON.stringify(label) : label
}

Context.prototype.nodeList = function (assign, color) {
  var context = this
  return '{' + Object.keys(assign).map((id) => (id+':'+context.nodeDesc(assign[id],color))).join (",") + '}'
}

Context.prototype.nodeDesc = function (id, color, rev) {
  color = color.bind (colors)
  var idText = color(id), labelText = colors.inverse(color(this.labelString(this.graph.node(id))))
  return rev ? (labelText + idText) : (idText + labelText)
}

Context.prototype.edgeDesc = function (src, dest, label, srcColor, destColor) {
  var srcDesc = this.nodeDesc(src,srcColor), destDesc = this.nodeDesc(dest,destColor,true)
  return srcDesc + colors.yellow('-') + (label ? colors.inverse(colors.yellow(this.labelString(label))) : '') + colors.yellow('>') + destDesc
}

module.exports = { Grammar }
