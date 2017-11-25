/**
 * AuthController
 *
 * @description :: Server-side logic for managing auths
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var passport = require('passport');

var Promise = require('bluebird')
var extend = require('extend')

module.exports = {

  _config: {
    actions: false,
    shortcuts: false,
    rest: false
  },

  loginOrHomepage: function (req, res) {
    var playerID = req.session.passport.user
    return PlayerService.makeHomepage (playerID)
      .then (function (homepage) {
        res.view ('homepage', homepage.vars)
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  homepage: function (req, res) {
    var playerID = req.session.passport.user
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

  broadcastPage: function (req, res) {
    var playerID = req.session.passport.user
    var messageID = parseInt (req.params.message)
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
    var playerID = req.session.passport.user
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
                      { action: 'compose',
                        recipient: null,
                        title: symname.replace(/_/g,' '),
                        content: [{ id: symbol.id,
                                    name: symbol.name }] })
            }
            res.view ('homepage', homepage.vars)
          })
      }).catch (function (err) {
        console.log(err)
        res.notFound()
      })
  },

  grammarPage: function (req, res) {
    var playerID = req.session.passport.user
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
                            //                                console.log("facebookLoginCallback")
                            //                                console.log(err)
                            //                                console.log(player)
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
                            //                                console.log("facebookLoginCallback")
                            //                                console.log(err)
                            //                                console.log(player)
                            req.logIn(player, function (err) {
                              if (err) return res.send(err)
                              return res.redirect('/')
                            });
                          })(req, res, next);
  }
  

};

