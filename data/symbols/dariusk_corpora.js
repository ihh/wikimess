var rp = require('request-promise')
var bb = require('bluebird')

var baseUrl = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/'

var targets = [
  { name: 'animal',
    path: 'animals/common.json',
    key: 'animals' },

  { name: 'flower',
    path: 'plants/flowers.json',
    key: 'flowers' },

  { name: 'fruit',
    path: 'foods/fruits.json',
    key: 'fruits' },

  { name: 'condiment',
    path: 'foods/condiments.json',
    key: 'condiments' },

  { name: 'bread',
    path: 'foods/breads_and_pastries.json',
    key: 'breads' },

  { name: 'pastry',
    path: 'foods/breads_and_pastries.json',
    key: 'pastries' },

  { name: 'menu_item',
    path: 'foods/menuItems.json',
    key: 'menuItems' },
]

bb.Promise.map (targets, function (target) {
  return rp (baseUrl + target.path)
    .then (function (htmlString) {
      var json = JSON.parse (htmlString)
      var result = { name: target.name,
                     summary: target.summary,
                     rules: json[target.key].map (function (text) {
                       return [text]
                     })
                   }
      return result
    })
}).then (function (results) {
  console.log (JSON.stringify (results))
})
