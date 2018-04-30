/**
 * IconController
 *
 * @description :: Server-side logic for managing icons
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var fs = require('fs');
var request = require('request');
var stream = require('stream');

var imagePath = '/images/'
var avatarPath = '/images/avatars/'
var iconPath = '/images/icons/'

var assetDir = process.cwd() + '/assets'
var imageDir = assetDir + imagePath
var avatarDir = assetDir + avatarPath
var iconDir = assetDir + iconPath

var svgSuffix = '.svg'
var pngSuffix = '.png'

module.exports = {
    getIcon: function (req, res) {
	var icon = req.params.icon
	var color = req.params.color || 'black'
	var background = req.params.background || 'rgba(0,0,0,0)'

	fs.readFile (iconDir + icon + svgSuffix,
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
    var path = avatarPath + screenName + pngSuffix
    var pathToFile = avatarDir + screenName + pngSuffix

    // https://stackoverflow.com/questions/39232296/node-js-cache-image-to-filesystem-and-pipe-image-to-response
    fs.stat (pathToFile, function (err, stats) {
        if (err) {

          request.get ({ uri: url,
                         headers: { "Content-Type": "image/png" } })
            .on ('response', function (response) {
	      if (response.statusCode !== 200 || !['image/png'].includes(response.headers['content-type']))
                res.status(404).type('txt').send('Username not found.')
              else {
                // Create a write stream to the file system
                response.pipe (new stream.PassThrough().pipe (fs.createWriteStream (pathToFile)))
                // pipe to the response at the same time
                response.pipe (res)
              }
            })
        } else {
          // If the image does exist on the file system, then redirect to static asset
          res.redirect (301, path)
          // NB this may not play well if caching is turned on in config/http.js
          // Alternatively, to serve the file dynamically every time, use this:
          // fs.createReadStream(pathToFile).pipe(res)
        }
    })
  }
};

