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

      if (data.status === 'finished') {

        data.winner = ( rScore > dScore ? data.challenger.userId : (rScore === dScore ? 'tied' : data.challenged.userId) );

        app.models.userIdentity.findOne( { where: { userId: data.challenger.userId } }, function(err, rModel) {
          if (err) console.error(err);
          let rName = rModel.profile.displayName.split(/\s/)[0];

          app.models.userIdentity.findOne( { where: { userId: data.challenged.userId } }, function(err, dModel) {
            let dName = dModel.profile.displayName.split(/\s/)[0];
            let title = `\uD83C\uDFC6 Noodeul Completed \uD83C\uDFC6`
            app.models.notification.notify(data.challenger.userId,
              {
                alert: {
                  title: title,
                  body: `You ${data.winner === 'tied' ? 'Tied' : (data.winner === data.challenger.userId ? 'Beat' : 'Lost to')} ${dName} ${rScore} to ${dScore}`
                }
              }
            );
            app.models.notification.notify(data.challenged.userId,
              {
                alert: {
                  title: title,
                  body: `You ${data.winner === 'tied' ? 'Tied' : (data.winner === data.challenged.userId ? 'Beat' : 'Lost to')} ${rName} ${dScore} to ${rScore}`
                }
              }
            );
          });

        });

      } else {
        data.winner = null;
      }

      ctx.args.data = data;

      next();

    });

  });

  Challenge.beforeRemote('create', function(ctx, unused, next) {

    let rUserId = ctx.req.body.challenger.userId;
    let dUserId = ctx.req.body.challenged.userId;

    Challenge.find({ where: { and: [ { status: { neq: "finished" } }, { "challenger.userId": rUserId }, { "challenged.userId": dUserId } ] } }, function(err, result) {
      if (err) return next(err);
      if (result) {
        err = new Error("These users have an unfinished challenge")
        err.status = 403;
        delete err.stack;
        return next(err);
      }
      else return next();
    });

  });

  Challenge.afterRemote('create', function(ctx, challenge, next) {

    let userId = challenge.__data.challenger.userId;

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
