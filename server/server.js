'use strict';

const path = require('path');
const inpect = require('util').inspect;

const loopback = require('loopback');
const boot = require('loopback-boot');
const app = module.exports = require(path.join(__dirname, 'lib', 'init-ramen'))(loopback());

const loopbackPassport = require('loopback-component-passport');
const PassportConfigurator = loopbackPassport.PassportConfigurator;
const passportConfigurator = new PassportConfigurator(app);

const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');

app.set('views', path.join(__dirname, '..', 'client', 'views'));
app.set('view engine', 'pug');

boot(app, __dirname, err => { if (err) throw err; });

app.use(function (req, res, next) {
  req._ramen = {};
  next();
});

// setup middleware for request parsing and auth/session handling
app.middleware('parse', bodyParser.json());
app.middleware('parse', bodyParser.urlencoded({ extended: true }));

// access token is only available after boot
app.middleware('auth', loopback.token({ model: app.models.accessToken }));

app.middleware('session:before', cookieParser(app.get('cookieSecret')));
app.middleware('session', expressSession({
  secret: app.get('sessionSecret'),
  saveUninitialized: true,
  resave: true
}));

require(path.join(__dirname, 'lib', './init-passport'))(app, passportConfigurator);

app.get('/signup', (req, res) => res.render('pages/signup'));

app.get('/auth/account', ensureLoggedIn('/login'), function(req, res, next) {

  if (req.session.device && req.session.device.uuid
    && req.session.passport && req.session.passport.user)
  {

    app.models.device.findOrCreate({ where: { deviceId: req.session.device.uuid, userId: req.session.passport.user } }, { deviceId: req.session.device.uuid, deviceType: req.session.device.deviceType, userId: req.session.passport.user }, function(err, device, created) {

      if (err || !device) {
        console.error(err);
        return res.status(500).json({ error: { name: "Derprror", status: 500, message: `Failed to findOrCreate device record because ${err}` } });
      }

      if (created && device.userId)
        console.log(`created and logged in new user: userId [${device.userId}] deviceType [${device.deviceType}] deviceId [${device.deviceId}] `);

      if (device.deviceType === 'android' || device.deviceType === 'ios')
        res.redirect('/mobile/redirect/auth/success');
      else
        res.render('pages/loginProfiles', {
          user: req.user,
          url: req.url
        });

    });

  } else {

    console.error(`No device or user found in session ${inspect(req.session)}`);

    res.status(500).json({ error: { name: "AuthError", status: 50, message: "No device or user found in session" } });

  }

});

app.get('/local', function(req, res) {
  res.render('pages/local', {
    user: req.user,
    url: req.url
  });
});

app.post('/signup', function(req, res, next) {

  let User = app.models.user;

  let newUser = {};
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

        let options = {
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

app.get('/login', (req, res) => res.render('pages/login'));

app.post('/api/auth/logout', function(req, res) {
  req.logout();
  res.status(200).json({ success: true });
});

app.post('/reset-password', ensureLoggedIn('/login'), (req, res, next) => {
  app.models.user.emit('resetPasswordRequest', req.user);
  next();
});

app.get('/reset-password', function(req, res) {
  app.models.user.emit('resetPasswordRequest', req.user);
  res.send('pw reset email sent');
});

app.get('/mobile/redirect/auth/success', (req, res) => res.send('<html><h1>KVN UN-WHITE ME!</h1></html>'));

app.get('/mobile/redirect/auth/:provider', function(req, res) {

  let provider = req.params.provider;

  if (!req.session.device || !req.session.device.uuid)
    req.session.device = {};

  if (provider !== 'local')
    provider = 'auth/' + provider;

  req.session.device.uuid = req.query.uuid;
  req.session.device.deviceType = req.query.deviceType;

  res.redirect('/' + provider);

});

app.start = function() {
  return app.listen(function() {
    app.emit('started');
    let baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      let explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

if (require.main === module)
  app.start();