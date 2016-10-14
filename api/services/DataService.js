// api/services/DataService.js

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

module.exports = {
    attribute: attribute,
    accomplishment: accomplishment,
    state: state
}
