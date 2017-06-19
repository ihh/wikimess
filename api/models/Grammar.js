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
        'document': ['@beginning @body @ending'],
        'beginning': ['Esteemed Colleague,', 'Dearest Friend,'],
        'body': ['I trust you are in good health.', 'May I offer my warmest regards.'],
        'ending': ['Sincerely, @me.', 'Yours, @me.']
      }
    },

    // links to automatically created objects
    choices: {
      collection: 'choice',
      via: 'grammar'
    },

    outcomes: {
      collection: 'outcome',
      via: 'grammar'
    },

    events: {
      collection: 'event',
      via: 'grammar'
    },

    tickets: {
      collection: 'ticket',
      via: 'grammar'
    }
  },

  rootSymbol: 'document',
  choiceNamePrefix: '_grammar'
};
