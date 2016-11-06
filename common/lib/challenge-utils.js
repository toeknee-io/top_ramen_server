const _ = require('lodash');

module.exports = class ChallengeUtils {

  static getFirstName(identities = []) {
    if (_.isEmpty(identities) || identities[0].constructor.name !== 'ModelConstructor') {
      throw new Error('The arument for ChallengeUtils.getFirstName must be of type ModelConstructor');
    }
    console.log(identities[0].constructor.name);
    let name = '';
    _.castArray(identities).forEach((identity) => {
      if (_.isEmpty(name) && !_.isNil(identity)) {
        console.log('looping identity: %j', identity);
        const profile = identity.profile;
        if (!_.isEmpty(profile.name) && !_.isEmpty(profile.name.givenName)) {
          name = profile.name.givenName;
        } else if (!_.isEmpty(identity.displayName)) {
          name = profile.displayName.split(/\s/)[0];
        }
      }
      console.log(`name: ${name}`);
    });
    return name;
  }

  static getUsersFirstNames({ challenger, challenged }) {
    if (challenger.constructor.name === 'ModelConstructor') {
      const challengerName = this.getFirstName(challenger.identities);
      const challengedName = this.getFirstName(challenged.identities);
      return { challengerName, challengedName };
    }
    throw new Error('The arument for ChallengeUtils.getUsersFirstNames must be of type ModelConstructor');
  }

  static hideChallengeForUser(userId, challenge) {
    const challenger = challenge.challenger;
    const challenged = challenge.challenged;
    if (challenge.challenger.userId === userId) {
      challenger.hidden = true;
      Object.assign(challenge, { challenger });
    } else if (challenge.challenged.userId === userId) {
      challenged.hidden = true;
      Object.assign(challenge, { challenged });
    }
    return challenge;
  }

};
