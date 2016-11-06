'use strict';

const _ = require('lodash');
const TopRamenService = require('./base-service');

class ChallengeService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'challenges' });
  }

  getByUserId(userId) {
    return new this.Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${userId}`;
      this.getCache(CACHE_KEY).then((data) => {
        if (data) {
          console.info(`got ${CACHE_KEY} from cache`);
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          const query = { where: {
            or: [{ 'challenger.userId': userId },
            { 'challenged.userId': userId }] },
          };
          this.model.find(query, (err, challenges) => {
            if (err) {
              reject(err);
            } else {
              resolve(challenges);
              if (!_.isNil(challenges)) {
                this.setCacheById(userId, challenges).catch(cacheErr => console.error(cacheErr));
              }
            }
          });
        }
      }).catch(err => reject(err));
    });
  }

}

module.exports = ChallengeService;
