#!/usr/bin/env node

var express = require('express'),
    bodyParser = require('body-parser'),
    getopt = require('node-getopt'),
    MersenneTwister = require('mersennetwister'),
    assert = require('assert')

// parse command-line options
var port = process.env.PORT || 8080
var apiRoot = 'bighouse'

var opt = getopt.create([
    ['p' , 'port=PORT'        , 'server port (default is '+port+')'],
    ['r' , 'root=ROOT'        , 'root prefix for API (default is '+apiRoot+')'],
    ['h' , 'help'             , 'display this help message']
])             // create Getopt instance
.bindHelp()    // bind option 'help' to default action
.parseSystem() // parse command line

port = opt.options.port || port
apiRoot = opt.options.root || apiRoot

// define our app using express
var app = express()

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())


// ROUTES FOR OUR API
// =============================================================================
var router = express.Router()              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/{apiRoot})
router.get('/', function(req, res) {
    res.json({ message: 'welcome to the Big House, punk' })
})

// more routes for our API will happen here


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /{apiRoot}
app.use('/'+apiRoot, router)


// START THE SERVER
// =============================================================================
app.listen(port)
console.log('Listening on http://localhost:' + port + '/' + apiRoot)

