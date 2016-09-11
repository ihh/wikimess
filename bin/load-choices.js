#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    assert = require('assert'),
    http = require('http'),
    colors = require('colors')

var defaultHost = "localhost"
var defaultPort = "1337"
var defaultUrlPrefix = ""
var defaultChoiceFilename = "data"
var defaultVerbosity = 3
var defaultMatchRegex = '\\.(js|json)$'

var opt = getopt.create([
    ['h' , 'host=STRING'      , 'hostname (default="' + defaultHost + '")'],
    ['p' , 'port=INT'         , 'port (default=' + defaultPort + ')'],
    ['r' , 'root=STRING'      , 'URL prefix (default="' + defaultUrlPrefix + '")'],
    ['c' , 'choices=PATH+'    , 'path to JSON choices file(s) or directories (default=' + defaultChoiceFilename + ')'],
    ['m' , 'match=PATTERN'    , 'regex for matching filenames in directories (default=/' + defaultMatchRegex + '/)'],
    ['v' , 'verbose=INT'      , 'verbosity level (default=' + defaultVerbosity + ')'],
    ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
.bindHelp()     // bind option 'help' to default action
.parseSystem() // parse command line

var verbose = opt.options.verbose || defaultVerbosity
var logColor = ['green', 'yellow', 'magenta', 'cyan', 'red', 'blue']
function log (v, text) {
    if (typeof text === 'undefined') {
        text = v
        v = 0
    }
    if (verbose >= v) {
        var color = v <= 0 ? 'white' : (v > logColor.length ? logColor[logColor.length-1] : logColor[v-1])
        console.log (colors[color].call (colors, text))
    }
}

var host = opt.options.host || defaultHost
var port = opt.options.port || defaultPort
var urlPrefix = opt.options.root || defaultUrlPrefix

var matchRegex = new RegExp (opt.options.match || defaultMatchRegex)
var choiceFilenames = opt.options.choices || [defaultChoiceFilename]

choiceFilenames.forEach (function (choiceFilename) {
    process (choiceFilename, true)
})

function process (filename, first) {
    log (1, 'Processing ' + filename)
    var stats = fs.statSync (filename)
    if (stats.isDirectory())
        processDir (filename)
    else if (matchRegex.test(filename) || first)
        processFile (filename)
}

function processDir (dir) {
    fs.readdirSync(dir).forEach (function (filename) {
        process (dir + '/' + filename)
    })
}
        
function processFile (filename) {
    var json = readJsonFileSync (filename, eval)
    if (json)
        postChoice (0, json, filename)
}

function readJsonFileSync (filename, alternateParser) {
    if (!fs.existsSync (filename))
        inputError ("File does not exist: " + filename)
    var data = fs.readFileSync (filename)
    var result
    try {
	result = JSON.parse (data)
    } catch (err) {
	if (alternateParser) {
            try {
	        result = alternateParser (data.toString())
            } catch (err) {
                log (err)
            }
        } else {
            log (err)
        }
    }
    if (!result)
        log ("Warning: no JSON data in file " + filename)
    return result
}

function postChoice (n, choiceJson, filename) {
    if (n >= choiceJson.length)
	return

    var choice = choiceJson[n]
    log (2, 'POSTing ' + choice.name + ' (entry #' + (n+1) + ' in ' + filename + ')')

    var post_data = JSON.stringify (choice)

    var post_options = {
	host: host,
	port: port,
	path: '/choice',
	method: 'POST',
	headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(post_data)
	}
    }

    // Set up the request
    var req = http.request(post_options, function(res) {
	res.setEncoding('utf8')
        var data = ''
	res.on('data', function (chunk) {
            var str = chunk.toString()
            data += str
            log (6, '[received ' + str.length + ' bytes]')
	})
	res.on('end', function() {
            log (5, data)
            log (4, 'Response length: ' + data.length + ' bytes')

            var choices = []
            try {
                var json = JSON.parse (data)
                choices = json.filter (function (c) {
                    // check to see if this looks like a Choice
                    return typeof(c.name) === 'string' && typeof(c.id) === 'number'
                })
            } catch (err) {
                log ("Warning: couldn't parse response as JSON list")
            }
            if (choices.length)
                log (3, choices.map (function (c) {
                    return ' ' + c.name + '\t(id=' + c.id + ', '
                        + plural (c.outcomes && c.outcomes.length, 'outcome')
                        + ')'
                }).join("\n"))
            else
                log ("Warning: zero Choices created")
	    postChoice (n+1, choiceJson, filename)
	})
    })

    req.on('error', function(err) {
        log ("Error POSTing " + choice)
        log (err)
    })

    // post the data
    req.write(post_data)
    req.end()
}

function plural (n, singular, plural) {
    plural = plural || (singular + 's')
    n = typeof(n) === 'undefined' ? 0 : n
    return n + ' ' + (n == 1 ? singular : plural)
}
