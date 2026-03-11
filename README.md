# WebRTC Render Corrected Demo

This is a corrected 1-to-1 WebRTC video call demo for Render.

## What was fixed

- Room-based signaling
- Messages relayed only to the target peer
- Better 1-to-1 room handling
- Candidate queueing until `setRemoteDescription()`
- Safer negotiation flow for offer collisions
- Reset-call button

## Important limitation

This project uses **STUN only by default**.

That means it may work:
- on the same Wi-Fi
- on some public networks
- on some home routers

But it may fail:
- across different mobile networks
- behind strict NAT / CGNAT
- on some office or school networks

For more reliable real-world connections, add a **TURN server** in:

`public/config.js`

## Local run

```bash
npm install
npm start
```

Open:

`http://localhost:3000`

## Render deploy

Use:

- Build Command: `npm install`
- Start Command: `node server.js`

## How to test

1. Open the deployed URL on device A
2. Open the same URL on device B
3. Type the same room name on both devices
4. Click **Join Room**
5. Wait a second; call should start automatically when both peers are ready
6. If needed, click **Start Call**

## TURN example

In `public/config.js`:

```js
window.APP_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:your-turn-server:3478",
      username: "your-username",
      credential: "your-password"
    }
  ]
};
```

Services people commonly use:
- Metered
- Twilio Network Traversal
- Xirsys
- Coturn on your own VPS

## Structure

- `server.js` - Express + WebSocket signaling server
- `public/index.html` - UI
- `public/app.js` - WebRTC client logic
- `public/config.js` - ICE config
