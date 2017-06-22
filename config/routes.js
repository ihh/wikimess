/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes map URLs to views and controllers.
 *
 * If Sails receives a URL that doesn't match any of the routes below,
 * it will check for matching files (images, scripts, stylesheets, etc.)
 * in your assets directory.  e.g. `http://localhost:1337/images/foo.jpg`
 * might match an image file: `/assets/images/foo.jpg`
 *
 * Finally, if those don't match either, the default 404 handler is triggered.
 * See `api/responses/notFound.js` to adjust your app's 404 logic.
 *
 * Note: Sails doesn't ACTUALLY serve stuff from `assets`-- the default Gruntfile in Sails copies
 * flat files from `assets` to `.tmp/public`.  This allows you to do things like compile LESS or
 * CoffeeScript for the front-end.
 *
 * For more information on configuring custom routes, check out:
 * http://sailsjs.org/#!/documentation/concepts/Routes/RouteTargetSyntax.html
 */

module.exports.routes = {

  /***************************************************************************
   *                                                                          *
   * Make the view located at `views/homepage.ejs` (or `views/homepage.jade`, *
   * etc. depending on your default view engine) your home page.              *
   *                                                                          *
   * (Alternatively, remove this and add an `index.html` file in your         *
   * `assets` directory)                                                      *
   *                                                                          *
   ***************************************************************************/

  '/': 'AuthController.homepage',

  /***************************************************************************
   *                                                                          *
   * Custom routes here...                                                    *
   *                                                                          *
   * If a request to a URL doesn't match any of the custom routes above, it   *
   * is matched against Sails route blueprints. See `config/blueprints.js`    *
   * for configuration options and examples.                                  *
   *                                                                          *
   ***************************************************************************/

  'POST /login': 'AuthController.login',
  '/logout':     'AuthController.logout',

  'GET /login/facebook':          'AuthController.facebookLogin',
  'GET /login/facebook/callback': 'AuthController.facebookLoginCallback',

  'GET /icon/:icon.svg':                    'IconController.getIcon',
  'GET /icon/:icon/:color.svg':             'IconController.getIcon',
  'GET /icon/:icon/:color/:background.svg': 'IconController.getIcon',

  'GET /icon/:icon':                    'IconController.getIcon',
  'GET /icon/:icon/:color':             'IconController.getIcon',
  'GET /icon/:icon/:color/:background': 'IconController.getIcon', 

  'POST /id':                     'ClientController.byName',

  'POST /p/new':                  'ClientController.createPlayer',

  'POST /p/:player/search':       'ClientController.searchDisplayName',
  'POST /p/:player/config':       'ClientController.configurePlayer',

  'GET /p/:player/subscribe':     'ClientController.subscribePlayer',

  'GET /p/:player/status':        'ClientController.selfStatus',
  'GET /p/:player/status/:other': 'ClientController.otherStatus',

  'GET /p/:player/follow':          'ClientController.listFollowed',
  'GET /p/:player/follow/:other':   'ClientController.follow',
  'GET /p/:player/unfollow/:other': 'ClientController.unfollow',

  'GET /p/:player/inbox':           'ClientController.getInbox',
  'GET /p/:player/inbox/count':     'ClientController.getInboxCount',
  'GET /p/:player/outbox':          'ClientController.getOutbox',

  'GET /p/:player/message/:message':    'ClientController.getMessage',
  'POST /p/:player/message':            'ClientController.sendMessage',
  'DELETE /p/:player/message/:message': 'ClientController.deleteMessage',

  'GET /p/:player/symbols':          'ClientController.getSymbolsByOwner',
  'GET /p/:player/symbol':           'ClientController.newSymbol',
  'GET /p/:player/symbol/:symid':    'ClientController.getSymbol',
  'PUT /p/:player/symbol/:symid':    'ClientController.putSymbol',
  'DELETE /p/:player/symbol/:symid': 'ClientController.releaseSymbol',

  'GET /p/:player/symbol/:symid/unsubscribe': 'ClientController.unsubscribeSymbol',

  'GET /p/:player/expand/:symid': 'ClientController.expandSymbol',
};
