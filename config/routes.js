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
  '/logout': 'AuthController.logout',

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

  'POST /p/search/players/all':      'ClientController.searchAllPlayers',
  'POST /p/search/players/followed': 'ClientController.searchFollowedPlayers',
  'POST /p/search/symbols/all':      'ClientController.searchAllSymbols',
  'POST /p/search/symbols/owned':    'ClientController.searchOwnedSymbols',

  'POST /p/config':       'ClientController.configurePlayer',

  'GET /p/subscribe':     'ClientController.subscribePlayer',
  'GET /p/unsubscribe':   'ClientController.unsubscribePlayer',

  'GET /p/status':                  'ClientController.selfStatus',
  'GET /p/id/:name':                'ClientController.getPlayerId',
  'GET /p/thread/:id':              'ClientController.getThread',
  'GET /p/thread/:id/before/:date': 'ClientController.getThreadBefore',

  'GET /p/follow':          'ClientController.listFollowed',
  'GET /p/follow/:other':   'ClientController.follow',
  'GET /p/unfollow/:other': 'ClientController.unfollow',

  'GET /p/inbox':           'ClientController.getInbox',
  'GET /p/inbox/count':     'ClientController.getInboxCount',
  'GET /p/outbox':          'ClientController.getOutbox',

  'GET /p/message/:message':         'ClientController.getReceivedMessage',
  'GET /p/message/:message/header':  'ClientController.getReceivedMessageHeader',
  'GET /p/message/:message/sent':    'ClientController.getSentMessage',
  'POST /p/message':                 'ClientController.sendMessage',
  'DELETE /p/message/:message':      'ClientController.deleteMessage',
  'PUT /p/message/:message/rating':  'ClientController.rateMessage',

  'GET /p/drafts':           'ClientController.getDrafts',
  'GET /p/draft/:draft':     'ClientController.getDraft',
  'POST /p/draft':           'ClientController.saveDraft',
  'PUT /p/draft/:draft':     'ClientController.updateDraft',
  'DELETE /p/draft/:draft':  'ClientController.deleteDraft',

  'GET /p/symbols':          'ClientController.getSymbolsByOwner',
  'GET /p/symbol/:symid':    'ClientController.getSymbol',
  'PUT /p/symbol/:symid':    'ClientController.putSymbol',
  'POST /p/symbol':          'ClientController.newSymbol',
  'DELETE /p/symbol/:symid': 'ClientController.releaseSymbol',

  'GET /p/symbol/:symid/unsubscribe': 'ClientController.unsubscribeSymbol',

  'GET /p/symname/:symname':   'ClientController.getOrCreateSymbolByName',

  'GET /p/template/:template': 'ClientController.getTemplate',

  'GET /p/expand/:symid': 'ClientController.expandSymbol',
  'POST /p/expand':       'ClientController.expandSymbols',

  'GET /p/suggest/templates':       'ClientController.suggestTemplates',
  'GET /p/suggest/reply/:template': 'ClientController.suggestReply',
  'POST /p/suggest/symbol':         'ClientController.suggestSymbol',
  
};
