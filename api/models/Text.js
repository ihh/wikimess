/**
 * Text.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
    id: {
      type: 'integer',
      autoIncrement: true,
      unique: true,
      primaryKey: true
    },

    name: {
      type: "string",
      unique: true
    },

    text: { type: "string" },
    append: { type: "boolean" },
    prepend: { type: "boolean" },

    hint: { type: "string" },
    usable: { type: "string" },
    visible: { type: "string" },
    default: { type: "boolean" },
    weight: { type: "string" },

    expr: { type: "json" },
    symexpr: { type: "json" },
    label: { type: "json" },
    labelexpr: { type: "json" },
    sequence: { type: "json" },
    define: { type: "json" },
    auto: { type: "boolean" },
    optimal: { type: "boolean" },
    left: { type: "json" },
    right: { type: "json" },
    next: { type: "json" },
    menu: { type: "json" },
    randmenu: { type: "json" }
  }
};

