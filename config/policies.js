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


// Set restPolicy to 'isAdmin' to prevent unauthorized modification of all database tables
var restPolicy = 'isAdmin'

// Set findPolicy to 'isAdmin' to prevent unauthorized inspection of all database tables
var findPolicy = true
// var findPolicy = 'isAdmin'

// Set clientPolicy to 'isAuthenticated' to prevent unauthenticated client operations (gameplay, config, etc)
var clientPolicy = true
// var clientPolicy = 'isAuthenticated'

module.exports.policies = {

  /***************************************************************************
   *                                                                          *
   * Default policy for all controllers and actions (`true` allows public     *
   * access)                                                                  *
   *                                                                          *
   ***************************************************************************/

  //  '*': true,

  'GrammarController': { '*': restPolicy, find: findPolicy, findOne: findPolicy },
  'PlayerController': { '*': restPolicy, find: findPolicy, findOne: findPolicy },

  // non-permissive policy for player controller
  'ClientController': {
    'create': true,
    'otherStatus': true,
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
