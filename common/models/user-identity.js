'use strict';

const path = require('path');

const app = require(path.join('..', '..', 'server', 'server'));

const IdentityService = require(path.join(__dirname, '..', '..', 'server', 'services', 'identity'));

module.exports = function(UserIdentity) {

  const identityService = app._ramen.identityService = new IdentityService({ model: UserIdentity });

  UserIdentity.observe('after save', function(ctx, next) {

    let userId = ctx.instance.__data.userId;

    app.models.user.findById(userId, function(err, model) {

      if (err || !model) return next(err);

      model.firstName = ctx.instance.__data.profile.name.givenName || ctx.instance.__data.profile.displayName.split(/\s/)[0];
      model.lastName = ctx.instance.__data.profile.name.familyName || ctx.instance.__data.profile.displayName.split(/\s/)[1];

      app.models.user.upsert(model, function(err) {
        if (err) next(err);
        else next();
      });

    });

    if (ctx.instance) {
      identityService.getByUserId(ctx.instance.userId)
        .then(function(identities) {
          if (!Array.isArray(identities)) identities = [ identities ];
          identityService.setCacheById(ctx.instance.userId, identities).catch(err => console.error(err));})
        .catch(err => console.error(err));
    }

  });

};
