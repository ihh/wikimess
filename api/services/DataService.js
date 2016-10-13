// api/services/DataService.js

var defaultCurrency = 'cash'
var defaultDiscount = .8

// item: counts in Player.global.inv or Game.local[12].inv that show up as icons
var item = [
    { name: 'cash',  // internal variable name
      icon: 'coins',
      color: 'yellow',
      noun: 'credit',  // displayed text
      init: 100,
      alwaysShow: true,
      public: false
    },
    { name: 'robe',
      icon: 'robe',
      color: 'red',
      category: 'clothing',
      noun: 'robe',
      buy: 20,
      discount: defaultDiscount,
      public: true
    },
]

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
item.forEach (function (it, n) {
    it.id = n
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
    attribute: attribute,
    accomplishment: accomplishment,
    state: state
}
