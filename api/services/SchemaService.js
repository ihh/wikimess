// api/services/SchemaService.js

var JsonValidator = require( 'jsonschema' ).Validator;

var intro_node_schema = {
  oneOf: [{ type: "string" },
          { type: "object",
	    required: ["ref"],
	    properties: {
              hint: ref_schema('sample_string'),
	      usable: ref_schema('sample_string'),
	      visible: ref_schema('sample_string'),
              grammar: { type: "object" },
	      ref: { type: "string" }
	    },
	    additionalProperties: false
	  },
          { type: "object",
	    required: ["goto"],
            properties: {
              name: { type: "string" },
              hint: ref_schema('sample_string'),
	      usable: ref_schema('sample_string'),
	      visible: ref_schema('sample_string'),
	      expr: { type: "string" },
	      symexpr: { type: "string" },
	      switch: ref_schema('intro_node_cases'),
	      sample1: ref_schema('intro_node_opts'),
              grammar: { type: "object" },
              goto: ref_schema('sample_string')
            },
            additionalProperties: false
          },
          { type: "object",
	    required: ["sequence"],
            properties: {
              name: { type: "string" },
              hint: ref_schema('sample_string'),
	      usable: ref_schema('sample_string'),
	      visible: ref_schema('sample_string'),
	      expr: { type: "string" },
	      symexpr: { type: "string" },
	      switch: ref_schema('intro_node_cases'),
	      sample1: ref_schema('intro_node_opts'),
              grammar: { type: "object" },
              label: { type: "object" },
              labexpr: { type: "object" },
              sequence: ref_schema('sample_intro_nodes'),
              define: { type: "array", minItems: 1, items: ref_schema('intro_node') }
            },
            additionalProperties: false
          },
          { type: "object",
            properties: {
              name: { type: "string" },
              text: ref_schema('sample_string'),
              hint: ref_schema('sample_string'),
	      usable: ref_schema('sample_string'),
	      visible: ref_schema('sample_string'),
	      expr: { type: "string" },
	      symexpr: { type: "string" },
	      switch: ref_schema('intro_node_cases'),
	      sample1: ref_schema('intro_node_opts'),
              grammar: { type: "object" },
              label: { type: "object" },
              labexpr: { type: "object" },
              define: { type: "array", minItems: 1, items: ref_schema('intro_node') },
              left: ref_schema('intro_node'),
              right: ref_schema('intro_node'),
              next: ref_schema('intro_node'),
              menu: ref_schema('sample_intro_nodes'),
	      auto: { type: "boolean" }
            },
            additionalProperties: false
          }]
}

function list_or_sample_schema (itemType) {
  return { oneOf:
	   [{ type: "array", minItems: 1, items: itemType },
	    { type: "object",
	      required: ["sample"],
	      properties:
	      { sample:
		{ type: "object",
		  additionalProperties: false,
		  properties:
		  { symmetric: { type: "boolean" },
		    shuffle: { type: "boolean" },
		    cluster: { type: "boolean" },
		    groups:
		    { type: "array",
		      items:
		      { type: "object",
			properties:
			{ n: { type: "number" },
			  shuffle: { type: "boolean" },  // defaults to same as enclosing sample_expr.shuffle
			  opts: sample_opts_schema(itemType) },
			required: ["opts"],
			additionalProperties: false } } } } } }] }
}

function sample_opts_schema (itemType) {
  return { type: "array",
	   items:
	   { oneOf:
	     [itemType,
	      { type: "object",
		required: ["option"],
		properties:
		{ weight: { type: "number" },
		  exclusive: { type: "boolean" },  // defaults to true
		  option: itemType },
		additionalProperties: false }] } }
}

function sample1_switch_schema (itemType) {
  return { oneOf:
	   [itemType,
	    switch_schema (itemType),
	    sample1_schema (itemType)] }
}

function sample1_schema (itemType) {
  return { type: "object",
	   required: ["sample1"],
	   additionalProperties: false,
	   properties:
	   { sample1: sample1_opts_schema (itemType) } }
}

function sample1_opts_schema (itemType) {
  return { type: "object",
	   required: ["opts"],
	   additionalProperties: false,
	   properties:
	   { opts: sample_opts_schema(itemType),
	     symmetric: { type: "boolean" } } }
}

function switch_schema (itemType) {
  return { type: "object",
	   required: ["switch"],
	   additionalProperties: false,
	   properties:
	   { "switch": case_list_schema(itemType) } }
}

function case_list_schema (itemType) {
  return { type: "array",
	   minItems: 1,
	   items:
	   { oneOf:
	     [{ type: "object",
		required: ["default"],
		properties:
		{ "default": itemType },
		additionalProperties: false },
	      { type: "object",
		required: ["test","case"],
		properties:
		{ "test": ref_schema('sample_string'),
		  "case": itemType },
		additionalProperties: false }] } }
}

function one_or_list_schema (itemType) {
  return { oneOf:
	   [itemType,
	    { type: "array", minItems: 1, items: itemType }] }
}

function ref_schema (type) {
  return { "$ref": "#/definitions/" + type }
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
          intro: ref_schema('intro_or_intro_list'),
          intro2: ref_schema('intro_or_intro_list'),

          outcome: ref_schema('outcome_or_outcome_list'),

          ll: ref_schema('outcome_or_outcome_list'),
          lr: ref_schema('outcome_or_outcome_list'),
          rl: ref_schema('outcome_or_outcome_list'),
          rr: ref_schema('outcome_or_outcome_list'),

          any: ref_schema('outcome_or_outcome_list'),

          lr2: ref_schema('outcome_or_outcome_list'),
          rl2: ref_schema('outcome_or_outcome_list'),

          auto: ref_schema('outcome_or_outcome_list'),
          effect: ref_schema('outcome_or_outcome_list')
        },
        additionalProperties: false
      },

      choice_ref: {
        oneOf: [{ type: "string" },
                ref_schema('choice')]
      },
      
      outcome_or_outcome_list: one_or_list_schema(ref_schema('outcome_node')),

      outcome_node: {
        type: "object",
        properties: {
          move1: { type: "string" },
          move2: { type: "string" },
          weight: { type: ["string","number"] },
          exclusive: { type: "boolean" },
          outro: ref_schema('intro_or_intro_list'),
          outro2: ref_schema('intro_or_intro_list'),
          next: one_or_list_schema(ref_schema('choice_ref')),
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

      intro_node: intro_node_schema,
      intro_or_intro_list: one_or_list_schema(ref_schema('intro_node')),
      intro_node_cases: case_list_schema(ref_schema('intro_node')),
      intro_node_opts: sample1_opts_schema(ref_schema('intro_node')),
      sample_intro_nodes: list_or_sample_schema(ref_schema('intro_node')),
      sample_string: sample1_switch_schema({ type: "string" })
    },

    "$ref": "#/definitions/choice"
  },

  // Text schema
  textSchema: {
    definitions: {
      intro_node: intro_node_schema,
      intro_node_cases: case_list_schema(ref_schema('intro_node')),
      intro_node_opts: sample1_opts_schema(ref_schema('intro_node')),
      sample_intro_nodes: list_or_sample_schema(ref_schema('intro_node')),
      sample_string: sample1_switch_schema({ type: "string" })
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
	    items: ref_schema('move')
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
