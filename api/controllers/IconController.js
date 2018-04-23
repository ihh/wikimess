/**
 * IconController
 *
 * @description :: Server-side logic for managing icons
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var fs = require('fs');
var request = require('request');

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

  getAvatar: function (req, res) {
    var screenName = req.params.screenname
    var size = req.param('size','normal')
    var url = 'https://twitter.com/' + screenName + '/profile_image' + '?size=' + size
    request.get (url)
      .on ('response', function (response) {
	return (response.statusCode !== 200 || !['image/jpeg', 'image/png'].includes(response.headers['content-type']))
          ? res.status(404).type('txt').send('Username not found.')
          : response.pipe(res)
      })
  }
};

