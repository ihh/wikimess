// api/services/DataService.js

// item: counts in Player.global.inv or Game.local[12].inv that show up as icons
var item = [
    { name: 'cash',  // internal variable name
      icon: 'coins',
      noun: 'credit',  // displayed text
      init: 100,
      alwaysShow: true,
      public: false
    },
    { name: 'robe',
      category: 'clothing',
      noun: 'robe',
      buy: 20,
      public: true
    },
]

var defaultCurrency = 'cash'
var defaultBuySellRatio = 1.5

// attribute: status meters
var attribute = [
    { name: 'day',
      min: 0,
      max: 7,
      public: true,
      label: 'Days of school' }
]

// accomplishment: icons
var accomplishment = [
]

// state: miscellaneous properties
var state = [
    { name: 'home',
      init: 'root' }
]

// do some indexing...
var itemByCategory = {}, itemByName = {}
item.forEach (function (it) {
    itemByName[it.name] = it
    if (it.category) {
        itemByCategory[it.category] = itemByCategory[it.category] || []
        itemByCategory[it.category].push (it)
    }
})

module.exports = {
    item: item,
    itemByName: itemByName,
    itemByCategory: itemByCategory,
    defaultCurrency: defaultCurrency,
    defaultBuySellRatio: defaultBuySellRatio,
    attribute: attribute,
    accomplishment: accomplishment,
    state: state
}
