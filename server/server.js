'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const inspect = require('util').inspect;
const fork = require('child_process').fork;
const exec = require('child_process').exec;

const loopback = require('loopback');
const boot = require('loopback-boot');
const loopbackPassport = require('loopback-component-passport');

const app = module.exports = require('./lib/init-ramen')(loopback());

const PassportConfigurator = loopbackPassport.PassportConfigurator;
const passportConfigurator = new PassportConfigurator(app);

const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');

const Constants = require('../common/constants');

app.set('views', path.join(__dirname, '..', 'client', 'views'));
app.set('view engine', 'pug');

boot(app, __dirname, (err) => { if (err) console.error(err.stack); });

app.on('booted', () => {
  // access token is only available after boot
  app.middleware('auth', loopback.token({ model: app.models.accessToken, currentUserLiteral: 'me' }));
});

app.use((req, res, next) => {
  console.log(`request ${req.method} ${req.originalUrl}`);
  req._ramen = {};
  next();
});

// setup middleware for request parsing and auth/session handling
app.middleware('parse', bodyParser.json());
app.middleware('parse', bodyParser.urlencoded({ extended: true }));

app.middleware('session:before', cookieParser(app.get('cookieSecret')));
app.middleware('session', expressSession({ secret: app.get('sessionSecret'), saveUninitialized: true, resave: true }));

require(path.join(__dirname, 'lib', './init-passport'))(app, passportConfigurator);

app.get('/api/constants', (req, res) => {
  res.status(200).json(Constants);
});

app.get('/signup', (req, res) => res.render('pages/signup'));

app.get('/auth/account', ensureLoggedIn('/login'), (req, res) => {
  if (req.session.device && req.session.device.uuid &&
    req.session.passport && req.session.passport.user) {
    app.models.device.findOrCreate({ where: { deviceId: req.session.device.uuid, userId: req.session.passport.user } },
      { deviceId: req.session.device.uuid, deviceType: req.session.device.deviceType, userId: req.session.passport.user },
      (err, device, created) => {
        if (err || !device) {
          console.error(err);
          return res.status(500).json({ error: { name: 'AuthError', status: 500, message: `Failed to findOrCreate device record because ${err}` } });
        }

        if (created && device.userId) {
          console.log(`created and logged in new user: userId [${device.userId}] deviceType [${device.deviceType}] deviceId [${device.deviceId}] `);
        }

        app.models.user.findById(req.session.passport.user, (err, user) => {
          req.login(user, (err) => {
            if (err) {
              console.error(err);
              return res.redirect('back');
            }

            if (device.deviceType === 'android' || device.deviceType === 'ios') {
              res.redirect(`/mobile/redirect/auth/success?token=${req.accessToken.id}&id=${req.session.passport.user}&`);
            } else {
              res.redirect('/');
            }
          });
        });
    });
  } else {
    console.error(`No device or user found in session ${inspect(req.session)}`);

    res.status(500).json({ error: { name: 'AuthError', status: 50, message: 'No device or user found in session' } });
  }
});

app.get('/local', (req, res) => {
  res.render('pages/local', {
    user: req.user,
    url: req.url,
  });
});

app.post('/signup', (req, res, next) => {
  const User = app.models.user;

  const newUser = {};

  newUser.email = req.body.email.toLowerCase();
  newUser.username = req.body.username.trim();
  newUser.password = req.body.password;

  User.create(newUser, (err, user) => {
    if (err) {
      req.flash('error', err.message);

      return res.redirect('back');
    } else {
      req.login(user, (err) => {
        if (err) {
          req.flash('error', err.message);
          return res.redirect('back');
        }
          // return res.redirect('/auth/account');
      });

      console.log('/signup email triggered');

      const options = {
        type: 'email',
        to: user.email,
        from: 'noreply@topramen.com',
        subject: 'NOOOOODLE!',
        template: path.resolve(__dirname, '../client/views/pages/loginProfiles.pug'),
        redirect: '/verified',
        user,
      };

      user.verify(options, (err, response) => {
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
          redirectToLinkText: 'Log in',
        });
      });
    }
  });
});

app.get('/login', (req, res) => res.render('pages/login'));

app.post('/api/auth/logout', (req, res) => {
  req.logout();
  res.status(200).json({ success: true });
});

app.post('/reset-password', ensureLoggedIn('/login'), (req, res, next) => {
  app.models.user.emit('resetPasswordRequest', req.user);
  next();
});

app.get('/reset-password', (req, res) => {
  app.models.user.emit('resetPasswordRequest', req.user);
  res.send('pw reset email sent');
});

app.get('/mobile/redirect/auth/success', (req, res) => res.send('<html><h1>KVN UN-WHITE ME!</h1></html>'));

app.get('/mobile/redirect/auth/:provider', (req, res) => {
  let provider = req.params.provider;

  if (!req.session.device || !req.session.device.uuid) {
    req.session.device = {};
  }

  if (provider !== 'local') {
    provider = `auth/${provider}`;
  }

  req.session.device.uuid = req.query.uuid;
  req.session.device.deviceType = req.query.deviceType;
  req.session.loginToken = req.query.token;

  res.redirect(`/${provider}`);
});

app.start = function () {
  return app.listen(() => {
    console.log('\r\nTOP RAMEN - STARTING\r\n\r\n');

    console.log(`started: server (url: ${app.get('hostName')}:${app.get('port')})`);

    let mongoPid = _.attempt(() => fs.readFileSync('/var/lib/mongodb/mongod.lock'));

    if (_.isError(mongoPid)) {
      console.log('starting: mongodb');
      exec('sudo mongod --config /etc/mongodb.conf --fork --smallfiles');
      mongoPid = _.attempt(() => fs.readFileSync('/var/lib/mongodb/mongod.lock'));
    }

    console.log(`started: mongodb (pid: ${mongoPid.toString().split('\n')[0]})`);

    fork(`${__dirname}/listeners/mongodb-oplog`);
    fork(`${__dirname}/jobs/push-challenge-unfinished`);

    app.emit('started');

    process.on('exit', () => {
      console.log('exiting: killing forked processes');
      _.attempt(() => process.kill(fs.readFileSync(app.get('mongoDbOplogPid'))));
      _.attempt(() => process.kill(fs.readFileSync(app.get('pushChallengeUnfinishedPid'))));
      console.log('\r\nTOP RAMEN - EXITED\r\n');
    });
  });
};

if (require.main === module) { app.start(); }
