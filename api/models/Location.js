/**
 * Location.js
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

      name: {
	  type: 'string',
	  unique: true,
	  required: true
      },

      title: {
	  type: 'string',
	  required: true
      },

      description: {
	  type: 'string',
	  defaultsTo: ""
      },

      links: {
	  type: 'json',
	  defaultsTo: []
      },

      items: {
          type: 'json',
          defaultsTo: []
      },
      
      events: {
          collection: 'event',
          via: 'location'
      },

      visible: {
	  type: 'string'
      },

      locked: {
	  type: 'string'
      },

      checkpoint: {
          type: 'boolean'
      },
  },

  getChatLocation: function() {
    return Location.findOne('chat')
  }
};

