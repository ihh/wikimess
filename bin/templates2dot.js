#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    getopt = require('node-getopt'),
    colors = require('colors'),
    extend = require('extend'),
    jsonschema = require('jsonschema'),
    Promise = require('bluebird'),
    templateParser = require('../misc/parsers/template.js')

var defaultVerbosity = 3
var defaultMatchRegex = '\\.(json|txt)$'
var symChar = '$'

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
  ['T' , 'templates=PATH+'  , 'path to .js, .json or .txt template file(s) or directories'],
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

var nestedTemplates = (opt.options.templates || []).concat(opt.argv).reduce (function (templates, templateFilename) {
  return templates.concat (templateParser.parseTemplateDefs (fs.readFileSync(templateFilename).toString(), log))
}, [])

function flattenTemplates (templates, parent) {
  return templates.reduce (function (allTemplates, template) {
    template.parent = parent
    return allTemplates.concat (flattenTemplates (template.replies, template))
  }, templates)
}
var allTemplates = flattenTemplates (nestedTemplates)
var repliesForTag = {}
allTemplates.forEach (function (template, n) {
  template.id = n
  forTags (template.previousTags, function (tag) {
    repliesForTag[tag] = repliesForTag[tag] || []
    repliesForTag[tag].push (template)
  })
})

console.log ('digraph G {')
allTemplates.forEach (function (template) {
  describeNode (template)
})
allTemplates.forEach (function (template) {
  if (template.parent)
    describeEdge (template.parent, template, '[reply]')
  forTags (template.tags, function (tag) {
    if (repliesForTag[tag])
      repliesForTag[tag].forEach (function (reply) {
        describeEdge (template, reply, tag)
      })
  })
})
console.log ('}')

function forTags (tags, callback) {
  if (tags)
    tags.split(/\s+/).forEach (function (tag) {
      if (tag.match (/\S/))
        callback (tag)
    })
}
  
function describeNode (template) {
  console.log (template.id + ' [label="' + template.title.replace(/"/g,'\\"') + '"];')
}

function describeEdge (src, dest, tag) {
  console.log (src.id + ' -> ' + dest.id + ' [label="' + tag + '"];')
}

