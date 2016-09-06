module.exports = function(req, res, next) {
   if (req.session.passport.user) {
       if (req.session.passport.user == req.params.player) {
	   return next();
       } else {
	   return res.status(403).send("Forbidden");
       }
   } else{
       return res.status(401).send("Not authenticated");
   }
};
