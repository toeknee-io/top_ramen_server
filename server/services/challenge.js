'use strict';

const TopRamenService = require('./base-service');

class ChallengeService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'challenges' });
  }

  getByUserId(userId) {
    return new this.Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${userId}`;
      const memcached = this.getMemcachedClient();

      memcached.get(CACHE_KEY, (err, data) => {
        if (err) {
          reject(err);
        } else if (data) {
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          this.model.find({ where: { or: [{ 'challenger.userId': userId }, { 'challenged.userId': userId }] } }, (findErr, challenges) => {
            if (findErr) {
              reject(findErr);
            } else {
              resolve(challenges);
              this.setCacheById(userId, challenges).catch(cacheErr => console.error(cacheErr));
            }
          });
        }
      });
    });
  }

}

module.exports = ChallengeService;
