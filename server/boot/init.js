var path, winston;

winston = require('winston');

path = require('path');

module.exports = function(app) {
  var logDir;
  if (!app._ramen) {
    app._ramen = {};
  }
  logDir = app.get("logDir") || process.env.npm_package_config_logDir || path.join("..", "..");
  console.log("creating logger that outputs to dir", logDir);
  return global.logger = new winston.Logger({
    transports: [
      new winston.transports.Console(), new winston.transports.File({
        filename: logDir + "/winston.log"
      })
    ]
  });
};
