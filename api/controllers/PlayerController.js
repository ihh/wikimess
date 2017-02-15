/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var extend = require('extend')

module.exports = {
  create: function (req, res) {
    if (SchemaService.validatePlayer (req.body, res.badRequest.bind(res)))
      Player.create (req.body)
      .then (function (player) {
	var botPromise = player.human
	  ? Player.find ({ human: false, partner: null })
	  .then (function (botPlayers) {
	    botPlayers.forEach (function (bot) {
	      bot.partner = player.id
	      bot.name = bot.name + '-' + player.id
	      delete bot.id
	    })
	    return botPlayers
	  })
	: Player.find ({ human: true })
	  .then (function (humanPlayers) {
	    return humanPlayers.map (function (human) {
	      var bot = extend ({}, player)
	      bot.partner = human.id
	      bot.name = bot.name + '-' + human.id
	      delete bot.id
	    })
	    return botPlayers
	  })
	return botPromise.then (function (newBotPlayers) {
	    return Player.create (newBotPlayers)
	    .then (function (bots) {
	      return player
	    })
	})
      }).then (res.send.bind(res))
      .catch (res.badRequest.bind(res))
  }
};
