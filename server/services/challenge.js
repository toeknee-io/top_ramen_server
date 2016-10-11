'use strict';

const path = require('path');
const TopRamenService = require(path.join(__dirname, 'base-service'));

class ChallengeService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'challenges'});
  }

  getByUserId(userId) {
    return new this.Promise((resolve, reject) => {

      let CACHE_KEY = `${this.nameSpace}:${userId}`;
      let memcached = this.getMemcachedClient();

      memcached.get(CACHE_KEY, (err, data) => {
        if (err) reject(err);
        if (data) {
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          this.model.find({ where: { or: [ { "challenger.userId": userId }, { 'challenged.userId': userId } ] } }, (err, challenges) => {
            if (err) return reject(err);
            if (challenges.__data) challenges = challenges.__data;
            this.setCacheById(userId, challenges).catch(err => console.error(err));
            resolve(challenges);
          });
        }

      });

    });
  }

}

module.exports = ChallengeService;