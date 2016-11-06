'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const Memcached = require('memcached');

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

const memcached = new Memcached('localhost');

class TopRamenService {

  constructor(opts) {
    if (!opts.model || !opts.nameSpace) throw new Error(`Service class instantiation missing model [${opts.model}] or nameSpace [${opts.nameSpace}]`);

    this.Promise = Promise;
    this.model = opts.model;
    this.memcached = memcached;
    this.nameSpace = opts.nameSpace;
    this.cacheExpiration = opts.maxExpiration || memcached.maxExpiration;

    this.getCache = this.Promise.promisify(this.memcached.get.bind(this.memcached));
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${id}`;
      this.getCache(CACHE_KEY).then((data) => {
        if (data) {
          console.log(`got ${CACHE_KEY} from cache`);
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          this.model.findById(id, (findErr, model) => {
            if (findErr) {
              reject(findErr);
            } else {
              const result = model.__data || model;
              resolve(result);
              if (!_.isNil(model)) {
                this.setCacheById(id, result).catch(cacheErr => console.error(cacheErr));
              }
            }
          });
        }
      }).catch(err => reject(err));
    });
  }

  setCacheById(id, data) {
    return new Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${id}`;
      if (_.isNil(data)) {
        reject(new Error(`${CACHE_KEY} cannot be cached with a null or undefined data object`));
      } else {
        memcached.set(CACHE_KEY, data, this.cacheExpiration, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`set ${CACHE_KEY} into cache`);
            resolve();
          }
        });
      }
    });
  }

  setCacheByKey(key, data) {
    return new Promise((resolve, reject) => {
      if (_.isNil(data)) {
        reject(new Error(`${key} cannot be cached with a null or undefined data object`));
      } else {
        memcached.set(key, data, this.cacheExpiration, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`set ${key} into cache`);
            resolve();
          }
        });
      }
    });
  }

  replaceCacheById(id, data) {
    return new Promise((resolve, reject) => {
      memcached.replace(`${this.nameSpace}:${id}`, data, this.cacheExpiration, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`replaced cache for ${this.nameSpace}:${id}`);
          resolve();
        }
      });
    });
  }

  clearCacheById(id) {
    return new Promise((resolve, reject) => {
      this.memcached.del(`${this.nameSpace}:${id}`, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`cleared cache for ${this.nameSpace}:${id}`);
          resolve();
        }
      });
    });
  }

  clearCacheByKey(key) {
    return new Promise((resolve, reject) => {
      this.memcached.del(key, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`cleared cache for ${key}`);
          resolve();
        }
      });
    });
  }

  getMemcachedClient() {
    return this.memcached;
  }

}

module.exports = TopRamenService;
