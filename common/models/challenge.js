'use strict';

const Promise = require('bluebird');
const Constants = require('../constants');
const app = require('../../server/server');
const emojis = require('../../config/emojis.json');
const pn = require('../../config/push-notifications.json');
const ChallengeService = require('../../server/services/challenge');

const _ = app._ramen.lodash;

const identityService = app._ramen.identityService;
/* eslint-disable no-param-reassign */
function getFilteredIdentities(identities) {
  identities.forEach((identity) => {
    delete identity.id;
    delete identity._id;
    delete identity.authScheme;
    delete identity.created;
    delete identity.credentials;
    delete identity.modified;
    delete identity.userId;

    if (identity.profile) {
      delete identity.profile.id;
      delete identity.profile.provider;
      delete identity.profile._raw;
      delete identity.profile._json;
    }
  });

  return identities;
}
/* eslint-enable no-param-reassign */

function setIdentity(rOrD) {
  return new Promise((resolve, reject) => {
    if (rOrD.identities) {
      Object.assign(rOrD, { identities: getFilteredIdentities(rOrD.identities) });
      resolve();
    } else {
      identityService.getByUserId(rOrD.userId)
      .then((data) => {
        Object.assign(rOrD, { identities: getFilteredIdentities(data) });
        resolve();
      })
      .catch(err => reject(err));
    }
  });
}

function sortChallenges(challenges) {
  const results = {};

  challenges.forEach((challenge) => {
    if (!results[challenge.status]) {
      results[challenge.status] = [];
    }

    _.attempt(() => results[challenge.status].push(challenge));
  });

  return results;
}

function getChallengeWinner(challenge) {
  let winner = Constants.CHALLENGE_WINNER_TIED;

  const rScore = challenge.challenger.score;
  const dScore = challenge.challenged.score;

  if (rScore > dScore) {
    winner = challenge.challenger.userId;
  } else if (dScore > rScore) {
    winner = challenge.challenged.userId;
  }

  return winner;
}

module.exports = function challengeModelExtensions(Challenge) {
  const challengeService = app._ramen.challengeService = new ChallengeService({ model: Challenge });
  let userService;

  app.on('booted', () => {
    userService = app._ramen.userService;
  });

  Challenge.observe('before save', (ctx, next) => {
    const challenge = ctx.currentInstance || ctx.instance || ctx.ctx.data;

    challenge.modified = new Date();

    _.attempt(() => { challenge.userId = null; });

    if (!_.isNil(challenge.challenger.score) && !_.isNil(challenge.challenged.score) &&
      (challenge.status !== 'finished' || _.isNil(challenge.winner))) {
      challenge.status = 'finished';
      challenge.winner = getChallengeWinner(challenge);
    }

    setIdentity(challenge.challenger)
      .then(() => setIdentity(challenge.challenged))
      .then(() => next())
      .catch(err => next(err));
  });

  Challenge.observe('after save', (ctx, next) => {
    challengeService.clearCacheById(ctx.instance.__data.challenger.userId)
      .catch(err => console.error(err));
    challengeService.clearCacheById(ctx.instance.__data.challenged.userId)
      .catch(err => console.error(err));
    next();
  });

  Challenge.beforeRemote('create', (ctx, challenge, next) => {
    const challenger = {};
    const challenged = {};

    challenger.userId = ctx.req.accessToken.userId.toString();
    challenged.userId = ctx.req.body.userId;

    Object.assign(ctx.req.body, { challenger });
    Object.assign(ctx.req.body, { challenged });

    if (process.env.NODE_ENV === 'production') {
      Challenge.find({ where: {
        and: [
          { status: { $ne: 'finished' } },
          { status: { $ne: 'declined' } },
          { or: [
            { 'challenger.userId': ctx.req.body.challenger.userId,
              'challenged.userId': ctx.req.body.challenged.userId },
            { 'challenged.userId': ctx.req.body.challenger.userId,
              'challenger.userId': ctx.req.body.challenged.userId },
          ] },
        ],
      } }, (err, result) => {
        if (err) return next(err);

        if (result) {
          const unfinishedErr = new Error('These users have an unfinished challenge');
          unfinishedErr.status = 403;
          return next(unfinishedErr);
        }

        return next();
      });
    }

    setIdentity(ctx.req.body.challenger)
      .then(() => setIdentity(ctx.req.body.challenged))
      .then(() => next())
      .catch(err => next(err));
  });

  Challenge.afterRemote('create', (ctx, challenge, next) => {
    const userId = ctx.req.accessToken.userId.toString();

    if (!userId) {
      next(new Error('Could not find accessToken.userId in request'));
    } else {
      app.models.user.findById(userId, (err, model) => {
        if (err) {
          console.error(err);
        } else {
          app.models.notification.notify(challenge.challenged.userId,
            {
              challenge,
              alert: { title: `${model.firstName} Challenges You! ${emojis.bowl}`, body: 'To A Nooduel!' },
              actions: [
                pn.actions.acceptChallenge,
                pn.actions.declineChallenge,
                pn.actions.viewChallenges,
              ],
            }
          );
        }
      });
    }
    next();
  });


  Challenge.beforeRemote('prototype.updateAttributes', (ctx, unused, next) => {
    const userId = ctx.req.accessToken.userId.toString();

    const challengeId = ctx.req.params.id;
    const score = ctx.req.body.score || ctx.args.data.score;
    const ramenId = ctx.req.body.ramenId || ctx.args.data.ramenId;
    const status = ctx.req.body.status || ctx.args.data.status;

    const reqErr = new Error();

    Challenge.findById(challengeId, (err, challenge = {}) => {
      if (err) {
        reqErr.status = 500;
        reqErr.message = `Exception occurred while finding challenge: ${err}`;
      }

      if (challenge.hidden !== ctx.req.body.hidden) {
        return next();
      }

      if (_.isEmpty(challenge)) {
        reqErr.status = 404;
        reqErr.message = `Failed to find challenge with id ${challengeId}`;
      }

      if (challenge.status === 'finished') {
        reqErr.status = 403;
        reqErr.message = 'A finished challenge cannot be updated.';
      }

      const player = challenge.challenger.userId === userId ?
        challenge.challenger : challenge.challenged;

      if (!player) {
        reqErr.status = 404;
        reqErr.message = 'Could not find the player that submitted this update.';
      }

      if (!_.isNil(player.score)) {
        reqErr.status = 403;
        reqErr.message = 'This player has already played in this challenge.';
      }

      if (!_.isEmpty(reqErr.message)) {
        return next(reqErr);
      }

      if (!_.isEmpty(ramenId)) {
        Object.assign(challenge, { ramenId });
      }

      player.score = score;

      if (score !== null && typeof score === 'number') {
        app.models.score.findOrCreate({
          where: { challengeId, userId } },
          { challengeId, userId, score },
          (scoreErr) => { if (err) console.error(scoreErr); }
        );
      }

      const rScore = challenge.challenger.score;
      const dScore = challenge.challenged.score;

      let cStatus = challenge.status;

      if (status) {
        cStatus = status;
      } else if (!_.isNil(rScore) && !_.isNil(dScore)) {
        cStatus = Constants.CHALLENGE_STATUS_FINISHED;
      } else if (challenge.status === 'accepted' &&
        (!_.isNil(rScore) || !_.isNil(dScore))) {
        cStatus = Constants.CHALLENGE_STATUS_STARTED;
      }

      Object.assign(challenge, { status: cStatus });

      Object.assign(ctx.req, { body: challenge });
      Object.assign(ctx.args, { data: challenge });


      return next();
    });
  });

  Challenge.afterRemote('prototype.updateAttributes', (ctx, challenge, next) => {
    try {
      if (challenge.hidden || challenge.status === Constants.CHALLENGE_STATUS_DECLINED) {
        return next();
      }

      const userId = ctx.req.accessToken.userId.toString();

      const challengerUserId = challenge.challenger.userId;
      const challengedUserId = challenge.challenged.userId;

      const user = challengerUserId === userId ? challenge.challenger : challenge.challenged;
      const opponent = challengerUserId === userId ? challenge.challenged : challenge.challenger;

      userService.getByUserId(user.userId).then((userModel) => {
        const userName = userModel.firstName;

        userService.getByUserId(opponent.userId).then((opponentModel) => {
          const opponentName = opponentModel.firstName;

          const cNotif = {
            challenge,
            actions: [pn.actions.viewChallenges],
          };

          if (challenge.status === 'finished' && challenge.winner) {
            cNotif.alert = { title: `Nooduel Completed ${emojis.trophy}` };
            cNotif.actions.unshift(pn.actions.challengeRematch);

            const userNotif = JSON.parse(JSON.stringify(cNotif));
            const opponentNotif = JSON.parse(JSON.stringify(cNotif));

            let userAction = Constants.CHALLENGE_STATUS_DISPLAY_TIED;
            let opponentAction = Constants.CHALLENGE_STATUS_DISPLAY_TIED;

            if (challenge.winner === user.userId) {
              userAction = Constants.CHALLENGE_STATUS_DISPLAY_BEAT;
              opponentAction = Constants.CHALLENGE_STATUS_DISPLAY_LOST;
            } else if (challenge.winner === opponent.userId) {
              opponentAction = Constants.CHALLENGE_STATUS_DISPLAY_BEAT;
              userAction = Constants.CHALLENGE_STATUS_DISPLAY_LOST;
            }

            userNotif.alert.body = `You ${userAction} ${opponentName} ${user.score} to ${opponent.score}`;
            opponentNotif.alert.body = `You ${opponentAction} ${userName} ${opponent.score} to ${user.score}`;

            app.models.notification.notify(user.userId, userNotif);
            app.models.notification.notify(opponent.userId, opponentNotif);
          } else if (challenge.status === 'declined' || challenge.status === 'accepted') {
            const action = _.capitalize(challenge.status);
            let emoji = emojis.thumbs.up;

            if (challenge.status === 'accepted' && _.isNil(user.score)) {
              cNotif.actions.unshift(pn.actions.playChallenge);
            } else if (challenge.status === 'declined') {
              emoji = emojis.thumbs.down;
              cNotif.actions.unshift(pn.actions.viewChallenge);
            }

            const dName = opponent.userId === challengedUserId ? opponentName : userName;

            cNotif.alert = { title: `Nooduel ${action} ${emoji}`, body: `${dName} Has ${action} Your Duel` };

            app.models.notification.notify(challengerUserId, cNotif);
          }
        }).catch((err) => { throw err; });
      }).catch(err => console.error(err));
    } catch (err) {
      console.error(err);
    }

    return next();
  });

  const sort = (userId, cb = () => null) => {
    challengeService.getByUserId(userId)
      .then(challenges => cb(null, sortChallenges(challenges)))
      .catch((err) => {
        console.error(err);
        cb(err, null);
      });
  };

  Object.assign(Challenge, { sort });

  Challenge.remoteMethod(
    'sort',
    {
      description: "Find all of a user's challenges and return them sorted by status.",
      http: {
        verb: 'get',
        status: 200,
        path: '/sort/:userId/',
      },
      accepts: [
        {
          description: "The id of the user you're querying for",
          arg: 'userId',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
      ],
      returns: {
        description: "Returns an object with 'new', 'accepted', 'declined', 'started', and 'finished' properties.  The 'finished' property contains an array of the user's finished challenges.  The 'open' property contains an array of the user's unfinished challenges.",
        type: 'object',
        root: true,
        required: true,
      },
    }
  );
};
