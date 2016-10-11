module.exports = function(app, passportConfigurator) {

  var config = require('/home/ubuntu/top_ramen/providers.json');

  passportConfigurator.init();

  // see passport errors
  app.use(require('express-flash')());

  passportConfigurator.setupModels({
    userModel: app.models.user,
    userIdentityModel: app.models.userIdentity,
    userCredentialModel: app.models.userCredential
  });

  for (var s in config) {
    var c = config[s];
    c.session = c.session !== false;
    passportConfigurator.configureProvider(s, c);
  }

  return app;

};
