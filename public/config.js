window.APP_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }

    // Add TURN for real internet usage, for example:
    // ,
    // {
    //   urls: "turn:your-turn-server:3478",
    //   username: "your-username",
    //   credential: "your-password"
    // }
  ]
};
