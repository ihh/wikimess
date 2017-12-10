/**
 * Revision.js
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

    symbol: {
      model: 'symbol'
    },

    name: {
      type: 'string'
    },
    
    owner: {
      model: 'player',
      defaultsTo: null
    },

    owned: {
      type: 'boolean'
    },

    transferable: {
      type: 'boolean'
    },
    
    summary: {
      type: 'string'
    },
    
    rules: {
      type: 'json'
    },
  }
};

