/**
 * Game.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

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
      current: {
          model: 'choice'
      },

      future: {
          type: 'array',
          defaultsTo: []
      },

      moves: {
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
      }
  },

    roleFilter: function (game, role) {
        var intro, verb, hintc, hintd, self, other, selfMood, otherMood
        var current = game.current
        if (role == 1) {
            intro = current.intro
            verb = current.verb
            hintc = current.hintc
            hintd = current.hintd
            self = game.player1
            other = game.player2
            selfMood = game.mood1
            otherMood = game.mood2
        } else {  // role == 2
            intro = current.intro2 || current.intro
            verb = current.verb2 || current.verb
            hintc = current.hintc2 || current.hintc
            hintd = current.hintd2 || current.hintd
            self = game.player2
            other = game.player1
            selfMood = game.mood2
            otherMood = game.mood1
        }
        intro.replace(/\$player1/g,game.player1.name)
        intro.replace(/\$player2/g,game.player2.name)
        intro.replace(/\$self/g,self.name)
        intro.replace(/\$other/g,other.name)
        return { intro: intro,
                 verb: verb,
                 hintc: hintc,
                 hintd: hintd,
                 self: { mood: selfMood },
                 other: { name: other.name, mood: otherMood },
                 move: game.moves + 1 }
    },
};

