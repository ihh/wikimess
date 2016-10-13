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

      link: {
	  type: 'json',
	  defaultsTo: {}
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
  },

    getItems: function (location, player) {
        var items = []
        location.items.forEach (function (it) {
            if (typeof(it) === 'string')
                it = { name: it }
            if (it.name in DataService.itemByName)
                items.push ({ item: DataService.itemByName[it.name], buy: it.buy, sell: it.sell, markup: it.markup })
            else
                DataService.itemByCategory[it.name].forEach (function (item) {
                    items.push ({ item: item, buy: it.buy, sell: it.sell, markup: it.markup })
                })
        })

        return items.map (function (info) {
            var item = info.item
            function makePrice(p,markup,discount) {
                var price = {}
                if (typeof(p) !== 'object')
                    price[DataService.defaultCurrency] = p * (markup || 1) / (discount || 1)
                else
                    Object.keys(p).forEach (function (unit) {
                        price[unit] = p[unit] * (markup || 1) / (discount || 1)
                    })
                return price
            }
            function makePriceInfo(price) {
                if (!price) return undefined
                return Object.keys(price).map (function (itemName) {
                    var item = DataService.itemByName[itemName]
                    var amount = price[itemName]
                    return { name: itemName,
                             amount: amount,
                             icon: item.icon,
                             noun: item.noun,
                             color: item.color }
                })
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
                     buy: makePriceInfo(buy),
                     sell: makePriceInfo(sell),
                     inv: player && player.global.inv[item.name] }
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

