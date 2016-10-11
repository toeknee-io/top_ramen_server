'use strict';

const path = require('path');
const lodash = require("lodash");
const winston = require('winston');
const Promise = require("bluebird");
const Memcached = require('memcached');

const LOG_DIR = process.env.npm_package_config_logDir || path.join("..", "..");

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

const memcached = new Memcached('localhost');

const logger = new winston.Logger({ transports: [ new winston.transports.Console(), new winston.transports.File({ filename:  `${LOG_DIR}/winston.log`}) ] });

module.exports = function(app) {

  app._ramen = {};

  app.on('service:added', data => {
    console.log('adding service', data.serviceName);
    app._ramen[data.serviceName] = data.service;
  });

  app._ramen.lodash = lodash;
  app._ramen.promise = Promise;
  app._ramen.memcached = memcached;
  app._ramen.logger = logger;

  return app;

};