'use strict';

module.exports = function(server) {
  var router = server.loopback.Router();
  router.get('/', function(req, res, next) {
    res.render('pages/index', { user: req.user });
  });
  server.use(router);
};
