#!/usr/bin/env node

var fs = require('fs'),
    colors = require('colors')

var files = process.argv.slice(2)
files.forEach (function (file) {
  console.log (colors.green ("Checking " + file))
  console.log (JSON.stringify (eval (fs.readFileSync (file).toString()), null, 2))
})

