/**
 * Game.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var extend = require('extend')

module.exports = {

  attributes: {
      id: {
          type: 'integer',
          autoIncrement: true,
          unique: true,
          primaryKey: true
      },

      player1: {
          model: 'player'
      },

      player2: {
          model: 'player'
      },

      // current state of the game
      finished: {
          type: 'boolean',
          defaultsTo: false
      },

      current: {
          model: 'choice'
      },

      future: {
          type: 'array',
          defaultsTo: []
      },

      moves: {  // number of COMPLETED moves. The index of the moves themselves start at 1
          type: 'integer',
          defaultsTo: 0
      },

      // player choices
      move1: {
          type: 'string',
          enum: ['c', 'd']
      },

      move2: {
          type: 'string',
          enum: ['c', 'd']
      },

      lastOutcome: {
	  model: 'outcome',
      },

      // player state specific to this game
      mood1: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised'],
          defaultsTo: 'happy'
      },

      mood2: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised'],
          defaultsTo: 'happy'
      },

      local1: {
          type: 'json',
          defaultsTo: {}
      },

      local2: {
          type: 'json',
          defaultsTo: {}
      },
},

    isWaitingForMove: function (game, role) {
	return role == 1 ? (game.move2 || !game.move1) : (game.move1 || !game.move2)
    },
    
    forRole: function (game, role) {
        var intro, verb, hintc, hintd, self, other, selfMood, otherMood, waiting
        var current = game.current
        if (role == 1) {
            if (current) {
                intro = current.intro
                verb = current.verb
                hintc = current.hintc
                hintd = current.hintd
            }
            self = game.player1
            other = game.player2
            selfMood = game.mood1
            otherMood = game.mood2
        } else {  // role == 2
            if (current) {
                intro = current.intro2 || current.intro
                verb = current.verb2 || current.verb
                hintc = current.hintc2 || current.hintc
                hintd = current.hintd2 || current.hintd
            }
            self = game.player2
            other = game.player1
            selfMood = game.mood2
            otherMood = game.mood1
        }
        if (intro)
            intro = GameService.expandText (intro, [game.player1.name, game.player2.name], role)
        var json = { finished: game.finished,
                     waiting: Game.isWaitingForMove (game, role),
                     intro: intro,
                     verb: verb,
                     hintc: hintc,
                     hintd: hintd,
                     self: { mood: selfMood },
                     other: { id: other.id, name: other.name, mood: otherMood },
                     move: game.moves + 1 }
	if (game.lastOutcome)
	    json.lastOutcome = Outcome.forRole (game, game.lastOutcome, role)
	return json
    },

};

