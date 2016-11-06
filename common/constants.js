module.exports = {
  CHALLENGE: {
    STATUS: {
      NEW: 'new',
      STARTED: 'started',
      FINISHED: 'finished',
    },
    INVITE: {
      STATUS: {
        PENDING: 'pending',
        ACCEPTED: 'accepted',
        DECLINED: 'declined',
      },
    },
    NEW: {
      BUTTONS: {
        TEXT: {
          STATUS: {
            PENDING: 'Invite Sent',
            READY: 'Draw First Blood',
          },
        },
      },
    },
    STARTED: {
      BUTTONS: {
        TEXT: {
          STATUS: {
            YOU: 'Your Turn',
            THEM: 'Their Turn',
          },
        },
      },
    },
    FINISHED: {
      BUTTONS: {
        TEXT: {
          STATUS: {
            DECLINED: 'Opponent Resigned',
            TIED: 'Tied',
            WON: 'You Won!',
            LOST: 'You Lost',
          },
        },
      },
      PUSH: {
        TEXT: {
          STATUS: {
            TIED: 'Ties',
            BEAT: 'Beat',
            LOST: 'Lost to',
          },
        },
      },
      WINNER: {
        TIED: 'tied',
      },
    },
  },
};
