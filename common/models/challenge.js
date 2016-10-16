'use strict';

const path = require('path');
const inspect = require('util').inspect;

const app = require(path.join('..', '..', 'server', 'server'));

const ChallengeService = require(path.join(__dirname, '..', '..', 'server', 'services', 'challenge'));

const Promise = app._ramen.promise;
const _ = app._ramen.lodash;

const identityService = app._ramen.identityService;

function setIdentity(rOrD) {
  return new Promise(function (resolve, reject) {
    identityService.getByUserId(rOrD.userId)
      .then(data => {
        rOrD.identities = data;
        resolve();})
      .catch(err => reject(err));
  });
}

function sortChallenges(challenges) {

  let results = {};

  results.new = [];
  results.started = [];
  results.finished = [];
  results.declined = [];

  challenges.forEach(challenge => _.attempt(() => results[challenge.status].push(challenge)));

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

    ctx.req.body.challenger = {};
    ctx.req.body.challenged = {};

    ctx.req.body.challenger.userId = ctx.req.accessToken.userId.toString();
    ctx.req.body.challenged.userId = ctx.req.body.userId;
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
    setIdentity(ctx.req.body.challenger)
      .then(body => setIdentity(ctx.req.body.challenged))
      .then(() => next())
      .catch(err => next(err));

  });

  Challenge.afterRemote('create', function(ctx, challenge, next) {

    let userId = ctx.req.accessToken.userId.toString();

    if (!userId) return next(new Error('Could not find accessToken.userId in request'));

    app.models.user.findById(userId, function(err, model) {

      if (err) {
        console.error(err);
        next(err);
      }

      app.models.notification.notify(challenge.challenged.userId,
        {
          alert: {
            title: `${model.firstName} Challenges You!`,
            body: "\uD83C\uDF72 To A Nooduel! \uD83C\uDF5C"
          },
          challenge: challenge
        }
      );

      next();

    });

  });


  Challenge.beforeRemote('prototype.updateAttributes', function(ctx, challenge, next) {

    let userId = ctx.req.accessToken.userId.toString();

    let challengeId = ctx.req.params.id;
    let score = ctx.req.body.score;
    let ramenId = ctx.req.body.ramenId;
    let status = ctx.req.body.status;

    let reqErr = new Error();

    Challenge.findById(challengeId, function(err, model) {

      if (err || !model)
        reqErr.message = `Failed to find challenge with id ${challengeId}`;

      let data = model || {};

      if (data.status === 'finished')
        reqErr.message = 'A finished challenge cannot be updated.';

      if (score) {
        app.models.score.findOrCreate({ where: { challengeId: challengeId, userId: userId } }, { challengeId: challengeId, userId: userId, score: score }, (err, score, created) => {
          if (err) console.error(err);
          if (!created) reqErr.message = 'This player has already played in this challenge.';
        });
      }

      if (reqErr.message.length) {
        reqErr.status = 403;
        delete reqErr.stack;
        return next(reqErr);
      }

      data[data.challenger.userId === userId ? 'challenger' : 'challenged'].score = score;

      let rScore = data.challenger.score;
      let dScore = data.challenged.score;

      if (ctx.req.body.status)
        data.status = ctx.req.body.status;
      else
        data.status = rScore && dScore ? 'finished' : 'started';

      app.models.user.findById(data.challenger.userId, function(err, rModel) {
        if (err) return console.error(err);
        let rName = rModel.firstName;

        app.models.user.findById(data.challenged.userId, function(err, dModel) {
          if (err) return console.error(err);
          let dName = dModel.firstName;

            if (data.status === 'finished') {

              data.winner = ( rScore > dScore ? data.challenger.userId : (rScore === dScore ? 'tied' : data.challenged.userId) );

              let title = `Nooduel Completed \uD83C\uDFC6`;

              app.models.notification.notify(data.challenger.userId,
                {
                  alert: {
                    title: title,
                    body: `You ${data.winner === 'tied' ? 'Tied' : (data.winner === data.challenger.userId ? 'Beat' : 'Lost to')} ${dName} ${rScore} to ${dScore}`
                  },
                  challenge: challenge
                }
              );
              app.models.notification.notify(data.challenged.userId,
                {
                  alert: {
                    title: title,
                    body: `You ${data.winner === 'tied' ? 'Tied' : (data.winner === data.challenged.userId ? 'Beat' : 'Lost to')} ${rName} ${dScore} to ${rScore}`
                  },
                  challenge: challenge
                }
              );

            } else if (data.status === 'declined') {

              app.models.notification.notify(data.challenger.userId,
                {
                  alert: {
                    title: 'Nooduel Declined \uF09F\u918E',
                    body: ` ${dName} Has Declined Your Duel`
                  },
                  challenge: challenge
                }
              );

            } else {
              data.winner = null;
            }

        });

      });

      if (!_.isEmpty(ramenId))
        data.ramenId = ramenId;

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
        description: "Returns an object with 'open', 'finished', and 'declined' properties.  The 'finished' property contains an array of the user's finished challenges.  The 'open' property contains an array of the user's unfinished challenges.",
        type: { "finished": [ Challenge ], "open": [ Challenge ], "declined": [ Challenge ] },
        root: true
      }
    }
  );

};
