/**
 * Grammar.js
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

    author: {
      model: 'player',
      required: true
    },

    name: {
      type: 'string',
      defaultsTo: 'Thoughtful missive'
    },

    rules: {
      type: 'json',
      defaultsTo: {
        'origin': ''
      }
    },
    
  }
};

