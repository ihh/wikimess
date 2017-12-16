var rp = require('request-promise')
var bb = require('bluebird')
var _ = require('lodash')

var baseUrl = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/'

var targets = [
  { name: 'common_animal',
    path: 'animals/common.json',
    key: 'animals' },

  { name: 'common_flower',
    path: 'plants/flowers.json',
    key: 'flowers' },

  { name: 'common_fruit',
    path: 'foods/fruits.json',
    key: 'fruits' },

  { name: 'common_condiment',
    path: 'foods/condiments.json',
    key: 'condiments' },

  { name: 'common_bread',
    path: 'foods/breads_and_pastries.json',
    key: 'breads' },

  { name: 'common_pastry',
    path: 'foods/breads_and_pastries.json',
    key: 'pastries' },

  { name: 'menu_item',
    path: 'foods/menuItems.json',
    key: 'menuItems' },

  { name: 'human_mood',
    path: 'humans/moods.json',
    key: 'moods' },

  { name: 'rich_person',
    path: 'humans/richpeople.json',
    key: 'richPeople',
    rhs: function (entry) { return [entry.name] }
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

  { name: 'english_town',
    path: 'geography/english_towns_cities.json',
    key: 'towns' },

  { name: 'english_city',
    path: 'geography/english_towns_cities.json',
    key: 'cities' },

  { name: 'american_city',
    path: 'geography/us_cities.json',
    key: 'cities',
    rhs: function (entry) { return [entry.city] } },

  { name: 'london_underground_station',
    path: 'geography/london_underground_stations.json',
    key: 'stations',
    rhs: function (entry) { return [entry.name] } },

  { name: 'major_sea',
    path: 'geography/oceans.json',
    key: 'seas',
    rhs: function (entry) { return [entry.name] } },

  { name: 'major_river',
    path: 'geography/rivers.json',
    key: 'rivers',
    rhs: function (entry) { return [entry.name] } },
  
  { name: 'crayola_color',
    path: 'colors/crayola.json',
    key: 'colors',
    rhs: function (entry) { return [entry.color.toLowerCase()] }
  },
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
  random_room: 'architecture/rooms.json',
  art_genre: 'art/isms.json',
  car_manufacturer: 'corporations/cars.json',
  fortune500_company: 'corporations/fortune500.json',
  american_industry: 'corporations/industries.json',
  american_newspaper: 'corporations/newspapers.json',
  tv_show: 'film-tv/tv_shows.json',
  pizza_topping: 'foods/pizzaToppings.json',
  cocktail_name: 'foods/iba_cocktails.json',
  common_vegetable: 'foods/vegetables.json',
  wrestling_move: 'games/wrestling_moves.json',
  major_country: 'geography/countries.json',
  federal_agency: 'governments/us_federal_agencies.json',
  military_operation: 'governments/us_mil_operations.json',
  nsa_project: 'governments/nsa_projects.json',
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
                       return target.rhs ? target.rhs(text) : [text]
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
