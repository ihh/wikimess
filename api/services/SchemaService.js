// api/services/SchemaService.js

var JsonValidator = require( 'jsonschema' ).Validator;

var choiceSchema = {
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

        rx: { "$ref": "#/definitions/outcome_list" },
        lx: { "$ref": "#/definitions/outcome_list" },
        xr: { "$ref": "#/definitions/outcome_list" },
        xl: { "$ref": "#/definitions/outcome_list" },
        'r*': { "$ref": "#/definitions/outcome_list" },
        'l*': { "$ref": "#/definitions/outcome_list" },
        '*r': { "$ref": "#/definitions/outcome_list" },
        '*l': { "$ref": "#/definitions/outcome_list" },

        notrr: { "$ref": "#/definitions/outcome_list" },
        notrl: { "$ref": "#/definitions/outcome_list" },
        notlr: { "$ref": "#/definitions/outcome_list" },
        notll: { "$ref": "#/definitions/outcome_list" },
        '!rr': { "$ref": "#/definitions/outcome_list" },
        '!rl': { "$ref": "#/definitions/outcome_list" },
        '!lr': { "$ref": "#/definitions/outcome_list" },
        '!ll': { "$ref": "#/definitions/outcome_list" },

        any: { "$ref": "#/definitions/outcome_list" },
        '*': { "$ref": "#/definitions/outcome_list" },

        same: { "$ref": "#/definitions/outcome_list" },
        diff: { "$ref": "#/definitions/outcome_list" },
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
        verb2: { type: "string" },
        l: { type: "object" },
        g: { type: "object" },
        m: { type: "string" },
        v: { type: "string" },
        l1: { type: "object" },
        l2: { type: "object" },
        g1: { type: "object" },
        g2: { type: "object" },
        m1: { type: "string" },
        m2: { type: "string" },
        v1: { type: "string" },
        v2: { type: "string" }
      },
      additionalProperties: false
    },

    intro_list: {
      oneOf: [{ type: "array", minItems: 1, items: { "$ref": "#/definitions/intro_node" } },
              { "$ref": "#/definitions/intro_node" }]
    },

    intro_node: {
      oneOf: [{ type: "string" },
              { type: "object",
		required: ["goto"],
                properties: {
                  hint: { type: "string" },
		  visible: { type: "string" },
                  goto: { type: "string" }
                },
                additionalProperties: false
              },
              { type: "object",
		required: ["sequence"],
                properties: {
                  hint: { type: "string" },
		  visible: { type: "string" },
                  label: { type: "object" },
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
                  label: { type: "object" },
                  define: { type: "#/definitions/intro_node_list" },
                  left: { "$ref": "#/definitions/intro_node" },
                  right: { "$ref": "#/definitions/intro_node" },
                  next: { "$ref": "#/definitions/intro_node" },
                  menu: { "type": "array", items: { "$ref": "#/definitions/intro_node" } },
                  l: { "$ref": "#/definitions/intro_node" },
                  r: { "$ref": "#/definitions/intro_node" },
                  n: { "$ref": "#/definitions/intro_node" },
                  t: { type: "string" },
                  h: { type: "string" },
                  c: { type: "string" }
                },
                additionalProperties: false
              }]
    }
  },

  "$ref": "#/definitions/choice"

};


var moveSchema = {
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
};

module.exports = {
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
    return this.validate (data, choiceSchema, "Choice", errorCallback)
  },

  validateMove: function (data, errorCallback) {
    return this.validate (data, moveSchema, "Move", errorCallback)
  }
};
