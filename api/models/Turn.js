/**
 * Turn.js
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

      game: {
          model: 'game'
      },

      move: {
          type: 'integer',
      },

      text1 : {
	  type: 'json'
      },

      text2 : {
	  type: 'json'
      },

      actions1 : {
	  type: 'json'
      },

      actions2 : {
	  type: 'json'
      },

      move1 : {
	  type: 'json'
      },

      move2 : {
	  type: 'json'
      }
  }
};

