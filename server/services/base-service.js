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
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${id}`;
      memcached.get(CACHE_KEY, (err, data) => {
        if (err) console.error(err);
        if (data) {
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          this.model.findById(id, (findErr, model) => {
            if (findErr) {
              reject(findErr);
            } else {
              const result = model.__data || model;
              resolve(result);
              this.setCacheById(id, result).catch(cacheErr => console.error(cacheErr));
            }
          });
        }
      });
    });
  }

  setCacheById(id, data) {
    return new Promise((resolve, reject) => {
      const CACHE_KEY = `${this.nameSpace}:${id}`;
      if (_.isNil(data) || (_.isArray(data) && _.isNil(data[0]))) {
        reject(new Error(`${CACHE_KEY} cannot be cached with this null or undefined data object: %j`, data));
      } else {
        memcached.set(CACHE_KEY, data, this.cacheExpiration, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
            console.log(`set ${CACHE_KEY} into cache`);
          }
        });
      }
    });
  }

  setCacheByKey(key, data) {
    return new Promise((resolve, reject) => {
      if (_.isNil(data) || (_.isArray(data) && _.isNil(data[0]))) {
        reject(new Error(`${key} cannot be cached with this null or undefined data object: %j`, data));
      } else {
        memcached.set(key, data, this.cacheExpiration, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
            console.log(`set ${key} into cache`);
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
          resolve();
          console.log(`replaced cache for ${this.nameSpace}:${id}`);
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
