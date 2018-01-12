// api/services/BotService.js

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {
  // TODO: write me
  updateBot: function (playerList, getPlayerEvent, nUpdates) {
    getPlayerEvent = getPlayerEvent || function (player) {
      // TODO: use promises here
      return { state: player.publicState,
               text: '' }
    }
    nUpdates = nUpdates || 1
    var playerRate = {}, playerTransRate = {}, totalPlayerRate = 0
    playerList.forEach (function (player) {
      var pr = {}
      var playerEvent = getPlayerEvent (player)
      var state = playerEvent.state, text = playerEvent.text
      var transitions = player.machineTransitions[state]
      var transRate = transitions.map (function (trans) {
        var matchesAllKeywords = trans.input.reduce (function (match, keyword) {
          return match && text.indexOf(keyword) >= 0
        }, true)
        return matchesAllKeywords ? trans.rate : 0
      })
      var totalTransRate = transRate.reduce (function (sum, r) { return sum + r }, 0)
      playerTransRate[player.id] = { transitions: transitions, transRate: transRate }
      playerRate[player.id] = totalTransRate
    })
  }
}
