#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    request = require('request'),
    colors = require('colors'),
    extend = require('extend'),
    jsonschema = require('jsonschema'),
    Promise = require('bluebird'),
    Sails = require('sails').constructor

var defaultUrlPrefix = "http://localhost:1337"
var defaultUserName = "admin"
var defaultPassword = "admin"
var defaultDataDir = "data"
var defaultPlayerFilename = "$DATA/players"
var defaultSymbolFilename = "$DATA/symbols"
var defaultTemplateFilename = "$DATA/templates"
var defaultVerbosity = 3
var defaultMatchRegex = '\\.(js|json|txt)$'
var databasePath = '.tmp/localDiskDb.db'

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
  ['P' , 'players=PATH+'    , 'path to js/json player file(s) or directories (default=' + defaultPath('Player') + ')'],
  ['S' , 'symbols=PATH+'    , 'path to js/json grammar symbol file(s) or directories (default=' + defaultPath('Symbol') + ')'],
  ['T' , 'templates=PATH+'  , 'path to js/json template file(s) or directories (default=' + defaultPath('Template') + ')'],
  ['M' , 'match=PATTERN'    , 'regex for matching filenames in directories (default=/' + defaultMatchRegex + '/)'],
  ['n' , 'dryrun'           , 'dummy run; do not POST anything'],
  ['s' , 'start'            , 'lift (start) Sails, but don\'t POST anything'],
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

var playerHandler = makeHandler ('Player', hasNameAndID, function (obj) { return obj.name + '\t(id=' + obj.id + ')' })
promise = promise.then (processFilenameList ({ path: '/player',
                                               schema: schemaPath('player'),
                                               handler: playerHandler,
                                               parsers: [JSON.parse, eval],
                                               list: playerFilenames.reverse() }))

promise = promise.then (processFilenameList ({ path: '/symbol',
                                               schema: schemaPath('symbol'),
                                               handler: genericHandler('Symbol'),
                                               parsers: [JSON.parse, eval],
                                               list: symbolFilenames.reverse() }))

promise = promise.then (processFilenameList ({ path: '/template',
                                               schema: schemaPath('template'),
                                               handler: makeHandler('Template',hasID,getTitle),
                                               parsers: [JSON.parse, eval],
                                               list: templateFilenames.reverse() }))

promise.then (function() { log (1, "Loading complete - point your browser at " + urlPrefix + '/') })

function processFilenameList (info) {
  return function() {
    return Promise.all (info.list.map (function (filename) {
      return processFiles ({ filename: filename,
                             path: info.path,
                             schema: info.schema,
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
  log (8, JSON.stringify(json))
  if (json && schemaFilename) {
    var schema = JSON.parse (fs.readFileSync (schemaFilename))
    var validator = new jsonschema.Validator()
    json = json.filter (function (item, n) {
      var result = validator.validate (item, schema, {nestedErrors: true})
      if (result.errors.length) {
        log(3, 'Error validating array element #' + n + ' '+ (item.name || ''))
        log (result.errors.map (function (ve) { return ve.stack }).join("\n"))
        return false
      }
      log(4, 'Validated array element #' + n + ' '+ ((item && item.name) || ''))
      return true
    })
  }
  var promise
  if (json)
    promise = new Promise (function (resolve) {
      post ({ index: 0,
              array: json,
              filename: filename,
              schema: schema,
              path: info.path,
              handler: info.handler,
              callback: resolve })
    })
  else
    promise = Promise.resolve()
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
  var n = info.index,
      array = info.array,
      handler = info.handler,
      path = info.path,
      filename = info.filename,
      callback = info.callback

  if (n >= array.length) {
    callback()
    return
  }

  var elem = array[n]
  var post_data = JSON.stringify (elem)
  var post_options = {
    url: urlPrefix + path,
    jar: jar,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(post_data)
    }
  }

  var post_next = function() {
    post ({ index: n+1,
            array: array,
            handler: handler,
            path: path,
            filename: filename,
            callback: callback })
  }

  if (dryRun || start) {
    if (dryRun)
      log(3,post_data)
    post_next()
  } else {
    log (2, 'POST ' + path + ' ' + (elem.name || ('"'+elem.title+'"')) + ' (entry #' + (n+1) + ' in ' + filename + ')')
    
    // Set up the request
    var req = request(post_options, function (err, res, body) {
      if (err)
        handler(err)
      else if (res.statusCode != 200 && res.statusCode != 201 && res.statusCode != 400)
        handler(JSON.stringify(res))
      else
        handler(null,body)
      post_next()
    })

    // post the data
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
  return function (err, data) {
    if (err)
      log (err)
    else {
      var obj, results = []
      try {
	obj = JSON.parse (data)
      } catch (err) {
	log ("Warning: couldn't parse " + model + " response as JSON")
      }
      if (obj) {
	if (obj.status == 400
	    && obj.code == "E_VALIDATION"
	    && obj.invalidAttributes.name
	    && obj.invalidAttributes.name[0].rule == "unique")
	  log (3, ' ' + obj.invalidAttributes.name[0].value + ' already created')
	else {
	  var json = isArray(obj) ? obj : [obj]
	  results = json.filter (filter) 
	  if (results.length)
	    log (3, ' ' + results.map(toString).join("\n "))
	  else {
	    log (JSON.stringify(obj))
	    log ("Warning: zero " + model + "s created")
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
function hasName (obj) { return typeof(obj.name) === 'string' }
function getTitle (obj) { return obj.title }
function hasID (obj) { return typeof(obj.id) === 'number' }
function hasNameAndID (obj) { return hasName(obj) && hasID(obj) }

function playerHandler (err, data) {
  if (err)
    log(err)
  else {
    var obj
    try {
      obj = JSON.parse (data)
    } catch (err) {
      log ("Warning: couldn't parse player response as JSON list")
    }
    if (obj.status == 400
        && obj.code == "E_VALIDATION"
        && obj.invalidAttributes.name
        && obj.invalidAttributes.name[0].rule == "unique")
      log (3, ' ' + obj.invalidAttributes.name[0].value + ' already created')
    else {
      if (typeof(obj) !== 'undefined') {
        if (!( typeof(obj.name) === 'string' && typeof(obj.id) === 'number' ))
          log ("This doesn't look like a Player")
        else
          log (3, ' ' + obj.name + '\t(id=' + obj.id + ')')
      } else
        log ("Warning: Player not created")
    }
  }
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}
