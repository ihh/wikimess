// api/services/SchemaService.js

var extend = require('extend')
var JsonValidator = require( 'jsonschema' ).Validator;
var Promise = require('bluebird')

var Player = require('../models/Player')
var Template = require('../models/Template')
var Symbol = require('../models/Symbol')

var symbolSchemaDefs = {
  "symbol-or-list": {
    "oneOf": [
      {
        "$ref": "#/definitions/symbol"
      },
      {
        "type": "array",
        "items": {
          "$ref": "#/definitions/symbol"
        }
      }
    ]
  },
  "symbol": {
    "type": "object",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string"
      },
      "owner": {
        "type": ["string", "null"]
      },
      "transferable": {
        "type": "boolean"
      },
      "summary": {
        "type": "string"
      },
      "rules": {
        "type": "array",
        "items": {
          "$ref": "#/definitions/rhs"
        }
      }
    }
  },

  "rhs": {
    "type": "array",
    "items": {
      "oneOf":
      [{ "type": "string" },
       
       { "type": "object",
         "properties": {
           "type": { "const": "sym" },
           "name": { "type": "string" } },
         "required": ["type", "name"],
         "additionalProperties": false },
       
       { "type": "object",
         "properties": {
           "type": { "const": "sym" },
           "id": { "type": "integer" },
           "name": { "type": "string" } },
         "required": ["type", "id"],
         "additionalProperties": false },

       { "type": "object",
         "properties": {
           "type": { "const": "func" },
           "args": { "$ref": "#/definitions/rhs" },
           "funcname": { "enum": ["uc", "cap", "plural", "a"] } },
         "required": ["type", "funcname", "args"],
         "additionalProperties": false },

       { "type": "object",
         "properties": {
           "type": { "const": "lookup" },
           "varname": { "type": "string" } },
         "required": ["type", "varname"],
         "additionalProperties": false },

       { "type": "object",
         "properties": {
           "type": { "const": "assign" },
           "value": { "$ref": "#/definitions/rhs" },
           "varname": { "type": "string" } },
         "required": ["type", "varname", "value"],
         "additionalProperties": false },

       { "type": "object",
         "properties": {
           "type": { "const": "alt" },
           "opts": {
             "type": "array",
             "items": { "$ref": "#/definitions/rhs" } } },
         "required": ["type", "opts"],
         "additionalProperties": false } ]
    }
  }
}

// SchemaService
module.exports = {

  // schemas
  playerSchema: {
    "definitions": {
      "player-or-list": {
        "oneOf": [
          {
            "$ref": "#/definitions/player"
          },
          {
            "type": "array",
            "items": {
              "$ref": "#/definitions/player"
            }
          }
        ]
      },
      "player": {
        "type": "object",
        "required": [
          "name",
          "password"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "password": {
            "type": "string"
          },
          "admin": {
            "type": "boolean"
          },
          "human": {
            "type": "boolean"
          },
          "newSignUp": {
            "type": "boolean"
          }
        }
      }
    },
    "$ref": "#/definitions/player-or-list",
    "additionalProperties": false,
    "$schema": "http://json-schema.org/schema#",
    "id": "http://wikimess.me/schemas/player.json"
  },

  templateSchema:{
    "definitions": extend ({
      "template-or-list": {
        "oneOf": [
          {
            "$ref": "#/definitions/template"
          },
          {
            "type": "array",
            "items": {
              "$ref": "#/definitions/template"
            }
          }
        ]
      },
      "template": {
        "type": "object",
        "required": ["title","content"],
        "properties": {
          "title": {
            "type": "string"
          },
          "content": {
            "$ref": "#/definitions/rhs"
          },
          "tags": {
            "type": "string"
          },
          "previousTags": {
            "type": "string"
          },
          "isRoot": {
            "type": "boolean"
          },
          "replies": {
            "type": "array",
            "items": {
              "$ref": "#/definitions/template"
            }
          }
        },
        "additionalProperties": false
      }
    }, symbolSchemaDefs),
    "$ref": "#/definitions/template-or-list",
    "additionalProperties": false,
    "$schema": "http://json-schema.org/schema#",
    "id": "http://wikimess.me/schemas/template.json"
  },

  symbolSchema: {
    "definitions": symbolSchemaDefs,

    "$ref": "#/definitions/symbol-or-list",
    "additionalProperties": false,
    "$schema": "http://json-schema.org/schema#",
    "id": "http://wikimess.me/schemas/symbol.json"
  },
  
  // Validators
  validate: function (data, schema, name, errorCallback) {
    var validator = new JsonValidator()
    var result = validator.validate (data, schema, {nestedErrors: true})
    if (result.errors.length) {
      if (errorCallback) {
        var errs = result.errors.map (function (ve) { return ve.stack }).join("\n")
        errorCallback (new Error (name + " schema validation error:\n" + errs))
      }
      return false
    }
    return true
  },

  validatePlayer: function (data, errorCallback) {
    return this.validate (data, this.playerSchema, "Player", errorCallback)
  },

  validateSymbol: function (data, errorCallback) {
    return this.validate (data, this.symbolSchema, "Symbol", errorCallback)
  },

  validateRules: function (data, errorCallback) {
    return this.validate ({rules: data}, this.symbolSchema, "Symbol", errorCallback)
  },
  
  validateTemplate: function (data, errorCallback) {
    return this.validate (data, this.templateSchema, "Template", errorCallback)
  }
};
