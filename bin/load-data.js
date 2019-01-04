#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    request = require('request'),
    colors = require('colors'),
    extend = require('extend'),
    jsonschema = require('jsonschema'),
    Promise = require('bluebird'),
    Sails = require('sails').constructor,
    rhsParser = require('bracery').RhsParser,
    templateParser = require('../src/template.js')

var defaultUrlPrefix = "http://localhost:1337"
var defaultUserName = "admin"
var defaultPassword = "admin"
var defaultDataDir = "data"
var defaultPlayerFilename = "$DATA/players"
var defaultSymbolFilename = "$DATA/symbols"
var defaultTemplateFilename = "$DATA/templates"
var defaultVerbosity = 3
var defaultMatchRegex = '\\.(json|txt|bracery)$'
var databasePath = '.tmp/localDiskDb.db'
var symChar = '$'
var maxUploadChunkCount = 100   // max number of records that will be uploaded in any single request

function defaultPath (subdir, opt) {
  var dataDir = (opt && opt.options.data) || defaultDataDir
  var pathVar = eval ('default' + subdir + 'Filename')
  pathVar = pathVar.replace('$DATA',dataDir)
  return pathVar
}

function schemaPath (schema) {
  return 'assets/schemas/' + schema + '.json'
}

var opt = getopt.create([
  ['r' , 'root=STRING'      , 'URL prefix (default="' + defaultUrlPrefix + '")'],
  ['p' , 'production'       , 'production mode (requires sudo)'],
  ['u' , 'username=STRING'  , 'admin player name (default="' + defaultUserName + '")'],
  ['w' , 'password=STRING'  , 'admin player password (default="' + defaultPassword + '")'],
  ['D' , 'data=PATH'        , 'path to data directory (default=' + defaultDataDir + ')'],
  ['P' , 'players=PATH+'    , 'path to .json player file(s) or directories (default=' + defaultPath('Player') + ')'],
  ['S' , 'symbols=PATH+'    , 'path to .json, .bracery, or .txt grammar symbol file(s) or directories (default=' + defaultPath('Symbol') + ')'],
  ['T' , 'templates=PATH+'  , 'path to .json, .bracery, or .txt template file(s) or directories (default=' + defaultPath('Template') + ')'],
  ['M' , 'match=PATTERN'    , 'regex for matching filenames in directories (default=/' + defaultMatchRegex + '/)'],
  ['V' , 'validate'         , 'validate uploaded items against schemas before uploading'],
  ['E' , 'validate-each'    , 'validate each uploaded item against schema individually, even if many items in file'],
  ['n' , 'dryrun'           , 'dummy run; do not POST anything'],
  ['s' , 'start'            , "lift (start) Sails, but don't POST anything"],
  ['l' , 'lift'             , 'lift Sails & POST'],
  ['e' , 'erase'            , 'delete database in ' + databasePath + ', then lift sails & POST'],
  ['v' , 'verbose=INT'      , 'verbosity level (default=' + defaultVerbosity + ')'],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var dryRun = opt.options.dryrun, start = opt.options.start
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

if (opt.options.production)
  process.env.NODE_ENV = 'production'

var urlPrefix = opt.options.root || defaultUrlPrefix

var adminUser = opt.options.username || defaultUserName
var adminPass = opt.options.password || defaultPassword
var jar = request.jar()

var matchRegex = new RegExp (opt.options.regex || defaultMatchRegex)

if (!opt.options.data && (opt.options.players || opt.options.symbols || opt.options.templates))
  defaultDataDir = '/dev/null'  // hacky way to disable data-directory crawl if -P, -S, or -T specified
var playerFilenames = opt.options.players || [defaultPath('Player',opt)]
var symbolFilenames = opt.options.symbols || [defaultPath('Symbol',opt)]
var templateFilenames = opt.options.templates || [defaultPath('Template',opt)]

var sailsApp, promise = Promise.resolve()
if (opt.options.lift || opt.options.start || opt.options.erase) {
  if (opt.options.erase && fs.existsSync(databasePath)) {
    log (1, 'Erasing temporary database in ' + databasePath)
    if (!(dryRun || start))
      fs.unlinkSync (databasePath)
  }
  log (1, 'Lifting Sails')
  if (!dryRun) {
    sailsApp = new Sails()
    promise = promise.then (function() {
      return Promise.promisify (sailsApp.lift, {context: sailsApp}) ()
    })
  }
}

if (!start) {
  if (!dryRun)
    promise = promise.then (function() {
      return new Promise (function (resolve) {
        var url = urlPrefix + '/login'
        log (1, "Logging into " + url)
        request.post ({ jar: jar,
                        url: url,
                        json: true,
                        body: { name: adminUser, password: adminPass } },
                      function (err, res, body) {
                        if (err)
                          throw err
                        else if (!body) {
                          console.log (res)
                          log (0, "no body")
                        } else if (!body.player)
                          log (0, body.message)
                        else {
                          log (2, "Logged in as '" + adminUser + "'")
                          resolve()
                        }
                      })
      })
    })

  var follows = [], playerNameToId = {}
  var playerPrep = function (players) {
    players.forEach (function (player) {
      if (player.followed) {
        player.followed.forEach (function (followedName) {
          follows.push ([player.name, followedName])
        })
        delete player.followed
      }
      if (player.followers) {
        player.followers.forEach (function (followerName) {
          follows.push ([followerName, player.name])
        })
        delete player.followers
      }
    })
    return players
  }
  var playerHandler = makeHandler ('Player', hasNameAndID, function (obj) { playerNameToId[obj.name] = obj.id; return obj.name + '\t(id=' + obj.id + ')' })
  promise = promise.then (processFilenameList ({ path: '/player',
                                                 schema: schemaPath('player'),
                                                 preprocessor: playerPrep,
                                                 handler: playerHandler,
                                                 parsers: [JSON.parse, eval],
                                                 list: playerFilenames.reverse() }))
    .then (function() {
      return new Promise (function (resolve, reject) {
        if (follows.length)
          post ({ array: follows.map
                  (function (follow) {
                    return { follower: playerNameToId[follow[0]],
                             followed: playerNameToId[follow[1]] }
                  }),
                  offset: 0,
		  total: follows.length,
                  filename: '<follows>',
                  path: '/follow',
                  handler: makeHandler('Template',hasID,JSON.stringify),
                  callback: resolve })
        else
          resolve()
      })
    })

  promise = promise.then (processFilenameList ({ path: '/symbol',
                                                 schema: schemaPath('symbol'),
                                                 handler: genericHandler('Symbol'),
                                                 parsers: [JSON.parse, eval, function (text) {
                                                   return templateParser.parseSymbolDefs(text,log)
                                                 }],
                                                 list: symbolFilenames.reverse() }))
  
  promise = promise.then (processFilenameList ({ path: '/template',
                                                 schema: schemaPath('template'),
                                                 handler: makeHandler('Template',hasID,getTitle),
                                                 parsers: [JSON.parse, eval, function (text) {
                                                   return templateParser.parseTemplateDefs(text,log)
                                                 }],
                                                 list: templateFilenames.reverse() }))
}

promise.then (function() { log (1, "Loading complete - point your browser at " + urlPrefix + '/') })

function processFilenameList (info) {
  return function() {
    return Promise.all (info.list.map (function (filename) {
      return processFiles ({ filename: filename,
                             path: info.path,
                             schema: info.schema,
                             preprocessor: info.preprocessor,
                             handler: info.handler,
                             parsers: info.parsers,
                             first: true })
    }))
  }
}

function processFiles (info) {
  var filename = info.filename,
      first = info.first
  if (fs.existsSync (filename)) {
    var stats = fs.statSync (filename)
    if (stats.isDirectory())
      return processDir (info)
    else if (matchRegex.test(filename) || first)
      return processFile (info)
  }
  return Promise.resolve()
}

function processDir (info) {
  var dir = info.filename
  if (!start)
    log (1, 'Processing ' + dir)
  return Promise.all (fs.readdirSync(dir).map (function (filename) {
    return processFiles ({ filename: dir + '/' + filename,
                           schema: info.schema,
                           path: info.path,
                           preprocessor: info.preprocessor,
                           handler: info.handler,
                           parsers: info.parsers })
  }))
}

function processFile (info) {
  var filename = info.filename,
      parsers = info.parsers,
      schemaFilename = info.schema
  if (!start)
    log (1, 'Processing ' + filename)
  var json = readJsonFileSync (filename, parsers)
  json = isArray(json) ? json : [json]
  log (5, 'Parsed ' + filename)
  if (info.preprocessor)
    json = info.preprocessor(json)
  log (8, JSON.stringify(json))
  if (json && schemaFilename && opt.options['validate']) {
    var schema = JSON.parse (fs.readFileSync (schemaFilename))
    var validator = new jsonschema.Validator()
    log (4, 'Validating ' + filename + ' against ' + schemaFilename)
    if (opt.options['validate-each'])
      json = json.filter (function (item, n) {
        log (5, 'Validating ' + filename + ' (array element #' + n + ')')
        var result = validator.validate (item, schema, {nestedErrors: true})
        if (result.errors.length) {
          log(3, 'Error validating array element #' + n + ' '+ (item.name || ''))
          log (result.errors.map (function (ve) { return ve.stack }).join("\n"))
          return false
        }
        log(4, 'Validated array element #' + n + ' '+ ((item && item.name) || ''))
        return true
      })
    else {
      var result = validator.validate (json, schema, {nestedErrors: true})
      if (result.errors.length) {
        log(3, 'Error validating ' + filename)
        log (result.errors.map (function (ve) { return ve.stack }).join("\n"))
        return Promise.resolve()
      }
      log(4, 'Validated ' + filename)
    }
  }
  var promise = Promise.resolve()
  if (json) {
    var chunkedJson = []
    for (var n = 0; n < json.length; n += maxUploadChunkCount)
      chunkedJson.push (json.slice (n, n + maxUploadChunkCount))
    chunkedJson.forEach (function (chunk, nChunk) {
      promise = promise.then (function() {
        return new Promise (function (resolve) {
          log (5, 'Starting chunk #' + (nChunk+1) + ' of ' + filename)
          post ({ array: chunk,
                  offset: nChunk * maxUploadChunkCount,
		  total: json.length,
                  filename: filename,
                  schema: schema,
                  path: info.path,
                  handler: info.handler,
                  callback: resolve })
        })
      })
    })
  }
  return promise
}

function readJsonFileSync (filename, altParsers) {
  if (!fs.existsSync (filename))
    inputError ("File does not exist: " + filename)
  var data = fs.readFileSync (filename)
  var result, lastErr
  while (typeof(result) === 'undefined' && altParsers.length) {
    var alternateParser = altParsers[0]
    altParsers = altParsers.slice(1)
    try {
      result = alternateParser (data.toString())
    } catch (err) {
      lastErr = err
      // do nothing
    }
  }
  if (!result)
    log ("Warning: no JSON data in file " + filename + "\n" + lastErr)
  return result
}

function post (info) {
  var array = info.array,
      offset = info.offset,
      total = info.total,
      handler = info.handler,
      path = info.path,
      filename = info.filename,
      callback = info.callback

  log (5, 'Stringifying POST data')
  var post_data = JSON.stringify (array)
  log (6, post_data)
  log (5, 'POST data length = ' + post_data.length)
  var post_options = {
    url: urlPrefix + path,
    jar: jar,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(post_data)
    }
  }

  if (dryRun || start) {
    if (dryRun)
      log(3,post_data)
    callback()
  } else {
    array.forEach (function (elem, n) {
      log (2, 'POST ' + path + ' ' + (elem.name || (elem.title ? ('"'+elem.title+'"') : JSON.stringify(elem))) + ' (entry #' + (n+offset+1) + ' of ' + total + ' in ' + filename + ')')
    })
    
    // Set up the request
    var reqCallback = function (err, res, body) {
      if (err)
        handler(filename,err)
      else if (res.statusCode != 200 && res.statusCode != 201 && res.statusCode != 400)
        handler(filename,JSON.stringify(res))
      else
        handler(filename,null,body)
      callback()
    }

    // post the data
    var req = request (post_options, reqCallback)
    req.write(post_data)
    req.end()
  }
}

function plural (n, singular, plural) {
  plural = plural || (singular + 's')
  n = typeof(n) === 'undefined' ? 0 : n
  return n + ' ' + (n == 1 ? singular : plural)
}

function makeHandler (model, filter, toString) {
  return function (filename, err, data) {
    if (err)
      log (err)
    else {
      var obj, results = []
      if (typeof(data) === 'object')
        obj = data
      else
        try {
	  obj = JSON.parse (data)
        } catch (err) {
	  log ("Warning: When parsing " + filename + ": couldn't parse " + model + " response as JSON")
          log (data)
        }
      if (obj) {
	if (obj.status == 400
	    && obj.code == "E_VALIDATION"
	    && obj.invalidAttributes.name
	    && obj.invalidAttributes.name[0].rule == "unique")
	  log (3, ' ' + filename + ' ' + obj.invalidAttributes.name[0].value + ' already created')
	else {
	  var json = isArray(obj) ? obj : [obj]
	  results = json.filter (filter)
	  if (results.length)
	    log (3, ' ' + filename + ': ' + results.map(toString).join("\n " + filename + ': '))
	  else {
	    log (JSON.stringify(obj))
	    log ("Warning: When parsing " + filename + ": Zero " + model + "s created")
	  }
	}
      }
    }
  }
}

function genericHandler (model) {
  return makeHandler (model, hasName, getName)
}

function getName (obj) { return obj.name }
function hasName (obj) { return obj && typeof(obj.name) === 'string' }
function getTitle (obj) { return obj.title }
function hasID (obj) { return obj && (typeof(obj.id) === 'number' || typeof(obj.id) === 'string') }
function hasNameAndID (obj) { return hasName(obj) && hasID(obj) }

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

