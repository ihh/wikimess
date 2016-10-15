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
	  required: true
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

    getItems: function (location, player) {
        var items = []
        location.items.forEach (function (it) {
            if (typeof(it) === 'string')
                it = { name: it }
            if (it.name in Item.itemByName)
                items.push ({ item: Item.itemByName[it.name], buy: it.buy, sell: it.sell, markup: it.markup })
            else
                Item.itemByCategory[it.name].forEach (function (item) {
                    items.push ({ item: item, buy: it.buy, sell: it.sell, markup: it.markup })
                })
        })

        return items.map (function (info) {
            var item = info.item
            function makePrice(p,markup,discount) {
                var price = {}
                if (typeof(p) !== 'object')
                    price[Item.defaultCurrency] = p * (markup || 1) / (discount || 1)
                else
                    Object.keys(p).forEach (function (unit) {
                        price[unit] = p[unit] * (markup || 1) / (discount || 1)
                    })
                return price
            }

            var buy, sell
            if (info.buy)
                buy = makePrice(info.buy)
            else if (item.buy)
                buy = makePrice(item.buy,info.markup)
            else if (info.sell && info.markup)
                buy = makePrice(info.sell,info.markup)
            else if (item.sell && info.markup)
                buy = makePrice(item.sell,info.markup / (info.discount || 1))
            
            if (info.sell)
                sell = makePrice(info.sell)
            else if ((info.buy || item.buy) && (info.discount || item.discount))
                sell = makePrice(buy,info.discount || item.discount)
            else if (item.sell)
                sell = makePrice(item.sell)

            return { name: item.name,
                     icon: item.icon,
                     color: item.color,
                     noun: item.noun,
                     hint: item.hint,
                     buy: buy,
                     sell: sell,
                     owned: player && player.global.inv[item.name] }
        })
    },

    getItemsByName: function (location, player) {
        var byName = {}
        Location.getItems (location, player).forEach (function (item) {
            byName[item.name] = item
        })
        return byName
    },
};

