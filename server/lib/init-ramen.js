'use strict';

const path = require('path');
const _ = require('lodash');
const winston = require('winston');
const Promise = require('bluebird');
const Memcached = require('memcached');

const LOG_DIR = process.env.npm_package_config_logDir || path.join('..', '..');

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

const memcached = new Memcached('localhost');

const logger = new winston.Logger({
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: `${LOG_DIR}/winston.log` })],
});

const _ramen = {};

let eventRegistered = false;

module.exports = (app) => {
  Object.assign(app, { _ramen });

  if (!eventRegistered) {
    app.on('service:added', ({ ns, service }) => {
      const key = `${ns}Service`;

      if (_.isNil(_ramen[key])) {
        console.log(`adding ${key}`);
        _ramen[key] = service;
      }
    });
  }

  eventRegistered = true;

  _ramen._ = _;
  _ramen.promise = Promise;
  _ramen.memcached = memcached;
  _ramen.logger = logger;

  return app;
};
