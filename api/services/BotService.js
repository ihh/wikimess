// api/services/BotService.js

var Promise = require('bluebird')
var extend = require('extend')

var parseTree = require('../../assets/js/wikimess/parsetree.js')

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
  },

  answerMessagePeriod: 60000,  // 60 seconds
  startBots: function() {
    var svc = this
    this.answerMessageTimer = setInterval (function() {
      var now = Date()
//      sails.log.debug ('answerMessages starting at ' + now)
      svc.answerMessages().then (function() {
//        sails.log.debug ('finished answerMessages started at ' + now)
      })
    }, svc.answerMessagePeriod)
  },
  
  answerMessages: function() {
    // get all bots
    return Bot.find({}).then (function (bots) {
      var firstMsg = {}, player2bot = {}
      var botPlayerIDs = bots.map (function (bot) { return bot.player })
      bots.forEach (function (bot) { player2bot[bot.player] = bot })
      // get all messages to bots
      return Message.find ({ recipient: botPlayerIDs,
                             sender: { '!': null },
                             read: false })
        .then (function (messages) {
          messages.forEach (function (message) {
            firstMsg[message.recipient] = firstMsg[message.recipient] || {}
            var oldMessage = firstMsg[message.recipient][message.sender]
            if (!oldMessage || (new Date(message.createdAt) < new Date(oldMessage.createdAt)))
              firstMsg[message.recipient][message.sender] = message
          })
          var interactions = Object.keys(firstMsg).reduce (function (list, recipient) {
            var bot = player2bot[recipient], fmr = firstMsg[recipient]
            return list.concat (Object.keys(fmr).map (function (sender) {
              var message = fmr[sender]
              var text = parseTree.makeExpansionText (message.body)
              var inter = { bot: bot,
                            self: recipient,
                            other: sender,
                            message: message,
                            text: text }
              return inter
            }))
          }, [])
          return Promise.map (interactions, function (inter) {
            return Message.update ({ id: event.message.id,
                                     read: true })
              .then (function() {
                return Mood.findOrCreate ({ self: inter.self,
                                            other: inter.other },
                                          { self: inter.self,
                                            other: inter.other,
                                            state: inter.bot.startState })
              }).then (function (mood) {
                var trans = BotService.sampleTransition (bot.transitions, mood.state, text)
                return Mood.update ({ id: mood.id },
                                    { state: trans.dest })
                  .then (function() {
                    return SymbolService.expandRhs (trans.output)
                      .then (function (rhs) {
                        return PlayerService.sendMessage
                        ({ playerID: recipient,
                           recipientID: sender,
                           template: { content: event.rhs },  // wasteful to create a new template for every bot reply; TODO we should cache the templates somehow.
                           body: { type: 'root',
                                   rhs: rhs },
                           previous: event.message.id,
                           isPublic: false })
                      })
                  })
              })
          })
        })
    })
  }
}
