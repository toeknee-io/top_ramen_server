'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const Memcached = require('memcached');
const config = require('../../server/config.json');
const rp = require('request-promise').defaults({ json: true, timeout: 5000 });

const app = require('../../server/server');

const UserService = require('../../server/services/user');

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

module.exports = function userModelExtensions(User) {
  const userService = app._ramen.userService = new UserService({ model: User });
  let identityService = app._ramen.identityService;

  app.emit('service:added', { ns: 'user', service: userService });

  User.beforeRemote('**', (ctx, user, next) => {
    if (ctx.methodString === 'user.prototype.__get__identities') {
      app._ramen.identityService.getByUserId(ctx.req.params.id)
        .then(identities => ctx.res.json(identities))
        .catch(err => next(err));
    } else {
      next();
    }
  });

  User.observe('before save', (ctx, next) => {
    const user = ctx.instance || ctx.data;
    if (_.isNil(identityService)) {
      identityService = app._ramen.identityService;
    }

    _.attempt(() => identityService.clearCacheById(user.id.toString()));
    user.modified = new Date();

    next();
  });

  User.observe('after save', (ctx, next) => {
    userService.setCacheById(ctx.instance.id, ctx.instance).catch(err => console.error(err));
    next();
  });

  User.observe('before delete', (ctx, next) => {
    console.log('no user deletes allowed at this time');
    next(new Error('No user deletes allowed at this time'));
  });

  // send password reset link when requested
  User.on('resetPasswordRequest', (info) => {
    const url = `http://${config.host}:${config.port}/reset-password`;
    const html = `Click <a href="${url}?access_token=${info.accessToken.id}">here</a> to reset your password`;

    User.app.models.Email.send({
      to: info.email,
      from: info.email,
      subject: 'Password reset',
      html,
    }, (err) => {
      if (err) console.error('Error sending password reset email');
      else console.log('sending password reset email to:', info.email);
    });
  });

  const social = (req, cb, results = {}) => {
    const userId = req.accessToken.userId.toString();

    if (!identityService) {
      identityService = app._ramen.identityService;
    }

    identityService.getByUserId(userId).then((identities = []) => {
      identities.forEach((identity) => {
        if (identity.provider === 'facebook') {
          const token = identity.credentials.accessToken;
          const facebookFriendsUrl = `https://graph.facebook.com/me/friends?access_token=${token}`;
          rp.get(facebookFriendsUrl)
          .then(({ data: friends }) => {
            const facebook = {};
            facebook.userIdentityid = identity.id;
            facebook.externalId = identity.externalId;
            facebook.displayName = identity.profile.displayName;
            facebook.picture = `https://graph.facebook.com/${identity.externalId}/picture?type=large`;
            Object.assign(results, { facebook });
            if (friends.length > 0) {
              Promise.map(friends, friend => identityService.getByExternalId(friend.id))
              .then((friendIdentites) => {
                facebook.friends = _.flatten(friendIdentites);
                cb(null, results);
              }).catch(err => cb(err, null));
            } else {
              cb(null, results);
            }
          }).catch(err => cb(err, null));
        }
      });
    }).catch(err => cb(err, null));
  };

  Object.assign(User, { social });

  User.remoteMethod(
    'social',
    {
      description: "Find all of the user's Top Ramen friends.",
      http: {
        verb: 'get',
        status: 200,
        path: '/social',
      },
      accepts: [
        {
          arg: 'req',
          type: 'object',
          http: {
            source: 'req',
          },
          required: true,
        },
      ],
      returns: {
        type: Object,
        root: true,
      },
    }
  );
};
