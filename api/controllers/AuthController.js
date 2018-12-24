/**
 * AuthController
 *
 * @description :: Server-side logic for managing auths
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var passport = require('passport');
var twitterAPI = require('node-twitter-api');

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {

  _config: {
    actions: false,
    shortcuts: false,
    rest: false
  },

  loginOrHomepage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        res.view ('homepage', homepage.vars)
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  homepage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        homepage.vars.init = true
        homepage.vars.initConfig = homepage.vars.initConfig || {}
        homepage.vars.initConfig.action = homepage.vars.initConfig.action || 'home'
        res.view ('homepage', homepage.vars)
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  twitterConfigPage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        homepage.vars.init = true
        homepage.vars.initConfig = homepage.vars.initConfig || {}
        homepage.vars.initConfig.action = 'twitter'
        res.view ('homepage', homepage.vars)
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  broadcastPage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var messageID = Message.parseID (req.params.message)
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        homepage.vars.init = true
        homepage.vars.initConfig =
          extend ({},
                  homepage.vars.initConfig,
                  { action: 'message',
                    message: messageID })
        res.view ('homepage', homepage.vars)
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  composePage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var symname = req.params.symname
    var content, text = req.query.text
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        var contentPromise
        if (symname)
          contentPromise = Symbol.findOneCached ({ name: symname })
          .then (function (symbol) {
            if (symbol)
              content = [{ id: symbol.id,
                           name: symbol.name }]
            else
              content = [{ name: symname.replace(/[^\w]/g,'') }]
          })
        else
          contentPromise = Promise.resolve (true)
        contentPromise
          .then (function() {
            homepage.vars.init = true
            homepage.vars.initConfig =
              extend ({},
                      homepage.vars.initConfig,
                      { action: 'compose',
                        recipient: null,
                        title: symname ? symname.replace(/_/g,' ') : (text ? text.substr(0,64) : undefined),  // default title length encoded here
                        content: content,
                        text: text })
            res.view ('homepage', homepage.vars)
          })
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  authorPage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var authorName = req.params.name
    return Player.findOne ({ name: authorName })
      .then (function (author) {
        if (!author)
          throw new Error (authorName + ' not found')
        return PlayerService.makeHomepage (playerID)
          .then (function (homepage) {
            homepage.vars.init = true
            homepage.vars.initConfig =
              extend ({},
                      homepage.vars.initConfig,
                      { action: 'compose',
                        recipient: null,
                        author: author.id })
            res.view ('homepage', homepage.vars)
          })
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  grammarPage: function (req, res) {
    var playerID = (req.session && req.session.passport) ? (req.session.passport.user || null) : null
    var symname = req.params.symname
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        return Symbol.findOneCached ({ name: symname })
          .then (function (symbol) {
            if (symbol) {
              homepage.vars.init = true
              homepage.vars.initConfig =
              extend ({},
                      homepage.vars.initConfig,
                      { action: 'grammar',
                        symbol: { id: symbol.id,
                                  name: symbol.name } })
            }
            res.view ('homepage', homepage.vars)
          })
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  login: function(req, res, next) {

    passport.authenticate('local', function(err, player, info) {
      if ((err) || (!player)) {
        return res.send({
          message: info.message
        });
      }
      req.logIn(player, function(err) {
        if (err)
          res.send(err);
        else {
          return res.send({
            message: info.message,
            player: PlayerService.makeLoginSummary (player)
          });
        }
      });

    })(req, res, next);
  },

  logout: function(req, res) {
    // https://stackoverflow.com/a/19132999
    req.session.destroy(function (err) {
      res.redirect('/') //Inside a callback... "bulletproof"
    })
  },

  facebookLogin:function (req, res, next) {
    passport.authenticate('facebook', { scope: ['email', 'user_about_me', 'user_friends']},
                          function (err, player) {
                            req.logIn(player, function (err) {
                              if (err) res.send(err)
                              return res.send({
                                player: PlayerService.makeLoginSummary (player)
                              });
                            });
                          })(req, res, next);
  },

  facebookLoginCallback: function (req, res, next) {
    passport.authenticate('facebook',
                          function (err, player) {
                            req.logIn(player, function (err) {
                              if (err) return res.send(err)
                              return res.redirect('/')
                            });
                          })(req, res, next);
  },

  twitterLogin:function (req, res, next) {
    passport.authenticate('twitter', { failureRedict: '/login' },
                          function (err, player) {
                            req.logIn(player, function (err) {
                              if (err) res.send(err)
                              return res.send({
                                player: PlayerService.makeLoginSummary (player)
                              });
                            });
                          })(req, res, next);
  },

  twitterLoginCallback: function (req, res, next) {
    passport.authenticate('twitter',
                          function (err, player) {
                            req.logIn(player, function (err) {
                              if (err) return res.send(err)
                              return res.redirect('/')
                            });
                          })(req, res, next);
  },

  twitterAuthorize: function (req, res, next) {
    var twitter = new twitterAPI({
      consumerKey: sails.config.local.twitter.consumerKey,
      consumerSecret: sails.config.local.twitter.consumerSecret,
      callback: (sails.config.local.baseURL || 'http://localhost:1337') + '/login/twitter/auth/callback',
      x_auth_access_type: "write"
    });

    twitter.getRequestToken(function(error, requestToken, requestTokenSecret, results){
      if (error) {
        console.log("Error getting OAuth request token : " + error);
        res.serverError()
      } else {
        req.session.twitterRequestTokenSecret = req.session.twitterRequestTokenSecret || {}
        req.session.twitterRequestTokenSecret[requestToken] = requestTokenSecret
        var twitterAuthorizeURL = 'https://twitter.com/oauth/authorize?oauth_token=' + requestToken + '&force_login=1'
        if (req.user && req.user.twitterScreenName)
          twitterAuthorizeURL = twitterAuthorizeURL + '&screen_name=' + req.user.twitterScreenName
        res.redirect (twitterAuthorizeURL)
      }
    });
  },

  twitterAuthorizeCallback: function (req, res, next) {
    var requestToken = req.param('oauth_token')
    var oauth_verifier = req.param('oauth_verifier')
    var requestTokenSecret = req.session.twitterRequestTokenSecret ? req.session.twitterRequestTokenSecret[requestToken] : ''
    var twitter = new twitterAPI({
      consumerKey: sails.config.local.twitter.consumerKey,
      consumerSecret: sails.config.local.twitter.consumerSecret
    });
    twitter.getAccessToken (requestToken, requestTokenSecret, oauth_verifier, function (error, accessToken, accessTokenSecret, results) {
      if (error) {
        console.log(error)
        res.serverError()
      } else if (!results)
        res.serverError()
      else
        Player.update ({ id: req.user.id },
                       { twitterId: results.user_id,
			 twitterScreenName: results.screen_name,
			 twitterAccessToken: accessToken,
                         twitterAccessTokenSecret: accessTokenSecret })
          .then (function() {
            res.redirect('/twitter')
          }).catch (function (err) {
            res.serverError()
          })
    });    
  },

  twitterDeauthorize: function (req, res, next) {
    if (req.session && req.session.passport && req.session.passport.user)
      Player.update ({ id: req.user.id },
		     { twitterId: null,
		       twitterScreenName: null,
		       twitterAccessToken: null,
                       twitterAccessTokenSecret: null })
      .then (function() {
	res.ok()
      }).catch (function (err) {
	res.serverError()
      })
    else
      res.status(401).send({error:"Not authenticated"});
  },
  
};

