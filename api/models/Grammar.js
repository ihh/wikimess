/**
 * Grammar.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  primaryKey: 'id',
  
  attributes: {
    id: {
      type: 'number',
      autoIncrement: true,
      unique: true
    },

    author: {
      model: 'player',
      required: true
    },

    name: {
      type: 'string'
    },

    rules: {
      type: 'json'
    },
  },

  rootSymbol: 'document',
  choiceNamePrefix: '_grammar',

  // lifecycle updates
  beforeCreate: function (g, callback) {
    g.name = g.name || ''
    g.rules = g.rules || {}
    callback()
  },

};
