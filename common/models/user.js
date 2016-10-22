'use strict';

const path = require('path');
const Memcached = require('memcached');
const config = require('../../server/config.json');
const rp = require('request-promise').defaults({ json: true, timeout: 5000 });

const app = require(path.join('..', '..', 'server', 'server'));

const UserService = require(path.join(__dirname, '..', '..', 'server', 'services', 'user'));

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

module.exports = function(User) {

  const userService = app._ramen.userService = new UserService({ model: User });

  User.beforeRemote('**', function(ctx, user, next) {

    if (ctx.methodString === 'user.prototype.__get__identities') {
      app._ramen.identityService.getByUserId(ctx.req.params.id)
        .then(identities => ctx.res.json(identities))
        .catch(err => next(err));
    } else {
      next();
    }

  });

  User.observe('before save', function (ctx, next) {
    let user = ctx.instance || ctx.data;
    user.modified = new Date();
    next();
  });

  User.observe('after save', function(ctx, next) {
    userService.setCacheById(ctx.instance.id, ctx.instance).catch(err => console.error(err));
    next();
  });

  User.observe('before delete', function (ctx, next) {
    console.log('no user deletes allowed at this time');
    next(new Error('No user deletes allowed at this time'));
  });

  //send password reset link when requested
  User.on('resetPasswordRequest', function(info) {
    var url = `http://${config.host}:${config.port}/reset-password`;
    var html = `Click <a href="${url}?access_token=${info.accessToken.id}">here</a> to reset your password`;

    User.app.models.Email.send({
      to: info.email,
      from: info.email,
      subject: 'Password reset',
      html: html
    }, function(err) {
      if (err) return console.error('Error sending password reset email');
      console.log('sending password reset email to:', info.email);
    });
  });

  User.social = function(req, cb) {

    if (!cb) cb = () => null;

    let results = {};

    app._ramen.identityService.getByUserId(req.accessToken.userId.toString()).then(identities => {

      if (!Array.isArray(identities)) identities = [ identities ];

      identities.forEach(function(identity) {

        if (identity.provider === 'facebook') {

          let token = identity.credentials.accessToken;

          rp.get(`https://graph.facebook.com/me/friends?access_token=${token}`)
            .then((res) => {
              results.facebook = {};
              results.facebook.externalId = identity.externalId;
              results.facebook.displayName = identity.profile.displayName;
              results.facebook.picture = `https://graph.facebook.com/${identity.externalId}/picture?type=large`;
              results.facebook.friends = res.data;
              cb(null, results); })
            .catch(err => cb(err));
        }

      });

    });

  };

  User.remoteMethod(
    'social',
    {
      description: "Find all of the user's Top Ramen friends.",
      http: {
        verb: "get",
        status: 200,
        path: "/social/:id/"
      },
      accepts: [
        {
          arg: 'req',
          type: 'object',
          http: {
            source: 'req'
          },
          required: true
        }
      ],
      returns: {
        type: Object,
        root: true
      }
    }
  );

};
