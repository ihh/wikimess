#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    assert = require('assert'),
    http = require('http'),
    colors = require('colors'),
    extend = require('extend')

var defaultHost = "localhost"
var defaultPort = "1337"
var defaultUrlPrefix = ""
var defaultChoiceFilename = "data/choices"
var defaultPlayerFilename = "data/players"
var defaultLocationFilename = "data/locations"
var defaultItemFilename = "data/items"
var defaultMeterFilename = "data/meters"
var defaultAwardFilename = "data/awards"
var defaultVerbosity = 3
var defaultMatchRegex = '\\.(js|json|txt|story)$'

var opt = getopt.create([
    ['h' , 'host=STRING'      , 'hostname (default="' + defaultHost + '")'],
    ['t' , 'port=INT'         , 'port (default=' + defaultPort + ')'],
    ['r' , 'root=STRING'      , 'URL prefix (default="' + defaultUrlPrefix + '")'],
    ['c' , 'choices=PATH+'    , 'path to .json or .story file(s) or directories (default=' + defaultChoiceFilename + ')'],
    ['p' , 'players=PATH+'    , 'path to .json player file(s) or directories (default=' + defaultPlayerFilename + ')'],
    ['l' , 'locations=PATH+'  , 'path to .json location file(s) or directories (default=' + defaultLocationFilename + ')'],
    ['i' , 'items=PATH+'      , 'path to .json item file(s) or directories (default=' + defaultItemFilename + ')'],
    ['m' , 'meters=PATH+'     , 'path to .json meter file(s) or directories (default=' + defaultMeterFilename + ')'],
    ['a' , 'awards=PATH+'     , 'path to .json award file(s) or directories (default=' + defaultAwardFilename + ')'],
    ['r' , 'regex=PATTERN'    , 'regex for matching filenames in directories (default=/' + defaultMatchRegex + '/)'],
    ['d' , 'dummy'            , 'dummy run; do not POST anything'],
    ['s' , 'story=PATH'       , 'parse the given .story file, output its JSON equivalent and do nothing else'],
    ['v' , 'verbose=INT'      , 'verbosity level (default=' + defaultVerbosity + ')'],
    ['h' , 'help'             , 'display this help message']
])              // create Getopt instance
.bindHelp()     // bind option 'help' to default action
.parseSystem() // parse command line

var dummy = opt.options.dummy
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

if (opt.options.story) {
    var json = readJsonFileSync (opt.options.story, parseStory)
    console.log (JSON.stringify(json,null,2))
    return
}

var host = opt.options.host || defaultHost
var port = opt.options.port || defaultPort
var urlPrefix = opt.options.root || defaultUrlPrefix

var matchRegex = new RegExp (opt.options.regex || defaultMatchRegex)
var choiceFilenames = opt.options.choices || [defaultChoiceFilename]
var playerFilenames = opt.options.players || [defaultPlayerFilename]
var locationFilenames = opt.options.locations || [defaultLocationFilename]
var itemFilenames = opt.options.items || [defaultItemFilename]
var meterFilenames = opt.options.meters || [defaultMeterFilename]
var awardFilenames = opt.options.awards || [defaultAwardFilename]

var callback = function() {}

var playerHandler = makeHandler ('Player', hasNameAndID, function (obj) { return obj.name + '\t(id=' + obj.id + ')' })
callback = processFilenameList ({ path: '/player',
                                  handler: playerHandler,
                                  callback: callback,
                                  parsers: [JSON.parse, eval],
                                  list: playerFilenames.reverse() })

var locationHandler = makeHandler ('Location', hasName, function (obj) {
    return obj.name + ' -> ' + obj.link.map(function (link) { return link.to }).join(', ') })
callback = processFilenameList ({ path: '/location',
                                  handler: locationHandler,
                                  callback: callback,
                                  parsers: [JSON.parse, eval],
                                  list: locationFilenames.reverse() })

callback = processFilenameList ({ path: '/item',
                                  handler: genericHandler('Item'),
                                  callback: callback,
                                  parsers: [JSON.parse, eval],
                                  list: itemFilenames.reverse() })

callback = processFilenameList ({ path: '/award',
                                  handler: genericHandler('Award'),
                                  callback: callback,
                                  parsers: [JSON.parse, eval],
                                  list: awardFilenames.reverse() })

callback = processFilenameList ({ path: '/meter',
                                  handler: genericHandler('Meter'),
                                  callback: callback,
                                  parsers: [JSON.parse, eval],
                                  list: meterFilenames.reverse() })

var choiceHandler = makeHandler ('Choice', hasNameAndID, function (c) {
    return ' ' + c.name + '\t(id=' + c.id + ', '
        + plural (c.outcomes && c.outcomes.length, 'outcome')
        + ')' })
callback = processFilenameList ({ path: '/choice',
                                  handler: choiceHandler,
                                  callback: callback,
                                  parsers: [JSON.parse, eval, parseStory],
                                  list: choiceFilenames.reverse() })

callback()

function processFilenameList (info) {
    return function() {
        var callback = info.callback
        info.list.forEach (function (filename) {
            callback = process ({ filename: filename,
                                  path: info.path,
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
    var stats = fs.statSync (filename)
    if (stats.isDirectory())
        return processDir (info)
    else if (matchRegex.test(filename) || first)
        return processFile (info)
    return callback
}

function processDir (info) {
    var dir = info.filename,
        callback = info.callback
    log (1, 'Processing ' + dir)
    fs.readdirSync(dir).forEach (function (filename) {
        callback = process ({ filename: dir + '/' + filename,
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
        parsers = info.parsers
    log (1, 'Processing ' + filename)
    var json = readJsonFileSync (filename, parsers)
    if (json)
        return function() {
            post ({ index: 0,
                    array: json,
                    filename: filename,
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
    var result
    while (typeof(result) === 'undefined' && altParsers.length) {
	var alternateParser = altParsers[0]
	altParsers = altParsers.slice(1)
        try {
	    result = alternateParser (data.toString())
        } catch (err) {
	    // do nothing
        }
    }
    if (!result)
        log ("Warning: no JSON data in file " + filename)
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
	host: host,
	port: port,
	path: path,
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

    if (dummy) {
	log(3,post_data)
	post_next()
    } else {
	
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

		handler (null, data)
		post_next()
	    })
	})

	req.on('error', function(err) {
            handler(err)
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
	var outcomeKeys = ['rr','rl','lr','ll','notrr','notrl','notlr','notll','rx','lx','xr','xl','any','same','diff','lr2','rl2','symdiff','outcome','effect']
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
