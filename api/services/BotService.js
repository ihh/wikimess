// api/services/BotService.js

var Label = require('../../assets/js/bighouse/label.js')

module.exports = {

  randomMove: function (text) {
    var move = BotService.randomExpansion (text, 0)
    move.bot = true
    return move
  },

  addLabel: function (x, y) {
    return typeof(x) === 'undefined' ? y : (x + y)
  },
  
  randomExpansion: function (text, id, parent) {
    var exp = { id: id }
    var node = text[id]
    if (node) {
      exp.label = Label.evalLabel (exp, node.label, node.labelexpr)
      if (node.sequence)
	exp.children = node.sequence.map (function (child) {
	  return BotService.randomExpansion (text, child.id, exp)
	})
      else if (node.menu) {
	var visibleMenuItems = node.menu.filter (function (item, n) {
	  item.n = n
	  return Label.evalVisible (exp, item.visible)
	})
	if (visibleMenuItems.length) {
	  exp.action = visibleMenuItems[Math.floor (Math.random() * visibleMenuItems.length)].n
	  exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id, exp)]
	}
      } else if (node.next) {
	exp.children = [BotService.randomExpansion (text, node.next.id, exp)]
      } else if (node.left && node.right) {
	exp.action = Math.random() < .5 ? 'left' : 'right'
	exp.children = [BotService.randomExpansion (text, node[exp.action].id, exp)]
      }
    }
    return exp
  }
}
