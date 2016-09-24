'use strict';

let app = require('../../server/server');

module.exports = function(Challenge) {

  Challenge.beforeRemote('prototype.updateAttributes', function(ctx, challenge, next) {

    let challengeId = ctx.req.params.id;
    let userId = ctx.args.data.userId;
    let score = ctx.args.data.score;

    if (!challengeId) return next(new Error('Could not find challengeId in request.'));

    Challenge.findById(challengeId, function(err, model) {

      if (err) {
        console.error(err);
        next(err);
      }

      let data = model.__data;

      if (data.status === 'finished') {
        err = new Error('A finished challenge cannot be updated.');
        err.status = 400;
        delete err.stack;
        next(err);
      }

      let player = data.challenger.userId === userId ? 'challenger' : 'challenged';

      if (!data[player].score) {
        data[player].score = score;
      } else {
        err = new Error('This player has already played in this challenge.');
        err.status = 400;
        delete err.stack;
        next(err);
      }

      let rScore = data.challenger.score;
      let dScore = data.challenged.score;

      data.status = rScore && dScore ? 'finished' : 'started';

      if (data.status === 'finished')
        data.winner = ( rScore > dScore ? data.challenger.userId : (rScore === dScore ? 'tied' : data.challenged.userId) );
      else
        data.winner = null;

      ctx.args.data = data;

      next();

    });

  });

  Challenge.afterRemote('create', function(ctx, challenge, next) {

    console.dir(challenge);
    console.dir(ctx.req);

    let userId = challenge.challenger.userId;

    if (!userId) return next(new Error('Could not find challenged.userId in request'));

    app.models.userIdentity.findOne( { where: { userId: userId } }, function(err, model) {

      if (err) {
        console.error(err);
        next(err);
      }

      let challenger = model.profile.displayName;

      app.models.notification.notify(challenge.challenged.userId,
        { alert: { title: `${challenger} Challenges You!`, body: "\uD83C\uDF72 To A Noodeul! \uD83C\uDF5C" } }
      );

      next();

    });

  });

};
