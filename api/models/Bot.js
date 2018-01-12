/**
 * Bot.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {

    player: {
      model: 'player',
      defaultsTo: function() { return Player.adminUserId }
    },
    
    startState: {
      type: 'string',
      defaultsTo: 'start'
    },

    transitions: {
      type: 'json',
      defaultsTo: {}
    },

    publicState: {
      type: 'string',
      defaultsTo: 'start'
    },

    privateState: {
      type: 'json',
      defaultsTo: {}
    },

  }
};

