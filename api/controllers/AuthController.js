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

    login: function(req, res) {

        passport.authenticate('local', function(err, player, info) {
            if ((err) || (!player)) {
                return res.send({
                    message: info.message,
                    player: player
                });
            }
            req.logIn(player, function(err) {
                if (err) res.send(err);
                return res.send({
                    message: info.message,
                    player: player
                });
            });

        })(req, res);
    },

    logout: function(req, res) {
        req.logout();
        res.redirect('/');
    }	
};

