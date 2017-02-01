// api/services/BotService.js

var Label = require('../../assets/js/bighouse/label.js')

module.exports = {

  randomMove: function (text) {
    var move = BotService.randomExpansion (text, 0)
    BotService.removeLinks (move)
    move.bot = true
    return move
  },

  makeRandomMove: function (game, role) {
    var move = BotService.randomMove (Game.getRoleAttr (game, role, 'text', game.flip))
    var mood = BotService.finalMood (move, Game.flipRole (role, game.flip))
    if (mood)
      Game.setRoleAttr (game, role, 'mood', mood, game.flip)
    Game.setRoleAttr (game, role, 'move', move, game.flip)
  },

  finalMood: function (exp, role) {
    var mood
    if (exp.text) {
      var match, moodRegex = /<mood([12]?):(happy|sad|surprised|angry)>/g
      while (match = moodRegex.exec(exp.text))
	if (match[1] === '' || parseInt(match[1]) === role)
	  mood = match[2]
    }
    if (exp.children)
      exp.children.forEach (function (child) {
	mood = BotService.finalMood(child,role) || mood
      })
    return mood
  },
  
  removeLinks: function (exp) {
    delete exp.parent
    delete exp.tail
    delete exp.next
    delete exp.node
    if (exp.children)
      exp.children.forEach (BotService.removeLinks)
  },
  
  randomExpansion: function (text, id, parent, prev) {
    var node = text[id]
    var exp = { id: id, node: node, parent: parent }
    if (prev)
      prev.next = exp
    if (node) {
      exp.label = Label.evalLabel (exp, node.label, node.labexpr)
      if (node.sequence) {
	exp.children = []
	node.sequence.forEach (function (child, n) {
	  exp.children.push (BotService.randomExpansion (text, child.id, exp, n == 0 ? exp : exp.children[n-1].tail))
	})
      }
      else if (node.menu) {
	exp.action = Label.autoAction (exp)
	exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id, exp, exp)]
      } else if (node.next)
	exp.children = [BotService.randomExpansion (text, node.next.id, exp, exp)]
      else if (node.left && node.right) {
	exp.action = Label.autoAction (exp)
	exp.children = [BotService.randomExpansion (text, node[exp.action].id, exp, exp)]
      }
    }
    exp.tail = (exp.children && exp.children.length) ? exp.children[exp.children.length-1].tail : exp
    return exp
  }
}
