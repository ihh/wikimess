/**
 * AuthController
 *
 * @description :: Server-side logic for managing auths
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var passport = require('passport');

module.exports = {

  _config: {
    actions: false,
    shortcuts: false,
    rest: false
  },

  homepage: function (req, res) {
    var playerID = req.session.passport.user
    if (playerID)
      Player.findOne({ id: playerID })
      .exec (function (err, player) {
        if (player)
          return res.view ('homepage',
                           { loggedIn: true,
                             player: PlayerService.makeLoginSummary (player) })
        else
          return res.view ('homepage',
                           { loggedIn: false })
      })
    else
      return res.view ('homepage',
                       { loggedIn: false })
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
    req.logout();
    res.redirect('/');
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
  }
  

};

