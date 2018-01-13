// api/services/BotService.js

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {
  sampleTransition: function (transitions, state, input) {
    var trans = transitions[state]
    var transWeight = trans.map (function (t) {
      var matchesAllKeywords = t.input.reduce (function (match, keyword) {
        return match && input.indexOf(keyword) >= 0
      }, true)
      return matchesAllKeywords ? t.weight : 0
    })
    return trans[SortService.sampleByWeight (transWeight)]
  }
}
