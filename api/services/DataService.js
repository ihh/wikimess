// api/services/DataService.js

module.exports = {
    // item: counts in Player.global.inv or Game.local[12].inv that show up as icons
    item: [
	{ name: 'cash',  // internal variable name
	  icon: 'coins',
	  noun: 'credit',  // displayed text
	  init: 100,
	  alwaysShow: true,
	  public: false
	}
    ],

    // attribute: status meters
    attribute: [
    ],

    // accomplishment: icons
    accomplishment: [
    ],

    // state: miscellaneous properties
    state: [
	{ name: 'home',
	  init: 'root' }
    ],
}
