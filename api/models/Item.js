/**
 * Item.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
      // internal variable name
      name: {
          type: 'string',
          required: true,
          unique: true,
          primaryKey: true
      },

      // appearance
      icon: {
          type: 'string',
          required: true
      },
      color: { type: 'string' },

      // displayed text
      noun: { type: 'string' },
      pluralNoun: { type: 'string' },
      article: { type: 'string' },

      // sale category
      category: { type: 'string' },

      // sale info
      isDefaultCurrency: { type: 'boolean' },
      buy: { type: 'json' },
      sell: { type: 'json' },
      markup: { type: 'float' },
      discount: { type: 'float' },

      // inventory info
      public: { type: 'boolean', defaultsTo: true },
      alwaysShow: { type: 'boolean', defaultsTo: false }
    },

    // default currency
    defaultCurrency: 'cash',

    // default discount
    defaultDiscount: 0.8,
    
    // in-memory index
    items: [],
    itemByName: {},
    itemByCategory: {},

    // startup method to create in-memory index (called from config/bootstrap.js)
    createIndex: function (callback) {
        Item.find({}).exec (function (err, items) {
            if (err) throw err
            else {
                items.forEach (function (item) {
                    Item.updateIndex (item)
                })
                callback()
            }
        })
    },

    // method to update in-memory index
    updateIndex: function (it) {
        Item.items.push (it)
        Item.itemByName[it.name] = it
        if (it.category) {
            Item.itemByCategory[it.category] = Item.itemByCategory[it.category] || []
            Item.itemByCategory[it.category].push (it)
        }
	if (it.isDefaultCurrency)
	    Item.defaultCurrency = it.name
    },

    // lifecycle callback to update in-memory index when new Items are added
    afterCreate: function (item, callback) {
        Item.updateIndex(item)
        callback()
    },

    // lifecycle callback to set defaults
    beforeCreate: function(item, cb) {
        if (item.buy && !item.sell && !item.discount && !item.nosell)
            item.discount = Item.defaultDiscount
        cb()
    },

    // text functions
    plural: function(n,item) {
        plural = item.pluralNoun || (item.noun + 's')
        n = typeof(n) === 'undefined' ? 0 : n
        return (n != 1 ? n : (item.article || (/^[aeiou]/i.test(item.noun) ? 'an' : 'a'))) + ' ' + (n == 1 ? item.noun : plural)
    },
};

