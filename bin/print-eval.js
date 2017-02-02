#!/usr/bin/env node

var fs = require('fs'),
    extend = require('extend'),
    colors = require('colors'),
    Build = require('./lib/build')

var files = process.argv.slice(2)
files.forEach (function (file) {
  console.log (colors.green ("Checking " + file))
  var json = Build.$eval (fs.readFileSync (file).toString())
  console.log (JSON.stringify (json, null, 2))
})

