// api/services/BotService.js

module.exports = {

  randomMove: function (text) {
    var move = BotService.randomExpansion (text, 0, {})
    move.bot = true
    return move
  },

  addLabel: function (x, y) {
    return typeof(x) === 'undefined' ? y : (x + y)
  },
  
  randomExpansion: function (text, id, labelAccum) {
    var exp = { id: id }
    var node = text[id]
    if (node) {

      var $label = function (lab) { return labelAccum[lab] }
      function evalExpansionExpr (expr, failureVal) {
        var val
	try {
	  val = eval(expr)
        } catch (e) {
          sails.log.debug ("When evaluating: " + expr)
          sails.log.debug ("Error: " + e)
	  val = failureVal
	}
        return val
      }

      exp.label = node.label || {}
      if (node.labelexpr)
	Object.keys(node.labelexpr).forEach (function (lab) {
	  exp.label[lab] = evalExpansionExpr (node.labelexpr[lab])
	})
      Object.keys(exp.label).forEach (function (lab) {
	labelAccum[lab] = BotService.addLabel (labelAccum[lab], exp.label[lab])
      })

      if (node.sequence)
	exp.children = node.sequence.map (function (child) {
	  return BotService.randomExpansion (text, child.id, labelAccum)
	})
      else if (node.menu) {
	var visibleMenuItems = node.menu.filter (function (item, n) {
	  item.n = n
	  return item.visible ? evalExpansionExpr(item.visible,false) : true
	})
	if (visibleMenuItems.length) {
	  exp.action = visibleMenuItems[Math.floor (Math.random() * visibleMenuItems.length)].n
	  exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id, labelAccum)]
	}
      } else if (node.next) {
	exp.children = [BotService.randomExpansion (text, node.next.id, labelAccum)]
      } else if (node.left && node.right) {
	exp.action = Math.random() < .5 ? 'left' : 'right'
	exp.children = [BotService.randomExpansion (text, node[exp.action].id, labelAccum)]
      }
    }
    return exp
  }
}
