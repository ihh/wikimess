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

      lastOutcome: {
	  model: 'outcome',
      },

      currentStartTime: {
          type: 'date',
          defaultsTo: function() { return new Date() }
      },

      // player choices
      move1: {
          type: 'string',
          enum: ['c', 'd', 'none'],
          defaultsTo: 'none'
      },

      move2: {
          type: 'string',
          enum: ['c', 'd', 'none'],
          defaultsTo: 'none'
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

      // state specific to this game, common to both players
      common: {
          type: 'json',
          defaultsTo: {}
      },
},

    isWaitingForMove: function (game, role) {
	return role == 1
            ? (game.move2 != 'none' || game.move1 == 'none')
            : (game.move1 != 'none' || game.move2 == 'none')
    },

    isTimedOut: function (game) {
        return game.current
	    && game.current.timeout
	    && ((Date.now() - game.currentStartTime) / 1000) >= game.current.timeout
    },

    timedOutRole: function (game) {
	var w1 = game.move1 == 'none', w2 = game.move2 == 'none'
	return (Game.isTimedOut (game) && (w1 || w2) && !(w1 && w2))
	    ? (w1 ? 1 : 2)
	: 0
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
            intro = GameService.expandText (intro, game, null, role)
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
	if (game.current && game.current.timeout)
	    json.deadline = new Date (game.currentStartTime.getTime() + 1000*game.current.timeout)
	return json
    },

    getRole: function (game, playerID) {
	return playerID == game.player1.id ? 1 : (playerID == game.player2.id ? 2 : null)
    },

    otherRole: function(role) {
	return role == 1 ? 2 : 1
    },

    roleAttr: function (role, key) {
	return key + role
    },

    otherRoleAttr: function (role, key) {
	return key + Game.otherRole(role)
    },

    getRoleAttr: function (obj, role, key) {
	return obj[key + role]
    },

    getOtherRoleAttr: function (obj, role, key) {
	return obj[key + Game.otherRole(role)]
    },
};

