#!/usr/bin/env node

var fs = require('fs'),
    shell = require('shelljs'),
    extend = require('extend'),
    path = require('path'),
    getopt = require('node-getopt'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors'),
    Grammar = require('../lib/graphgram').Grammar

var defaultSourceDir = 'data/grammars/roguelike'
var defaultOutDir = 'out'

var opt = getopt.create([
  ['s' , 'source=PATH'     , 'source directory (default "' + defaultSourceDir + '")'],
  ['d' , 'dir=PATH'        , 'output directory (default "' + defaultOutDir + '")'],
  ['s' , 'seed=N'          , 'seed random number generator'],
  ['q' , 'quiet'           , 'do not print pretty log messages'],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var sourceDir = opt.options.source || defaultSourceDir
var mapGrammar = Grammar.fromFile (sourceDir + '/map.json')
var mapInfo = grammar.evolve ({ verbose: !opt.options.quiet,
			     seed: opt.options.seed })
var mapGraph = mapInfo.graph

var outDir = opt.options.dir || defaultOutDir
shell.mkdir ('-p', outDir)
fs.writeFileSync (outDir + '/map.json', JSON.stringify (graphlib.json.write (mapGraph), null, 2))

mapGraph.nodes().forEach (function (nodeId) {
  var nodeLabel = mapGraph.node(nodeId), nodeSuccessors = mapGraph.successors(nodeId)
  var nodeOutgoing = nodeSuccessors ? nodeSuccessors.forEach (function (succ) {
    nodeOutgoing.push ({ to: succ, label: graph.edge (nodeId, succ) })
  }) : []

  var nodeDir = outDir + '/' + nodeId
  fs.mkdirSync (nodeDir)

  var introGraph
  var nodeType = typeof(nodeLabel) === 'string' ? nodeLabel : nodeLabel.type
  var introDir = sourceDir + '/intro/' + nodeType
  if (fs.existsSync (introDir)) {
    var startGraph = new graphlib.Graph()
    startGraph.node ({ label: nodeLabel, outgoing: nodeOutgoing })
    fs.writeFileSync (nodeDir + '/start.json', JSON.stringify (graphlib.json.write (startGraph), null, 2))

    var introInfo = introGrammar.evolve ({ verbose: !opt.options.quiet,
					   seed: opt.options.seed })
    introGraph = introInfo.graph

  } else {
    // create a default intro graph based on nodeLabel and nodeOutgoing
  }

  // use introGraph to create intro with EJS templates for text
  // use nodeOutgoing to create Outcomes
})
