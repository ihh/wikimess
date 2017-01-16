(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.bighouseLabel = factory();
  }
}(this, function () {
  "use strict";

  function getExpansionRoot (expansion) {
    while (expansion.parent) expansion = expansion.parent
    return expansion
  }

  function addLabel (x, y) {
    return typeof(x) === 'undefined' ? y : (x + y)
  }

  function expansionLabel (e, label) {
    var l
    if (e.node) {
      if (e.node.labelexpr && e.node.labelexpr[label])
        l = evalExpansionExpr(e,e.node.labelexpr[label])
      else if (e.node.label && e.node.label[label])
	l = e.node.label[label]
    }
    return l
  }
  
  function expansionLabels (expansion, label) {
    var labs = []
    if (expansion) {
      var e = getExpansionRoot (expansion)
      while (e) {
        var l = expansionLabel (e, label)
        if (l)
	  labs.push (l)
	if (e === expansion) break
	e = e.next
      }
    }
    return labs
  }

  function lastExpansionLabel (expansion, label) {
    var labs = expansionLabels (expansion, label)
    return labs.pop()
  }

  function sumExpansionLabels (expansion, label) {
    var labs = expansionLabels (expansion, label)
    return labs.reduce (addLabel, undefined)
  }

  function parentExpansionLabel (expansion, label) {
    var l
    while (!l && (expansion = expansion.parent))
      l = expansionLabel (expansion, label)
    return l
  }
  
  function evalExpansionExpr (expansion, expr, failureVal, log) {
    if (typeof(log) === 'undefined')
      log = console.log

    var $label = sumExpansionLabels.bind (this, expansion)
    var $last = lastExpansionLabel.bind (this, expansion)
    var $parent = parentExpansionLabel.bind (this, expansion)

    var val
    try {
      val = eval(expr)
    } catch (e) {
      if (log) {
        log ("When evaluating: " + expr)
        log ("Error: " + e)
      }
      val = failureVal
    }
    return val
  }

  function evalVisible (expansion, expr, log) {
    return typeof(expr) !== 'undefined' ? evalExpansionExpr(expansion,expr,false,log) : true
  }

  function evalLabel (expansion, label, labelexpr, log) {
    label = label || {}
    if (labelexpr)
      Object.keys(labelexpr).forEach (function (lab) {
	label[lab] = evalExpansionExpr (expansion, labelexpr[lab])
      })
    return Object.keys(label).length ? label : undefined
  }
  
  return {
    getExpansionRoot: getExpansionRoot,
    addLabel: addLabel,
    expansionLabels: expansionLabels,
    lastExpansionLabel: lastExpansionLabel,
    sumExpansionLabels: sumExpansionLabels,
    parentExpansionLabel: parentExpansionLabel,
    evalExpansionExpr: evalExpansionExpr,
    evalVisible: evalVisible,
    evalLabel: evalLabel
  }
}))
