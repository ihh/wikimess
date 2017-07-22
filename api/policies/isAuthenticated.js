module.exports = function(req, res, next) {
  if (req.session.passport && req.session.passport.user) {
    return next();
  } else {
    return res.status(401).send({error:"Not authenticated"});
  }
};
