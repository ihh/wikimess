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
  }
};

