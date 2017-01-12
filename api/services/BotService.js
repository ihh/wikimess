// api/services/BotService.js

module.exports = {

  randomMove: function (text) {
    var move = BotService.randomExpansion (text, 0, {})
    move.bot = true
    return move
  },

  randomExpansion: function (text, id, cumulativeLabel) {
    var exp = { id: id }
    var node = text[id]
    if (node) {
      if (node.label) {
	exp.label = node.label
	Object.keys(node.label).forEach (function (lab) {
	  cumulativeLabel[lab] = (cumulativeLabel[lab] || '') + node.label[lab]
	})
      }
      if (node.sequence)
	exp.children = node.sequence.map (function (child) {
	  return BotService.randomExpansion (text, child.id, cumulativeLabel)
	})
      else if (node.menu) {
	var $label = function (lab) { return cumulativeLabel[lab] }
	var visibleMenuItems = node.menu.filter (function (item, n) {
	  item.n = n
	  var visible
	  if (item.visible) {
	    try {
	      visible = eval(item.visible)
            } catch (e) {
              sails.log.debug ("When evaluating: " + item.visible)
              sails.log.debug ("Error: " + e)
	      visible = false
	    }
	  } else
	    visible = true
	  return visible
	})
	if (visibleMenuItems.length) {
	  exp.action = visibleMenuItems[Math.floor (Math.random() * visibleMenuItems.length)].n
	  exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id, cumulativeLabel)]
	}
      } else if (node.next) {
	exp.children = [BotService.randomExpansion (text, node.next.id, cumulativeLabel)]
      } else if (node.left && node.right) {
	exp.action = Math.random() < .5 ? 'left' : 'right'
	exp.children = [BotService.randomExpansion (text, node[exp.action].id, cumulativeLabel)]
      }
    }
    return exp
  }
}
