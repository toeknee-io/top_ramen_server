'use strict';

const inspect = require('util').inspect;

module.exports = function installationModelExtensions(Installation) {
  Installation.observe('before delete', (ctx, next) => {
    console.log(`unregistered installation where ${inspect(ctx.where)}`);

    Installation.find({ where: { deviceToken: ctx.where.deviceToken.inq[0] } },
      (err, installations) => {
        installations.forEach((installation) => {
          if (err) {
            console.error(err);
          } else if (installation) {
            Object.assign(installation, { status: 'unregistered' });
            Installation.upsert(installation,
              (upsertErr) => { if (upsertErr) console.error(err); }
            );
          }
        });
      }
    );

    const err = new Error('No Installation deletes allowed!');
    err.status = 403;

    next(err);
  });
};
