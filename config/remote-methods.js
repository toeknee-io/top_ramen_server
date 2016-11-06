module.exports = {
  getChallengeSort() {
    return {
      description: "Find all of a user's challenges and return them sorted by status.",
      http: {
        verb: 'get',
        status: 200,
        path: '/sort/:userId/',
      },
      accepts: [
        {
          description: "The id of the user you're querying for",
          arg: 'userId',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
      ],
      returns: {
        description: "Returns an object with 'new', 'started', and 'finished' properties.  The 'finished' property contains an array of the user's finished challenges.  The 'new' and 'started' properties contain an array of the user's unfinished challenges.",
        type: 'object',
        root: true,
        required: true,
      },
    };
  },
  getChallengeAccept() {
    return {
      description: 'Accept a challenge.',
      http: {
        verb: 'post',
        status: 200,
        path: '/:id/accept',
      },
      accepts: [
        {
          description: 'The id of the challenge being accepted',
          arg: 'id',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
      ],
      returns: {
        description: 'Returns the challenge object',
        type: 'object',
        root: true,
        required: true,
      },
    };
  },
  getChallengeDecline() {
    return {
      description: 'Decline a challenge.',
      http: {
        verb: 'post',
        status: 200,
        path: '/:id/decline',
      },
      accepts: [
        {
          arg: 'req',
          type: 'object',
          http: {
            source: 'req',
          },
          required: true,
        },
        {
          description: 'The id of the challenge being declined',
          arg: 'id',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
      ],
      returns: {
        description: 'Returns the challenge object',
        type: 'object',
        root: true,
        required: true,
      },
    };
  },
  getChallengeHide() {
    return {
      description: 'Hide a challenge.',
      http: {
        verb: 'post',
        status: 200,
        path: '/:id/hide',
      },
      accepts: [
        {
          arg: 'req',
          type: 'object',
          http: {
            source: 'req',
          },
          required: true,
        },
        {
          description: 'The id of the challenge being hidden',
          arg: 'id',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
      ],
      returns: {
        description: 'Returns the challenge object',
        type: 'object',
        root: true,
        required: true,
      },
    };
  },
};
