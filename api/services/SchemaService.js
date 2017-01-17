// api/services/SchemaService.js

var JsonValidator = require( 'jsonschema' ).Validator;

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
	      switch: { type: "#/definitions/switch_expr" },
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
	      switch: { type: "#/definitions/switch_expr" },
              label: { type: "object" },
              labelexpr: { type: "object" },
              sequence: { type: "#/definitions/sample_expr" },
              define: { type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } }
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
	      switch: { type: "#/definitions/switch_expr" },
              label: { type: "object" },
              labelexpr: { type: "object" },
              define: { type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } },
              left: { "$ref": "#/definitions/intro_node" },
              right: { "$ref": "#/definitions/intro_node" },
              next: { "$ref": "#/definitions/intro_node" },
              menu: { "$ref": "#/definitions/sample_expr" }
            },
            additionalProperties: false
          }]
}

var sample_expr_schema = {
  oneOf: [{ type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } },
	  { type: "object",
	    required: ["sample"],
	    properties: {
	      sample: { type: "object",
			properties: {
			  symmetric: { type: "boolean" },
			  shuffle: { type: "boolean" },
			  cluster: { type: "boolean" },
			  groups: { type: "array", items: { "$ref": "#/definitions/sample_group" } }
			},
		        required: ["groups"],
			additionalProperties: false
		      }
	    },
	    additionalProperties: false }]
}

var sample_group_schema = {
  type: "object",
  properties: {
    n: { type: "number" },
    shuffle: { type: "boolean" },  // defaults to same as enclosing sample_expr.shuffle
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

var switch_expr_schema = {
  type: "array",
  minItems: 1,
  items: {
    oneOf: [{ type: "object",
	      required: ["default"],
	      properties: {
		"default": { "$ref": "#/definitions/intro_node" }
	      },
	      additionalProperties: false
	    },
	    { type: "object",
	      required: ["test","case"],
	      properties: {
		"test": { type: "string" },
		"case": { "$ref": "#/definitions/intro_node" }
	      },
	      additionalProperties: false
	    }]
  }
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
          intro: { "$ref": "#/definitions/intro_or_intro_list" },
          intro2: { "$ref": "#/definitions/intro_or_intro_list" },

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
          outro: { "$ref": "#/definitions/intro_or_intro_list" },
          outro2: { "$ref": "#/definitions/intro_or_intro_list" },
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

      intro_or_intro_list: {
	oneOf: [{ type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } },
		{ "$ref": "#/definitions/intro_node" }]
      },

      intro_node: intro_node_schema,
      switch_expr: switch_expr_schema,
      sample_expr: sample_expr_schema,
      sample_group: sample_group_schema
    },

    "$ref": "#/definitions/choice"
  },

  // Text schema
  textSchema: {
    definitions: {
      intro_node: intro_node_schema,
      switch_expr: switch_expr_schema,
      sample_expr: sample_expr_schema,
      sample_group: sample_group_schema
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
            opponent: { oneOf: [ { type: "string" },
				 { type: "array", minItems: 1, items: { type: "string" } }] },
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
