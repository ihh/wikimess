// api/services/BotService.js

var extend = require('extend')

module.exports = {

  decorate: function (player, opponent, game) {
    var role = Game.getRole (game, player.id)
    var textNodes = Game.getRoleAttr (game, role, 'text')

    // decorate each node in the text tree with random moves
    function updateDefaultMove (nodeDefaultMove, childDefaultMove) {
      if (childDefaultMove) {
	var nodePriority = nodeDefaultMove.priority || 0
	var childPriority = childDefaultMove.priority || 0
	if (!(nodeDefaultMove.priority > childDefaultMove.priority)) {  // true if nodeDefaultMove.priority undefined
	  if (childDefaultMove.concat
	      && nodeDefaultMove.choice
	      && nodePriority == childPriority)
	    nodeDefaultMove.choice += childDefaultMove.choice
	  else
	    nodeDefaultMove = childDefaultMove
	}
      }
      return nodeDefaultMove
    }

    textNodes.forEach (function (node) {
      // don't decorate twice
      if (node.defaultMove)
        return
      
      var childSummary
      if (node.menu) {
	node.defaultMenuIndex = BotService.randomMenuIndex (player, game, node.menu)
	childSummary = node.menu[node.defaultMenuIndex]
      } else if (node.left && node.right) {
	node.defaultSwipe = BotService.randomSwipe (player, game, node)
	childSummary = node[node.defaultSwipe]
      }

      if (childSummary) {
	childSummary.defaultMove = { choice: childSummary.choice,
				     priority: childSummary.priority,
				     concat: childSummary.concat }

	if (typeof(childSummary.id) !== 'undefined') {
	  var childNode = textNodes[childSummary.id]
	  childSummary.defaultMove = updateDefaultMove (childSummary.defaultMove, childNode.defaultMove)
	}

	node.defaultMove = { choice: node.choice,
			     priority: node.priority,
			     concat: node.concat }

	node.defaultMove = updateDefaultMove (node.defaultMove, childSummary.defaultMove)
      }
    })
    
    if (textNodes.length)
      game[Game.roleAttr(role,'defaultMove')] = textNodes[textNodes.length - 1].defaultMove.choice
  },

  randomSwipe: function (player, game, node) {
    return BotService.randomOption (player, game, [{ opt: 'left', node: node.left, defaultVirtue: 0 },
                                                   { opt: 'right', node: node.right, defaultVirtue: 1 }])
  },

  randomMenuIndex: function (player, game, menu) {
    var len = menu.length
    var opts = menu.map (function (node, n) {
      return { opt: n, node: node, defaultVirtue: (1 - (n / (len - 1))) }
    })
    return BotService.randomOption (player, game, opts)
  },

  randomOption: function (player, game, opts) {
    var role = Game.getRole (game, player.id)
    var mood = Game.getRoleAttr (game, role, 'mood')
    var oppMood = Game.getOtherRoleAttr (game, role, 'mood')
    var virtues = opts.map (function (opt) {
      return typeof(opt.node.virtue) === 'undefined' ? opt.defaultVirtue : opt.node.virtue
    })
    var greeds = virtues.map (function (v) { return v >= 1 ? 0 : (1-v) })
    var probVirtue = .5
    switch (player.botmind.strategy) {
    case 'mood':
      probVirtue = player.botmind.swipeRightProb[mood]
      break;
    case 'oppmood':
      probVirtue = player.botmind.swipeRightProb[oppMood]
      break;
    default:
      break;
    }
    var w = Math.random(), weights, i
    if (w < probVirtue) { w /= probVirtue; weights = virtues }
    else { w = (w - probVirtue) / (1 - probVirtue); weights = greeds }
    var totalWeight = weights.reduce (function(sum,x) { return sum + x }, 0)
    if (totalWeight == 0)
      weights = weights.map (function() { return 1 })
    for (i = 0; i < weights.length - 1; ++i)
      if ((w -= weights[i]) <= 0)
        break
    return opts[i].opt
  },
}
