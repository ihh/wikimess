#!/usr/bin/env node

var fs = require('fs'),
    child_process = require('child_process'),
    path = require('path'),
    getopt = require('node-getopt'),
    extend = require('extend'),
    Promise = require('bluebird'),
    Bracery = require('bracery'),
    ParseTree = Bracery.ParseTree,
    Template = Bracery.Template

var filename = { symbols: 'symbols.bracery',
                 templates: 'templates.bracery',
                 output: 'solo.html' }

var opt = getopt.create([
  ['o' , 'output=PATH'     , 'path to output file (default ' + filename.output + ')'],
  ['s' , 'symbols=PATH'    , 'path to ' + filename.symbols],
  ['t' , 'templates=PATH'  , 'path to ' + filename.templates],
  ['m' , 'min'             , "minimize JS & CSS"],
  ['h' , 'help'            , 'display this help message']
])              // create Getopt instance
    .bindHelp()     // bind option 'help' to default action
    .parseSystem() // parse command line

extend (filename, opt.options)

function quote (str) { return '"' + str.replace (new RegExp('"','g'), '\\"').replace (new RegExp("\n",'g'), '\\n') + '"' }

var symbols = fs.readFileSync (filename.symbols).toString()
var templates = fs.readFileSync (filename.templates).toString()

var cwd = process.cwd()
process.chdir (__dirname + '/..')

var npmBin = 'node_modules/.bin/'
child_process.execSync (npmBin + 'grunt buildProd')

var minJs = fs.readFileSync(opt.options.min ? 'www/min/production.min.js' : 'www/concat/production.js').toString()
var minCss = fs.readFileSync(opt.options.min ? 'www/min/production.min.css' : 'www/concat/production.css').toString()

var regex = new RegExp ('</script>','g')
var dummyEndScript = "<end script disrupted by compile-solo.js>"
minJs = minJs.replace (regex, dummyEndScript)
minCss = minCss.replace (regex, dummyEndScript)

var htmlFilenameRegex = /^(.*)\.html$/;
var htmlDir = 'www/html'
var preloadedHtml = fs.readdirSync (htmlDir).reduce (function (s, file) {
  var match = htmlFilenameRegex.exec (file)
  return s + (match
              ? ('<div id="html-' + match[1] + '">' + fs.readFileSync(htmlDir + '/' + file).toString() + '</div>')
              : '')
}, '<div style="display:none;">') + '</div>'

var title = 'wikimess'
var data = '<!DOCTYPE html><html><head><title>' + title + '</title>'
    + '<script type="text/javascript">' + minJs + '</script>'
    + '<style>' + minCss + '</style>'
    + preloadedHtml
    + '<body><div id="wikimess"></div></body>'
    + '<script type="text/javascript">var wm;$(function() {wm = new WikiMess('
    + '{standalone:true,templateDefs:' + quote(templates) + ',symbolDefs:' + quote(symbols) + '}'
    + ')})</script></html>'

process.chdir (cwd)
fs.writeFileSync (filename.output, data)
