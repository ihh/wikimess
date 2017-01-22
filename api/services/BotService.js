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
      exp.children.map (BotService.removeLinks)
  },
  
  randomExpansion: function (text, id, parent) {
    var node = text[id]
    var exp = { id: id, node: node }
    if (node) {
      exp.label = Label.evalLabel (exp, node.label, node.labelexpr)
      if (node.sequence) {
	exp.children = []
	node.sequence.forEach (function (child, n) {
	  var c = BotService.randomExpansion (text, child.id, exp)
	  if (n > 0) exp.children[n-1].tail.next = c
	  exp.children.push (c)
	})
      }
      else if (node.menu) {
	var visibleMenuItems = node.menu.filter (function (item, n) {
	  item.n = n
	  return Label.evalVisible (exp, item) && Label.evalUsable (exp, item)
	})
	if (visibleMenuItems.length) {
	  exp.action = visibleMenuItems[Math.floor (Math.random() * visibleMenuItems.length)].n
	  exp.children = [BotService.randomExpansion (text, node.menu[exp.action].id, exp)]
	}
      } else if (node.next)
	exp.children = [BotService.randomExpansion (text, node.next.id, exp)]
      else if (node.left && node.right) {
	exp.action = Math.random() < .5 ? 'left' : 'right'
	exp.children = [BotService.randomExpansion (text, node[exp.action].id, exp)]
      }
    }
    if (exp.children && exp.children.length) {
      exp.tail = exp.children[exp.children.length-1].tail
      exp.next = exp.children[0]
    } else
      exp.tail = exp
    return exp
  }
}
