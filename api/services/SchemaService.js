// api/services/SchemaService.js

var JsonValidator = require( 'jsonschema' ).Validator;

var intro_list_schema = {
  oneOf: [{ type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } },
          { "$ref": "#/definitions/intro_node" }]
}

var intro_node_schema = {
  oneOf: [{ type: "string" },
          { type: "object",
	    required: ["ref"],
	    properties: {
              hint: { type: "string" },
	      visible: { type: "string" },
	      ref: { type: "string" }
	    },
	    additionalProperties: false
	  },
          { type: "object",
	    required: ["goto"],
            properties: {
              hint: { type: "string" },
	      visible: { type: "string" },
	      expr: { type: "string" },
	      symexpr: { type: "string" },
              goto: { type: "string" }
            },
            additionalProperties: false
          },
          { type: "object",
	    required: ["sequence"],
            properties: {
              hint: { type: "string" },
	      visible: { type: "string" },
	      expr: { type: "string" },
	      symexpr: { type: "string" },
              label: { type: "object" },
              labelexpr: { type: "object" },
              sequence: { type: "#/definitions/intro_node_list" },
              define: { type: "#/definitions/intro_node_list" }
            },
            additionalProperties: false
          },
          { type: "object",
            properties: {
              name: { type: "string" },
              text: { type: "string" },
              hint: { type: "string" },
	      visible: { type: "string" },
	      expr: { type: "string" },
	      symexpr: { type: "string" },
              label: { type: "object" },
              labelexpr: { type: "object" },
              define: { type: "#/definitions/intro_node_list" },
              left: { "$ref": "#/definitions/intro_node" },
              right: { "$ref": "#/definitions/intro_node" },
              next: { "$ref": "#/definitions/intro_node" },
              menu: { type: "array", items: { "$ref": "#/definitions/intro_node" } },

              randmenu: {
                oneOf: [{ type: "object",
		          properties: {
		            asymmetric: { type: "boolean" },
		            shuffle: { type: "boolean" },
		            cluster: { type: "boolean" },
		            groups: { type: "array", items: { "$ref": "#/definitions/random_menu_group" } }
		          },
		          required: ["groups"],
		          additionalProperties: false
                        }]
	      }
              
            },
            additionalProperties: false
          }]
}

module.exports = {

  // Choice schema
  choiceSchema: {
    definitions: {
      choice: {
        type: "object",
        properties: {
          name: { type: "string" },
          parent: { type: "string" },
          intro: { "$ref": "#/definitions/intro_list" },
          intro2: { "$ref": "#/definitions/intro_list" },

          outcome: { "$ref": "#/definitions/outcome_list" },

          ll: { "$ref": "#/definitions/outcome_list" },
          lr: { "$ref": "#/definitions/outcome_list" },
          rl: { "$ref": "#/definitions/outcome_list" },
          rr: { "$ref": "#/definitions/outcome_list" },

          any: { "$ref": "#/definitions/outcome_list" },

          lr2: { "$ref": "#/definitions/outcome_list" },
          rl2: { "$ref": "#/definitions/outcome_list" },

          auto: { "$ref": "#/definitions/outcome_list" },
          effect: { "$ref": "#/definitions/outcome_list" }
        },
        additionalProperties: false
      },

      choice_ref: {
        oneOf: [{ type: "string" },
                { "$ref": "#/definitions/choice" }]
      },
      
      outcome_list: {
        oneOf: [{ type: "array", items: { "$ref": "#/definitions/outcome_node" } },
                { "$ref": "#/definitions/outcome_node" }]
      },

      outcome_node: {
        type: "object",
        properties: {
          move1: { type: "string" },
          move2: { type: "string" },
          weight: { type: ["string","number"] },
          exclusive: { type: "boolean" },
          outro: { "$ref": "#/definitions/intro_list" },
          outro2: { "$ref": "#/definitions/intro_list" },
          next: { oneOf: [ { "$ref": "#/definitions/choice_ref" },
                           { type: "array", items: { "$ref": "#/definitions/choice_ref" } } ] },
          local: { type: "object" },
          global: { type: "object" },
          mood: { type: "string" },
          verb: { type: "string" },
          common: { type: "object" },
          local1: { type: "object" },
          local2: { type: "object" },
          global1: { type: "object" },
          global2: { type: "object" },
          mood1: { type: "string" },
          mood2: { type: "string" },
          verb1: { type: "string" },
          verb2: { type: "string" }
        },
        additionalProperties: false
      },

      intro_list: intro_list_schema,
      intro_node: intro_node_schema,

      random_menu_group: {
        type: "object",
        properties: {
	  n: { type: "number" },
          shuffle: { type: "boolean" },  // defaults to same as outer randmenu.shuffle
	  opts: {
	    type: "array",
	    items: {
              oneOf: [{ "$ref": "#/definitions/intro_node" },
                      { type: "object",
                        required: ["option"],
	                properties: {
	                  weight: { type: "number" },
	                  exclusive: { type: "boolean" },  // defaults to true
	                  option: { "$ref": "#/definitions/intro_node" }
	                },
                        additionalProperties: false
	              }]
	    }
          }
        },
        required: ["opts"],
        additionalProperties: false
      }
    },

    "$ref": "#/definitions/choice"
  },

  // Text schema
  textSchema: {
    definitions: {
      intro_list: intro_list_schema,
      intro_node: intro_node_schema
    },
    "$ref": "#/definitions/intro_node"
  },

  // Move schema
  moveSchema: {
    definitions: {
      move: {
        type: "object",
        properties: {
	  id: { type: "number" },
	  action: { type: ["string","number"] },
	  children: {
	    type: "array",
	    items: { "$ref": "#/definitions/move" }
	  },
	  label: { type: "object" }
        },
        additionalProperties: "false"
      }
    },

    "$ref": "#/definitions/move"
  },

  // Location schema
  locationSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      checkpoint: { type: "boolean" },
      visible: { type: "string" },
      locked: { type: "string" },
      links: {
        type: "array",
        items: {
          oneOf: [
            { type: "string" },
            { type: "object",
              additionalProperties: false,
              properties: {
                to: { type: "string" },
                title: { type: "string" },
                requires: { type: "object" },
                hint: { type: "string" }
              }
            }
          ]
        }
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            visible: { type: "string" },
            verb: { type: "object",
                    additionalProperties: false,
                    properties: { buy: { type: "string" },
                                  sell: { type: "string" } } },
            buy: { type: ["boolean","object"] },
            sell: { type: ["boolean","object"] }
          }
        }
      },
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            hint: { type: "string" },
            ready: { type: "string" },
            set: { type: "string" },
            go: { type: "string" },
            pitch: { type: "string" },
            opponent: { type: "string" },
            compatibility: { type: "string" },
            role1weight: { type: "string" },
            timeout: { type: "number" },
            resetAllowed: { type: "boolean" },
            reset: { type: "number" },
            wait: { type: "number" },
            visible: { type: "string" },
            locked: { type: "string" },
            cost: { type: "object" },
            required: { type: "object" },
            choice: { type: "string" }
          }
        }
      }
    }
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

  validateChoice: function (data, errorCallback) {
    return this.validate (data, this.choiceSchema, "Choice", errorCallback)
  },

  validateText: function (data, errorCallback) {
    return this.validate (data, this.textSchema, "Text", errorCallback)
  },

  validateMove: function (data, errorCallback) {
    return this.validate (data, this.moveSchema, "Move", errorCallback)
  },

  validateLocation: function (data, errorCallback) {
    return this.validate (data, this.locationSchema, "Location", errorCallback)
  }
};
