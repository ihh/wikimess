var rp = require('request-promise')
var bb = require('bluebird')
var _ = require('lodash')

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

  { name: 'mood',
    path: 'humans/moods.json',
    key: 'moods' },

  { name: 'rich_person',
    path: 'humans/richpeople.json',
    key: 'richPeople',
    filter: function (entry) { return [entry.name] }
  },

  { name: 'lovecraftian_god',
    path: 'mythology/lovecraft.json',
    key: 'deities' },
  
  { name: 'lovecraftian_creature',
    path: 'mythology/lovecraft.json',
    key: 'supernatural_creatures' },

  { name: 'famous_duo',
    path: 'humans/famousDuos.json',
    key: 'famousDuos' },
]

// 12/15/2017 IH added code to autodetect key, so we can represent targets as a hash
var symbolPath = {
  tolkien_character: 'humans/tolkienCharacterNames.json',
  famous_author: 'humans/authors.json',
  body_part: 'humans/bodyParts.json',
  british_actor: 'humans/britishActors.json',
  famous_celebrity: 'humans/celebrities.json',
  person_adjective: 'humans/descriptions.json',
  english_honorific: 'humans/englishHonorifics.json',
  english_first_name: 'humans/firstNames.json',
  english_last_name: 'humans/lastNames.json',
  spanish_first_name: 'humans/spanishFirstNames.json',
  spanish_last_name: 'humans/spanishLastNames.json',
  human_occupation: 'humans/occupations.json',
  name_prefix: 'humans/prefixes.json',
  name_suffix: 'humans/suffixes.json',
  famous_scientist: 'humans/scientists.json',
  music_genre: 'music/genres.json',
  musical_instrument: 'music/instruments.json',
}

Object.keys(symbolPath).forEach (function (symbol) {
  targets.push ({ name: symbol,
		  path: symbolPath[symbol] })
})
    
bb.Promise.map (targets, function (target) {
  return rp (baseUrl + target.path)
    .then (function (htmlString) {
      var json = JSON.parse (htmlString)
      var keys = Object.keys(json)
	  .filter (function (key) {
	    return _.isArray (json[key])
	  })
      var key = target.key || (keys.length === 1 ? keys[0] : undefined)
      if (typeof(key) === 'undefined')
	throw new Error ('Error autodetecting key for ' + target.path)
      console.warn ('$' + target.name + ' <-- ' + target.path)
      var result = { name: target.name,
                     summary: target.summary,
                     rules: json[key].map (function (text) {
                       return target.filter ? target.filter(text) : [text]
                     })
                   }
      return result
    }).catch (function (err) {
      console.warn ('Error fetching ' + target.path)
      throw err
    })
}).then (function (results) {
  console.log (JSON.stringify (results))
})
