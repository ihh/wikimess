#!/usr/bin/env node

var fs = require('fs'),
    extend = require('extend'),
    path = require('path'),
    getopt = require('node-getopt'),
    graphlib = require('graphlib'),
    jsonschema = require('jsonschema'),
    colors = require('colors'),
    Grammar = require('../lib/graphgram').Grammar

var defaultGrammarFilename = 'data/grammars/sub.json'

var opt = getopt.create([
  ['g' , 'grammar=PATH'    , 'path to grammar file (default="' + defaultGrammarFilename + '")'],
  ['i' , 'input=PATH'      , 'path to input graphlib JSON file'],
  ['o' , 'output=PATH'     , 'path to output graphlib JSON file'],
  ['d' , 'dot=PATH'        , 'save graphviz DOT file'],
  ['l' , 'limit=N'         , 'limit number of rule applications'],
  ['s' , 'seed=N'          , 'seed random number generator'],
  ['q' , 'quiet'           , 'do not print pretty log messages'],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var grammarFilename = opt.options.grammar || defaultGrammarFilename
var grammarText = fs.readFileSync(grammarFilename).toString()
var grammarJson = eval ('(' + grammarText + ')')
var grammar = new Grammar (grammarJson, { validationError: function (err) { console.log(err); process.exit() } })

var graph
if (opt.options.input)
  graph = graphlib.json.read (JSON.parse (fs.readFileSync (opt.options.input)))

graph = grammar.evolve ({ graph: graph,
                          verbose: !opt.options.quiet,
                          limit: opt.options.limit,
                          seed: opt.options.seed })

var dotFilename = opt.options.dot
if (dotFilename)
  fs.writeFileSync (dotFilename, grammar.toDot(graph))

var output = JSON.stringify (graphlib.json.write (graph), null, 2)
if (opt.options.output)
  fs.writeFileSync (opt.options.output, output)
else if (!dotFilename)
  console.log (output)
