// api/services/BotService.js

var extend = require('extend')

module.exports = {

    randomMove: function (player, game) {
	var role = Game.getRole (game, player.id)
	var mood = Game.getRoleAttr (game, role, 'mood')
//	console.log("Player "+role+" mood "+mood+" P(C)="+player.botmind.probc[mood])

	var text = Game.getRoleAttr (game, role, 'text')
	// decorate each node in the text tree with random moves

	switch (player.botmind.strategy) {
	case 'mood':
	    return Math.random() < player.botmind.probc[mood] ? 'c' : 'd'
	    break;
	default:
	    break;
	}
	return 'd'
    },

}
