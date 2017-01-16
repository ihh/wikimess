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

  function expansionLabel (expansion, label) {
    var s
    if (expansion) {
      var e = getExpansionRoot (expansion)
      while (e) {
        var expr
        if (e.node) {
          var l = undefined
          if (e.node.labelexpr && e.node.labelexpr[label])
            l = evalExpansionExpr(e,e.node.labelexpr[label])
          else if (e.node.label && e.node.label[label])
	    l = e.node.label[label]
          if (l)
	    s = addLabel (s, l)
          }
	  if (e === expansion) break
	  e = e.next
	}
      }
      return s
    }

  function evalExpansionExpr (expansion, expr, failureVal, log) {
    if (typeof(log) === 'undefined')
      log = console.log

    var $label = expansionLabel.bind (this, expansion)

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
    return expr ? evalExpansionExpr(expansion,expr,false,log) : true
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
    expansionLabel: expansionLabel,
    evalExpansionExpr: evalExpansionExpr,
    evalVisible: evalVisible,
    evalLabel: evalLabel
  }
}))
