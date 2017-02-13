var extend = require('extend'),
    deepcopy = require('deepcopy'),
    graphlib = require('graphlib')

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

module.exports = { SubgraphSearch }
