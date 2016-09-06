var passport = require('passport'),
LocalStrategy = require('passport-local').Strategy,
bcrypt = require('bcrypt');

passport.serializeUser(function(player, done) {
    done(null, player.id);
});

passport.deserializeUser(function(id, done) {
    Player.findOne({ id: id } , function (err, player) {
        done(err, player);
    });
});

passport.use(new LocalStrategy({
    usernameField: 'name',
    passwordField: 'password'
  },
  function(name, password, done) {

    Player.findOne({ name: name }, function (err, player) {
      if (err) { return done(err); }
      if (!player) {
        return done(null, false, { message: 'Incorrect player name.' });
      }

      bcrypt.compare(password, player.password, function (err, res) {
          if (!res)
            return done(null, false, {
              message: 'Invalid Password'
            });
          var returnPlayer = {
            name: player.name,
            createdAt: player.createdAt,
            id: player.id
          };
          return done(null, returnPlayer, {
            message: 'Logged In Successfully'
          });
        });
    });
  }
));