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
  ['g' , 'grammar=PATH'    , 'read grammar file (default "' + defaultGrammarFilename + '")'],
  ['c' , 'canonical'       , 'allow only canonical grammar format (no syntactic sugar)'],
  ['i' , 'input=PATH'      , 'read graphlib JSON file'],
  ['o' , 'output=PATH'     , 'write graphlib JSON file'],
  ['d' , 'dot=PATH'        , 'write graphviz DOT file'],
  ['L' , 'limit=N'         , 'limit number of rule applications'],
  ['S' , 'stage=N'         , 'only run one stage'],
  ['s' , 'seed=N'          , 'seed random number generator'],
  ['q' , 'quiet'           , 'do not print pretty log messages'],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

var grammarFilename = opt.options.grammar || defaultGrammarFilename
var grammarText = fs.readFileSync(grammarFilename).toString()
var grammarJson = eval ('(' + grammarText + ')')
var grammar = new Grammar (grammarJson, { canonical: opt.options.canonical })

var graph
if (opt.options.input)
  graph = graphlib.json.read (JSON.parse (fs.readFileSync (opt.options.input)))

var info = grammar.evolve ({ graph: graph,
			     verbose: !opt.options.quiet,
			     limit: opt.options.limit,
			     stage: opt.options.stage,
			     seed: opt.options.seed })
graph = info.graph

var dotFilename = opt.options.dot
if (dotFilename)
  fs.writeFileSync (dotFilename, grammar.toDot(graph))

var output = JSON.stringify (graphlib.json.write (graph), null, 2)
if (opt.options.output)
  fs.writeFileSync (opt.options.output, output)
else if (!dotFilename)
  console.log (output)
