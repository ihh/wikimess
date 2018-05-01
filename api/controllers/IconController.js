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
var jpegSuffix = '.jpeg'

var maxCacheSeconds = 24*60*60

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
                           res.set ('Cache-Control', 'max-age=' + maxCacheSeconds + ', public')
			   res.send(svg)
			 }
		     })
    },

  getAvatar: function (req, res) {
    var screenName = req.params.screenname
    var size = req.param('size','normal')
    var url = 'https://twitter.com/' + screenName + '/profile_image' + '?size=' + size
    var prefix = screenName + '-' + size
    var pathToPng = avatarPath + prefix + pngSuffix, pathToJpeg = avatarPath + prefix + jpegSuffix
    var pathToPngFile = avatarDir + prefix + pngSuffix, pathToJpegFile = avatarDir + prefix + jpegSuffix

    // cache
    res.set ('Cache-Control', 'max-age=' + maxCacheSeconds + ', public')
    
    // https://stackoverflow.com/questions/39232296/node-js-cache-image-to-filesystem-and-pipe-image-to-response
    fs.stat (pathToPngFile, function (err, stats) {
      if (err)
          fs.stat (pathToJpegFile, function (err, stats) {
            if (err) {
              request.get ({ uri: url,
                             headers: { "Content-Type": "image/png" } })
                .on ('response', function (response) {
	          if (response.statusCode !== 200 || !['image/png','image/jpeg'].includes(response.headers['content-type']))
                    res.status(404).type('txt').send('User ' + screenName + ' not found')
                  else {
                    var suffix
                    switch (response.headers['content-type']) {
                    case 'image/png': suffix = pngSuffix; break;
                    case 'image/jpeg': suffix = jpegSuffix; break;
                    default: break;
                    }
                    response.pipe (new stream.PassThrough().pipe (fs.createWriteStream (avatarDir + prefix + suffix)))
                    // pipe to the response at the same time
                    response.pipe (res)
                  }
                })
            } else
              fs.createReadStream(pathToJpegFile).pipe(res)
          })
      else
        fs.createReadStream(pathToPngFile).pipe(res)
    })
  }
};

