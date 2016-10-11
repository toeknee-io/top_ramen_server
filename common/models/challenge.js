'use strict';

const path = require('path');

const app = require(path.join('..', '..', 'server', 'server'));

const ChallengeService = require(path.join(__dirname, '..', '..', 'server', 'services', 'challenge'));

const mc = app._ramen.memcached;
const Promise = app._ramen.promise;
const _ = app._ramen.lodash;

const identityService = app._ramen.identityService;

function setIdentity(body, userId, rOrD) {
  return new Promise(function (resolve, reject) {
    identityService.getByUserId(userId)
      .then(data => {
        body[rOrD].identities = data;
        resolve();})
      .catch(err => reject(err));
  });
}

function sortChallenges(challenges) {

  let results = {};

  results.finished = _.remove(challenges, function(challenge) {

    let status = '';

    if (challenge.__data && challenge.__data.status)
      status = challenge.__data.status;
    else
      status = challenge.status;

    return status === 'finished';

  });

  results.open = challenges;

  return results;

}

module.exports = function(Challenge) {

  const challengeService = app._ramen.challengeService = new ChallengeService({ model: Challenge });

  Challenge.observe('after save', function(ctx, next) {

    challengeService.clearCacheById(ctx.instance.__data.challenger.userId).catch(err => console.error(err));
    challengeService.clearCacheById(ctx.instance.__data.challenged.userId).catch(err => console.error(err));

    next();

  });

  Challenge.beforeRemote('create', function(ctx, challenge, next) {

    let rUserId = ctx.req.body.challenger.userId;
    let dUserId = ctx.req.body.challenged.userId;
    /*
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
    */
    setIdentity(ctx.req.body, rUserId, 'challenger')
      .then(body => setIdentity(ctx.req.body, dUserId, 'challenged'))
      .then(() => next())
      .catch(err => next(err));

  });

  Challenge.afterRemote('create', function(ctx, challenge, next) {

    let userId = challenge.__data.challenger.userId;

    if (!userId) return next(new Error('Could not find challenged.userId in request'));

    app.models.user.findById(userId, function(err, model) {

      if (err) {
        console.error(err);
        next(err);
      }

      app.models.notification.notify(challenge.challenged.userId,
        { alert: { title: `${model.firstName} Challenges You!`, body: "\uD83C\uDF72 To A Nooduel! \uD83C\uDF5C" } }
      );

      next();

    });

  });


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
        err.status = 403;
        delete err.stack;
        next(err);
      }

      let player = data.challenger.userId === userId ? 'challenger' : 'challenged';

      if (!data[player].score) {
        data[player].score = score;
      } else {
        err = new Error('This player has already played in this challenge.');
        err.status = 403;
        delete err.stack;
        next(err);
      }

      let rScore = data.challenger.score;
      let dScore = data.challenged.score;

      data.status = rScore && dScore ? 'finished' : 'started';

      if (data.status === 'finished') {

        data.winner = ( rScore > dScore ? data.challenger.userId : (rScore === dScore ? 'tied' : data.challenged.userId) );

        app.models.user.findById(data.challenger.userId, function(err, rModel) {
          if (err) return console.error(err);
          let rName = rModel.firstName;

          app.models.user.findById(data.challenged.userId, function(err, dModel) {
            if (err) return console.error(err);
            let dName = dModel.firstName;
            let title = `\uD83C\uDFC6 Nooduel Completed \uD83C\uDFC6`
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

  Challenge.sort = function(userId, cb) {

    if (!cb) cb = () => null

    challengeService.getByUserId(userId)
      .then(challenges => cb(null, sortChallenges(challenges)))
      .catch(err => {
        console.error(err);
        cb(err, null);
      });

  };

  Challenge.remoteMethod(
    'sort',
    {
      description: "Find all of a user's challenges and return them sorted by status.",
      http: {
        verb: "get",
        status: 200,
        path: "/sort/:userId/"
      },
      accepts: [
        {
          description: "The id of the user you're querying for",
          arg: 'userId',
          type: 'string',
          http: {
            source: 'path'
          },
          required: true
        }
      ],
      returns: {
        description: "Returns an object with 'finished' and 'open' properties.  The 'finished' property contains an array of the user's finished challenges.  The 'open' property contains an array of the user's unfinished challenges.",
        type: { "finished": [ Challenge ], "open": [ Challenge ] },
        root: true
      }
    }
  );

};
