// api/services/BotService.js

module.exports = {

    randomMove: function (player, game) {
	var role = Game.getRole (game, player.id)
	var mood = Game.getRoleAttr (game, role, 'mood')
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
