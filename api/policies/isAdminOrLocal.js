module.exports = function(req, res, next) {
  if (req.headers.host === 'localhost:' + sails.config.port)
    next()
  else if (req.session && req.session.passport && req.session.passport.user) {
    return Player.findOne ({ id: req.session.passport.user })
      .then (function (player) {
        if (player.admin)
          next()
        else
          return res.status(403).send({error:"Forbidden"});
      })
  } else
    res.status(401).send({error:"Not authenticated"})
};
