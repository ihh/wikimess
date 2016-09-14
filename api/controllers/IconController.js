/**
 * IconController
 *
 * @description :: Server-side logic for managing icons
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var fs = require('fs');

module.exports = {
    getIcon: function (req, res) {

	var icon = req.params.icon
	var color = req.params.color || 'black'
	var background = req.params.background || 'rgba(0,0,0,0)'

	var iconPrefix = '/images/icons/'
        var iconPath = process.cwd() + '/assets' + iconPrefix
        var iconSuffix = '.svg'

	fs.readFile (iconPath + icon + iconSuffix,
		     'utf8',
		     function (err, svg) {
			 if (err) {
			     console.log (err)
			     res.status(500).send(err)
			 } else {
			     svg = svg.replace(/"#fff"/g, '"' + color + '"')
			     svg = svg.replace(/"#000"/g, '"' + background + '"')
			     res.set('Content-Type','image/svg+xml')
			     res.send(svg)
			 }
		     })
    },
};

