// api/services/BotService.js

var extend = require('extend')

module.exports = {

    decorate: function (player, game) {
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
            node.defaultSwipe = BotService.randomSwipe (player, game, node)

            var childSummary = node[node.defaultSwipe]
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
        })

        if (textNodes.length)
            game[Game.roleAttr(role,'defaultMove')] = textNodes[textNodes.length - 1].defaultMove.choice
    },

    randomSwipe: function (player, game, node) {
	var role = Game.getRole (game, player.id)
	var mood = Game.getRoleAttr (game, role, 'mood')
	switch (player.botmind.strategy) {
	case 'mood':
	    return Math.random() < player.botmind.swipeRightProb[mood] ? 'right' : 'left'
	    break;
	default:
	    break;
	}
	return 'd'
    },
}
