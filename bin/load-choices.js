#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    assert = require('assert'),
    request = require('request'),
    colors = require('colors'),
    extend = require('extend'),
    jsonschema = require('jsonschema'),
    Promise = require('bluebird'),
    Sails = require('sails').constructor,
    Build = require('./build/build')

var defaultUrlPrefix = "http://localhost:1337"
var defaultUserName = "admin"
var defaultPassword = "admin"
var defaultDataDir = "data"
var defaultChoiceFilename = "$DATA/choices"
var defaultTextFilename = "$DATA/texts"
var defaultPlayerFilename = "$DATA/players"
var defaultLocationFilename = "$DATA/locations"
var defaultItemFilename = "$DATA/items"
var defaultMeterFilename = "$DATA/meters"
var defaultAwardFilename = "$DATA/awards"
var defaultVerbosity = 3
var defaultMatchRegex = '\\.(js|json|txt|story)$'
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
  ['u' , 'username=STRING'  , 'admin player name (default="' + defaultUserName + '")'],
  ['w' , 'password=STRING'  , 'admin player password (default="' + defaultPassword + '")'],
  ['d' , 'data=PATH'        , 'path to data directory (default=' + defaultDataDir + ')'],
  ['c' , 'choices=PATH+'    , 'path to .js, .json or .story file(s) or directories (default=' + defaultPath('Choice') + ')'],
  ['t' , 'texts=PATH+'      , 'path to js/json text file(s) or directories (default=' + defaultPath('Text') + ')'],
  ['p' , 'players=PATH+'    , 'path to js/json player file(s) or directories (default=' + defaultPath('Player') + ')'],
  ['l' , 'locations=PATH+'  , 'path to js/json location file(s) or directories (default=' + defaultPath('Location') + ')'],
  ['i' , 'items=PATH+'      , 'path to js/json item file(s) or directories (default=' + defaultPath('Item') + ')'],
  ['m' , 'meters=PATH+'     , 'path to js/json meter file(s) or directories (default=' + defaultPath('Meter') + ')'],
  ['a' , 'awards=PATH+'     , 'path to js/json award file(s) or directories (default=' + defaultPath('Award') + ')'],
  ['r' , 'regex=PATTERN'    , 'regex for matching filenames in directories (default=/' + defaultMatchRegex + '/)'],
  ['n' , 'dryrun'           , 'dummy run; do not POST anything'],
  ['s' , 'sails'            , 'lift sails before loading data'],
  ['e' , 'erase'            , 'delete database in ' + databasePath + ', then lift sails'],
  ['y' , 'story=PATH'       , 'parse the given .story file, output its JSON equivalent and do nothing else'],
  ['v' , 'verbose=INT'      , 'verbosity level (default=' + defaultVerbosity + ')'],
  ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var dryRun = opt.options.dryrun
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

var urlPrefix = opt.options.root || defaultUrlPrefix

var adminUser = opt.options.username || defaultUserName
var adminPass = opt.options.password || defaultPassword
var jar = request.jar()

var matchRegex = new RegExp (opt.options.regex || defaultMatchRegex)
var choiceFilenames = opt.options.choices || [defaultPath('Choice',opt)]
var textFilenames = opt.options.choices || [defaultPath('Text',opt)]
var playerFilenames = opt.options.players || [defaultPath('Player',opt)]
var locationFilenames = opt.options.locations || [defaultPath('Location',opt)]
var itemFilenames = opt.options.items || [defaultPath('Item',opt)]
var meterFilenames = opt.options.meters || [defaultPath('Meter',opt)]
var awardFilenames = opt.options.awards || [defaultPath('Award',opt)]

var sailsApp, liftPromise
if (opt.options.sails || opt.options.erase) {
  if (opt.options.erase && fs.existsSync(databasePath)) {
    log (1, 'Erasing temporary database in ' + databasePath)
    if (!dryRun)
      fs.unlinkSync (databasePath)
  }
  log (1, 'Lifting Sails')
  if (!dryRun) {
    sailsApp = new Sails()
    liftPromise = Promise.promisify (sailsApp.lift, {context: sailsApp}) ()
  }
}
liftPromise = liftPromise || Promise.resolve()

liftPromise.then (function() {

  if (opt.options.story) {
    var json = readJsonFileSync (opt.options.story, parseStory)
    console.log (JSON.stringify(json,null,2))
    return
  }

  // this callback-chain-mangling really, really should be done using promises instead
  var callback = function() {}

  var playerHandler = makeHandler ('Player', hasNameAndID, function (obj) { return obj.name + '\t(id=' + obj.id + ')' })
  callback = processFilenameList ({ path: '/player',
                                    schema: schemaPath('player'),
                                    handler: playerHandler,
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: playerFilenames.reverse() })

  var locationHandler = makeHandler ('Location', hasName, function (obj) {
    return obj.name + ' -> ' + (obj.links ? obj.links.map(function (link) { return typeof(link) === 'string' ? link : link.to }).join(', ') : 'no links!') })
  callback = processFilenameList ({ path: '/location',
                                    schema: schemaPath('location'),
                                    handler: locationHandler,
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: locationFilenames.reverse() })

  callback = processFilenameList ({ path: '/item',
                                    schema: schemaPath('item'),
                                    handler: genericHandler('Item'),
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: itemFilenames.reverse() })

  callback = processFilenameList ({ path: '/award',
                                    schema: schemaPath('award'),
                                    handler: genericHandler('Award'),
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: awardFilenames.reverse() })

  callback = processFilenameList ({ path: '/meter',
                                    schema: schemaPath('meter'),
                                    handler: genericHandler('Meter'),
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: meterFilenames.reverse() })

  callback = processFilenameList ({ path: '/text',
                                    schema: schemaPath('text'),
                                    handler: genericHandler('Text'),
                                    callback: callback,
                                    parsers: [JSON.parse, Build],
                                    list: textFilenames.reverse() })

  var choiceHandler = makeHandler ('Choice', hasNameAndID, function (c) {
    return ' ' + c.name + '\t(id=' + c.id + ', '
      + plural (c.outcomes && c.outcomes.length, 'outcome')
      + ')' })
  callback = processFilenameList ({ path: '/choice',
                                    schema: schemaPath('choice'),
                                    handler: choiceHandler,
                                    callback: callback,
                                    parsers: [JSON.parse, Build, parseStory],
                                    list: choiceFilenames.reverse() })

  request.post ({ jar: jar,
                  url: urlPrefix + '/login',
                  json: true,
                  body: { name: adminUser, password: adminPass } },
                function (err, res, body) {
                  if (err)
                    throw err
                  else if (!body.player) {
                    log (0, body.message)
                  } else {
                    log (1, "Logged in as '" + adminUser + "'")
                    callback()
                  }
                })
})

function processFilenameList (info) {
  return function() {
    var callback = info.callback
    info.list.forEach (function (filename) {
      callback = process ({ filename: filename,
                            path: info.path,
                            schema: info.schema,
                            handler: info.handler,
                            parsers: info.parsers,
                            first: true,
                            callback: callback })
    })
    callback()
  }
}

function process (info) {
  var filename = info.filename,
      first = info.first,
      callback = info.callback
  if (fs.existsSync (filename)) {
    var stats = fs.statSync (filename)
    if (stats.isDirectory())
      return processDir (info)
    else if (matchRegex.test(filename) || first)
      return processFile (info)
  }
  return callback
}

function processDir (info) {
  var dir = info.filename,
      callback = info.callback
  log (1, 'Processing ' + dir)
  fs.readdirSync(dir).forEach (function (filename) {
    callback = process ({ filename: dir + '/' + filename,
                          schema: info.schema,
                          path: info.path,
                          handler: info.handler,
                          parsers: info.parsers,
                          callback: callback })
  })
  return callback
}

function processFile (info) {
  var filename = info.filename,
      callback = info.callback,
      parsers = info.parsers,
      schemaFilename = info.schema
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
  if (json)
    return function() {
      post ({ index: 0,
              array: json,
              filename: filename,
              schema: schema,
              path: info.path,
              handler: info.handler,
              callback: info.callback })
    }
  else
    return callback
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
  log (2, 'POST ' + path + ' ' + elem.name + ' (entry #' + (n+1) + ' in ' + filename + ')')

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

  if (dryRun) {
    log(3,post_data)
    post_next()
  } else {
    
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
function hasNameAndID (obj) { return typeof(obj.name) === 'string' && typeof(obj.id) === 'number' }

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

function parseStory (text) {
  try {
    var context = 'choice'
    var currentObj, currentList = []
    var stack = []
    var hashReg = /^ *# *([a-z0-9]+) *(.*?) *$/;
    var jsArrayReg = /^\[/;
    var jsObjReg = /^\{/;
    var closingBraceReg = /^ *\} *$/;
    var nonwhiteReg = /\S/;
    var textField = { choice: 'intro',
		      next: 'intro',
		      outcome: 'outro',
		      intro: 'text',
		      outro: 'text' }
    var outcomeKeys = ['rr','rl','lr','ll','any','lr2','rl2','auto','outcome','effect']
    var innerContext = { choice: { intro: 'intro' },
			 next: { intro: 'intro' },
			 outcome: { outro: 'outro', next: 'next' },
			 intro: { left: 'intro', right: 'intro', next: 'intro', menu: 'intro' },
			 outro: { left: 'outro', right: 'outro', next: 'outro' } }
    var isArrayAttr = { choice: { intro: true },
			next: { intro: true },
			outcome: { next: true, outro: true },
			intro: { menu: true },
			outro: { menu: true } }
    outcomeKeys.forEach (function (key) {
      innerContext.choice[key] = innerContext.next[key] = 'outcome'
      isArrayAttr.choice[key] = isArrayAttr.next[key] = true
    })
    text.split(/\n/).forEach (function (line) {
      //	    console.log("\nparseStory inner loop")
      //	    console.log("line: "+line)
      var tf = textField[context]
      function append (txt, obj, f) {
	obj = obj || currentObj
        if (!obj) {
          if (/\S/.test(txt))
            console.log ("Warning: discarding " + txt)
          return
        }
	f = f || tf
	if (typeof(obj[f]) == 'undefined' || typeof(obj[f]) == 'string') {
	  obj[f] = (obj[f] || '') + txt
	  obj[f] = obj[f].replace(/^ +/,'')
	  obj[f] = obj[f].replace(/ +$/,'')
	  obj[f] = obj[f].replace(/ +/g,' ')
	  obj[f] = obj[f].replace(/\n+/g,'\n')
	  obj[f] = obj[f].replace(/\s*;;\s*/g,';;')
	} else
	  append (txt, obj[f], 'text')
      }
      var hashMatch = hashReg.exec (line)
      if (hashMatch) {
	var cmd = hashMatch[1], arg = hashMatch[2]
	if (arg == '{') {
	  var inner = innerContext[context][cmd]
	  if (!inner)
	    throw new Error ("Can't nest #" + cmd + " in " + context + " context")
	  stack.push ({ obj: currentObj,
			list: currentList,
			context: context,
			cmd: cmd })
	  var obj = {}
	  if (currentObj[cmd]) {
	    if (typeof (currentObj[cmd]) == 'string') {
	      currentList = []
	      obj[textField[inner]] = currentObj[cmd]
	    } else
	      currentList = currentObj[cmd]
	  } else
	    currentList = []
	  currentList.push (obj)
	  currentObj = obj
	  context = inner
	} else if (arg.length) {
	  if (cmd == 'name' && context == 'choice')
	    currentList.push (currentObj = {})
	  try {
	    if (jsArrayReg.test(arg)) {
	      var val = eval(arg)
	      if (isArrayAttr[context][arg] && !isArray(val))
		val = [val]
	      currentObj[cmd] = (currentObj[cmd] || []).concat (val)
	    } else if (jsObjReg.test(arg)) {
	      currentObj[cmd] = eval ('['+arg+'][0]')  // horrible hack
	    } else if (innerContext[context][cmd]) {
	      var val = {}
	      val[textField[innerContext[context][cmd]]] = arg
	      currentObj[cmd] = (currentObj[cmd] || []).concat ([val])
	    } else
	      currentObj[cmd] = arg
	  } catch (e) {
	    currentObj[cmd] = arg
	  }
	}
      } else if (closingBraceReg.test (line)) {
	if (stack.length == 0)
	  throw "Too many closing braces"
	var info = stack.pop()
	info.obj[info.cmd] = isArrayAttr[info.context][info.cmd] ? currentList : currentList[0]
	info.list.pop()
	info.list.push (currentObj = info.obj)
	currentList = info.list
	context = info.context
      } else if (nonwhiteReg.test (line)) {
	append (' ' + line)
      } else {
	append ('\n')
      }
      //	    console.log("context: "+context)
      //	    console.log("currentObj: "+JSON.stringify(currentObj))
      //	    console.log("currentList: "+JSON.stringify(currentList))
      //	    console.log("stack: "+JSON.stringify(stack))
      //	    console.log("stack size: "+stack.length)

    })
    if (stack.length)
      throw "Too few closing braces"
    log(5,"Parsed text file and generated the following JSON:\n" + JSON.stringify(currentList,null,2))
    return currentList
  } catch(e) { console.log(e) }
}
