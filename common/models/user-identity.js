'use strict';

const _ = require('lodash');
const rp = require('request-promise');
const app = require('../../server/server');

const IdentityService = require('../../server/services/identity');

module.exports = function userIdentityModelExtensions(UserIdentity) {
  const identityService = app._ramen.identityService = new IdentityService({ model: UserIdentity });

  UserIdentity.observe('before save', (ctx, next) => {
    const userIdentity = ctx.data || ctx.instance || ctx.currentInstance;
    if (userIdentity.profile.provider === 'facebook') {
      if (_.isEmpty(userIdentity.profile.email) ||
        _.isEmpty(userIdentity.profile.name) ||
        _.isEmpty(userIdentity.profile.link)) {
        const url = `https://graph.facebook.com/me?fields=email,link,first_name,last_name&access_token=${userIdentity.credentials.accessToken}`;
        rp({ url, json: true, timeout: 2500 }).then((res) => {
          if (typeof userIdentity.profile.name !== 'object') {
            userIdentity.profile.name = {};
          }
          const name = userIdentity.profile.name;
          name.givenName = res.first_name || name.givenName || '';
          name.familyName = res.last_name || name.familyName || '';
          userIdentity.profile.link = res.link || userIdentity.profile.link || '';
          userIdentity.profile.email = res.email || userIdentity.profile.email || '';
          next();
        })
        .catch(err => next(err));
      } else {
        next();
      }
    } else {
      next();
    }
  });

  UserIdentity.observe('after save', (ctx, next) => {
    const userIdentity = ctx.instance;
    const userId = userIdentity.userId;

    app.models.user.findById(userId, (err, model) => {
      if (err || !model) {
        next(err);
      } else {
        Object.assign(model, {
          firstName: ctx.instance.__data.profile.name.givenName ||
            ctx.instance.__data.profile.displayName.split(/\s/)[0],
          lastName: ctx.instance.__data.profile.name.familyName ||
            ctx.instance.__data.profile.displayName.split(/\s/)[1],
          email: ctx.instance.__data.profile.email,
          username: ctx.instance.__data.profile.email,
        });
        app.models.user.upsert(model, (upsertErr) => {
          if (upsertErr) next(upsertErr);
          else next();
        });
      }
    });

    if (ctx.instance) {
      identityService.getByUserId(ctx.instance.userId)
        .then((identities) => {
          const result = _.castArray(identities);
          identityService.setCacheById(ctx.instance.userId, result)
            .catch(err => console.error(err));
        })
        .catch(err => console.error(err));
    }
  });
};
