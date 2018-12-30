// api/services/BotService.js

var Promise = require('bluebird')
var extend = require('extend')

var parseTree = require('bracery').ParseTree
var VarsHelper = require('../../src/vars')

module.exports = {
  broadcastMessages: function (botInterval) {
    return Player.find ({ botInterval: botInterval,
                          botTemplate: { '!=': null } })
      .populate ('botTemplate')
      .then (function (players) {
        return Promise.each (players, function (player) {
          var botTemplate = player.botTemplate
          // TODO: SymbolService.expandContent, PlayerService.sendMessage
        })
      })
  }
}
