#!/usr/bin/env node

var fs = require('fs')
var SchemaService = require('../api/services/SchemaService.js')

var assetsDir = 'assets'
var schemaDir = 'schemas'
var schemaHost = 'localhost:1337'
var schemaProtocol = 'http'

function writeSchemaFile (name) {
  var remotePath = schemaDir + '/' + name + '.json'
  var localPath = assetsDir + '/' + remotePath
  var schema = SchemaService[name + 'Schema']
  schema["$schema"] = "http://json-schema.org/schema#"
  schema["id"] = schemaProtocol + '://' + schemaHost + '/' + remotePath
  console.log ("Writing " + localPath)
  fs.writeFileSync (localPath, JSON.stringify (schema, null, 2))
}

Object.keys(SchemaService).forEach (function (property) {
  var re = new RegExp ('(.*)Schema')
  var match = re.exec (property)
  if (match)
    writeSchemaFile(match[1])
})

