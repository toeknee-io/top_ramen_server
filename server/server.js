'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var app = module.exports = loopback();

var loopbackPassport = require('loopback-component-passport');
var PassportConfigurator = loopbackPassport.PassportConfigurator;
var passportConfigurator = new PassportConfigurator(app);

var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
var flash = require('express-flash');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');

var path = require('path');

app.set('views', path.join(__dirname, '..', 'client', 'views'));
app.set('view engine', 'pug');

const bootOptions = { "appRootDir": __dirname,
                "bootScripts" : [ path.join(__dirname, 'boot', 'init.js') ] };

boot(app, bootOptions, function(err) {
  if (err) throw err;
});

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

// providers/passport config
var config = {};
try {
  config = require('/home/ubuntu/top_ramen/providers.json');
} catch (err) {
    logger.error(err);
    process.exit(1);
}

passportConfigurator.init();

// see passport errors
app.use(flash());

passportConfigurator.init();

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

app.get('/signup', function(req, res) {
  res.render('pages/signup');
});

app.get('/auth/account', ensureLoggedIn('/login'), function(req, res, next) {
  res.render('pages/loginProfiles', {
    user: req.user,
    url: req.url,
  });
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