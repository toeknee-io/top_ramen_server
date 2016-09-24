path = require('path')
flash = require('express-flash')

module.exports = (app, passportConfigurator) ->

  # see passport errors
  app.use(flash())

  config = require(path.join(__dirname, '..', '/providers.json'))

  console.log('got config:')
  console.dir(config)

  console.log('got app:')
  console.dir(app)

  passportConfigurator.init()

  console.log('init passport')

  passportConfigurator.setupModels({
    userModel: app.models.user,
    userIdentityModel: app.models.userIdentity,
    userCredentialModel: app.models.userCredential
  })

  for s, c of config
    console.log('configing', s)
    console.dir(c)
    s.session = s.session isnt false
    passportConfigurator.configureProvider(s, c)