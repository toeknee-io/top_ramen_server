'use strict';

// const _ = require('lodash');
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

  const social = (req, cb) => {
    const results = {};
    app._ramen.identityService.getByUserId(req.accessToken.userId.toString())
    .then((identities = []) => {
      identities.forEach((identity) => {
        if (identity.provider === 'facebook') {
          const token = identity.credentials.accessToken;
          const facebookFriendsUrl = `https://graph.facebook.com/me/friends?access_token=${token}`;
          rp.get(facebookFriendsUrl)
          .then(({ data: friends }, resFriends = []) => {
            results.facebook = {};
            results.facebook.userIdentityid = identity.id;
            results.facebook.externalId = identity.externalId;
            results.facebook.displayName = identity.profile.displayName;
            results.facebook.picture = `https://graph.facebook.com/${identity.externalId}/picture?type=large`;
            results.facebook.friends = resFriends;
            if (friends.length > 0) {
              let counter = 0;
              friends.forEach((friend) => {
                app._ramen.identityService.getByExternalId(friend.id)
                .then(friendIdentites => resFriends.push(friendIdentites[0]))
                .catch(err => cb(err, null))
                .finally(() => {
                  counter += 1;
                  if (counter === friends.length) {
                    cb(null, results);
                  }
                });
              });
            } else {
              cb(null, results);
            }
          }).catch(err => console.error('could not get friends from facebook because: %j', err));
        }
      });
    }).catch(err => console.error(err));
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
