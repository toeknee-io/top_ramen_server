'use strict';

var path = require('path');

var loopback = require('loopback');
var boot = require('loopback-boot');
var app = module.exports = loopback();

var loopbackPassport = require('loopback-component-passport');
var PassportConfigurator = loopbackPassport.PassportConfigurator;
var passportConfigurator = new PassportConfigurator(app);

var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');

app.set('views', path.join(__dirname, '..', 'client', 'views'));
app.set('view engine', 'pug');

const bootOptions = { "appRootDir": __dirname,
                "bootScripts" : [ path.join(__dirname, 'boot', 'init.js') ] };

boot(app, bootOptions, function(err) {
  if (err) throw err;
});

// setup middleware for request parsing and auth/session handling
app.middleware('parse', bodyParser.json());
app.middleware('parse', bodyParser.urlencoded({
  extended: true,
}));

// access token is only available after boot
app.middleware('auth', loopback.token({
  model: app.models.accessToken,
}));

app.middleware('session:before', cookieParser(app.get('cookieSecret')));
app.middleware('session', expressSession({
  secret: 'kitty',
  saveUninitialized: true,
  resave: true,
}));

// initialize login through passport
require('./init-passport')(app, passportConfigurator);

app.get('/signup', function(req, res) {
  res.render('pages/signup');
});

app.get('/auth/account', ensureLoggedIn('/login'), function(req, res, next) {

  if (req.session.device && req.session.device.uuid
    && req.session.passport && req.session.passport.user)
  {

    app.models.device.findOrCreate( { where: { deviceId: req.session.device.uuid } }, { deviceId: req.session.device.uuid, userId: req.session.passport.user }, function(err, device, created) {

      if (err) {

        console.error(err);

        res.send('<h1>blaargh on device findOrCreate</h1>');

      }

      else if (created) console.log(`created new device record: deviceId [${device.deviceId}] userId [${device.userId}]`);
      else console.log(`device record already exists: deviceId [${device.deviceId}] userId [${device.userId}]`);

      app.models.accessToken.findOne( { where: { userId: device.userId }, order: 'created DESC' }, function(err, model) {

        if (err || !model) {

          if (err) console.error(err);

          if (!model) return console.log(`could not find accessToken for userId [${device.userId}]`);

          res.send('<h1>blaargh on accessToken findOne</h1>');

        }

        console.log(`accessToken.id: ${model.id}`);

        res.setHeader("Set-Cookie",`access_token=${model.id}`);

        res.render('pages/loginProfiles', {
          user: req.user,
          url: req.url,
        });

      });

    });

  } else {

    console.error('No device or user found in session');

    res.send('<h1>blaargh no device or user found in session</h1>');

  }

});

app.get('/local', function(req, res, next) {
  res.render('pages/local', {
    user: req.user,
    url: req.url,
  });
});

app.post('/signup', function(req, res, next) {

  var User = app.models.user;

  var newUser = {};
  newUser.email = req.body.email.toLowerCase();
  newUser.username = req.body.username.trim();
  newUser.password = req.body.password;

  User.create(newUser, function(err, user) {

    if (err) {
      req.flash('error', err.message);
      return res.redirect('back');
    } else {

        req.login(user, function(err) {
          if (err) {
            req.flash('error', err.message);
            return res.redirect('back');
          }
          //return res.redirect('/auth/account');
        });

        console.log('/signup email triggered');

        var options = {
          type: 'email',
          to: user.email,
          from: 'noreply@topramen.com',
          subject: 'NOOOOODLE!',
          template: path.resolve(__dirname, '../client/views/pages/loginProfiles.pug'),
          redirect: '/verified',
          user: user
        };

        user.verify(options, function(err, response) {
          if (err) {
            User.deleteById(user.id);
            return next(err);
          }

          console.log('/signup verification email sent:', response);

          res.render('pages/local-success', {
            title: 'Signed up successfully',
            content: 'Please check your email and click on the verification link ' +
                'before logging in.',
            redirectTo: '/login',
            redirectToLinkText: 'Log in'
          });
        });

    }

  });

});

app.get('/login', function(req, res) {
  res.render('pages/login');
});

app.get('/auth/logout', function(req, res, next) {
  req.logout();
  res.redirect('/');
});

app.post('/reset-password', ensureLoggedIn('/login'), function(req, res, next) {
  app.models.user.emit('resetPasswordRequest', req.user);
});

app.get('/reset-password', function(req, res, next) {
  app.models.user.emit('resetPasswordRequest', req.user);
  res.send('pw reset email sent');
});

app.get('/mobile/redirect/auth/:provider', function(req, res, next) {

  let provider = req.params.provider;

  if (!req.session.device)
    req.session.device = {};

  if (provider !== 'local')
    provider = 'auth/' + provider;

  req.session.device.uuid = req.query.uuid;

  res.redirect('/' + provider);

});

app.start = function() {
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    logger.info('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      logger.info('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

if (require.main === module)
  app.start();