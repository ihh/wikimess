/**
 * Policy Mappings
 * (sails.config.policies)
 *
 * Policies are simple functions which run **before** your controllers.
 * You can apply one or more policies to a given controller, or protect
 * its actions individually.
 *
 * Any policy file (e.g. `api/policies/authenticated.js`) can be accessed
 * below by its filename, minus the extension, (e.g. "authenticated")
 *
 * For more information on how policies work, see:
 * http://sailsjs.org/#!/documentation/concepts/Policies
 *
 * For more information on configuring policies, check out:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.policies.html
 */


// Set restPolicy to:
// 'isAdmin' to prevent unauthorized modification of all database tables
//  to true for unrestricted access
//var restPolicy = 'isAdmin'
var restPolicy = true // debug

// Set findPolicy to:
// 'isAdmin' to prevent unauthorized inspection of all database tables
//  true for unrestricted access
// var findPolicy = 'isAdmin'
var findPolicy = true // debug

// Set clientPolicy to:
// 'isAuthenticated' to prevent unauthenticated client operations (gameplay, config, etc)
//  true for unrestricted access to other players' operations
var clientPolicy = 'isAuthenticated'

// Collective blueprint policies
var blueprintPolicy = { '*': restPolicy, find: findPolicy, findOne: findPolicy }

module.exports.policies = {

  /***************************************************************************
   *                                                                          *
   * Default policy for all controllers and actions (`true` allows public     *
   * access)                                                                  *
   *                                                                          *
   ***************************************************************************/

  'AdjacencyController': blueprintPolicy,
  'DraftController': blueprintPolicy,
  'FollowController': blueprintPolicy,
  'GrammarController': blueprintPolicy,
  'MessageController': blueprintPolicy,
  'PlayerController': blueprintPolicy,
  'SymbolController': blueprintPolicy,
  'TemplateController': blueprintPolicy,

  'IconController': { '*': true },

  // non-permissive policy for player controller
  'ClientController': {
    'createPlayer': true,
    '*': clientPolicy
  },


  /***************************************************************************
   *                                                                          *
   * Here's an example of mapping some policies to run before a controller    *
   * and its actions                                                          *
   *                                                                          *
   ***************************************************************************/
  // RabbitController: {

  // Apply the `false` policy as the default for all of RabbitController's actions
  // (`false` prevents all access, which ensures that nothing bad happens to our rabbits)
  // '*': false,

  // For the action `nurture`, apply the 'isRabbitMother' policy
  // (this overrides `false` above)
  // nurture	: 'isRabbitMother',

  // Apply the `isNiceToAnimals` AND `hasRabbitFood` policies
  // before letting any users feed our rabbits
  // feed : ['isNiceToAnimals', 'hasRabbitFood']
  // }

};
