#!/usr/bin/env node

var fs = require('fs'),
path = require('path'),
getopt = require('node-getopt'),
assert = require('assert'),
http = require('http')

var defaultHost = "localhost"
var defaultPort = "1337"
var defaultUrlPrefix = ""
var defaultChoiceFilename = "data/choices.json"
var opt = getopt.create([
    ['h' , 'host=STRING'      , 'hostname (default="' + defaultHost + '")'],
    ['p' , 'port=INT'         , 'port (default=' + defaultPort + ')'],
    ['r' , 'root=STRING'      , 'URL prefix (default="' + defaultUrlPrefix + '")'],
    ['c' , 'choices=PATH'     , 'path to JSON choices file (default=' + defaultChoiceFilename + ')'],
    ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
.bindHelp()     // bind option 'help' to default action
.parseSystem() // parse command line

var host = opt.options.host || defaultHost
var port = opt.options.port || defaultPort
var urlPrefix = opt.options.root || defaultUrlPrefix

var choiceFilename = opt.options.choices || defaultChoiceFilename
var choiceJson = readJsonFileSync (choiceFilename)

function postChoice (n) {
    if (n >= choiceJson.length)
	return

    var choice = choiceJson[n]
    console.log (choice.name)

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
    };

    // Set up the request
    var post_req = http.request(post_options, function(res) {
	res.setEncoding('utf8');
	res.on('data', function (chunk) {
            console.log('Response: ' + chunk);
	    postChoice (n+1)
	});
    });

    // post the data
    post_req.write(post_data);
    post_req.end();
}

postChoice(0)


function readJsonFileSync (filename, alternateParser) {
    if (!fs.existsSync (filename))
        inputError ("File does not exist: " + filename)
    var data = fs.readFileSync (filename)
    var result
    try {
	result = JSON.parse (data)
    } catch (err) {
	if (alternateParser)
	    result = alternateParser (data.toString())
	else
	    throw err
    }
    return result
}
