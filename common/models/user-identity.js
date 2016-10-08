'use strict';

let app = require('../../server/server');

module.exports = function(UserIdentity) {

  UserIdentity.observe('after save', function(ctx, next) {

    let userId = ctx.instance.__data.userId;

    app.models.user.findById(userId, function(err, model) {
      if (err) return next(err);

      model.firstName = ctx.instance.__data.profile.name.givenName;
      model.lastName = ctx.instance.__data.profile.name.familyName;

      app.models.user.upsert(model, function(err, model) {
        if (err) return next(err);
        return next();
      });

    });

  });

};
