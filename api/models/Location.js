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

        return items.map (function (info, n) {
            var item = info.item
            var buy = info.buy || item.buy
            if (typeof(buy) !== 'object') {
                var b = buy
                buy = {}
                buy[DataService.defaultCurrency] = b
            }
            var sell = info.sell || item.sell
            if (!sell) {
                sell = {}
                Object.keys(buy).forEach (function(unit) { sell[unit] = Math.round (buy[unit] / DataService.defaultBuySellRatio) })
            }
            if (typeof(sell) !== 'object') {
                var s = sell
                sell = {}
                sell[DataService.defaultCurrency] = s
            }
            if (info.markup) {
                var b = buy, s = sell
                buy = {}
                sell = {}
                Object.keys(b).forEach (function(unit) { buy[unit] = b[unit] * info.markup })
                Object.keys(s).forEach (function(unit) { sell[unit] = s[unit] / info.markup })
            }
            return { id: n,
                     name: item.name,
                     icon: item.icon,
                     noun: item.noun,
                     hint: item.hint,
                     buy: buy,
                     sell: sell,
                     inv: player && player.global.inv[item.name] }
        })
    }
};

