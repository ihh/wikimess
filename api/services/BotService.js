// api/services/BotService.js

module.exports = {

  randomMove: function (text, queue) {
    return { children: queue.map (function (id) { return BotService.randomExpansion (text, id) }) }
  },

  randomExpansion: function (text, id) {
    var exp = { id: id }
    var node = text[id]
    if (node) {
      exp.label = node.label
      if (node.sequence)
	exp.children = node.sequence.map (function (child) { return BotService.randomExpansion (text, child.id) })
      else if (node.menu) {
	exp.action = Math.floor (Math.random() * node.menu.length)
	exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id)]
      } else if (node.left && node.right) {
	exp.action = Math.random() < .5 ? 'left' : 'right'
	exp.children = [BotService.randomExpansion (text, node[exp.action])]
      }
    }
    return exp
  }
}
