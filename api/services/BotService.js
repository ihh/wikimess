// api/services/BotService.js

var extend = require('extend')

module.exports = {

    decorate: function (player, game) {
	var role = Game.getRole (game, player.id)
	var textNodes = Game.getRoleAttr (game, role, 'text')

	// decorate each node in the text tree with random moves
        textNodes.forEach (function (node) {
            node.defaultSwipe = BotService.randomSwipe (player, game, node)
            var child = node[node.defaultSwipe]
            if (typeof(child.id) !== 'undefined')
                node.defaultMove = textNodes[child.id].defaultMove
            else
                node.defaultMove = child.choice
        })

        game[Game.roleAttr(role,'defaultMove')] = textNodes[textNodes.length - 1].defaultMove
    },

    randomSwipe: function (player, game, node) {
	var role = Game.getRole (game, player.id)
	var mood = Game.getRoleAttr (game, role, 'mood')
	switch (player.botmind.strategy) {
	case 'mood':
	    return Math.random() < player.botmind.probr[mood] ? 'right' : 'left'
	    break;
	default:
	    break;
	}
	return 'd'
    },
}
