const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const hangupBtn = document.getElementById("hangupBtn");
const statusEl = document.getElementById("status");
const myIdEl = document.getElementById("myId");

const WS_URL = location.origin.replace(/^http/, "ws");
const socket = new WebSocket(WS_URL);

let myPeerId = null;
let roomName = "";
let targetPeerId = null;
let pc = null;
let localStream = null;
let pendingCandidates = [];
let makingOffer = false;
let ignoreOffer = false;
let polite = true;
let joined = false;

const rtcConfig = window.APP_CONFIG || {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setStatus(msg) {
  statusEl.textContent = msg;
  console.log(msg);
}

function setButtons() {
  startBtn.disabled = !(joined && targetPeerId && pc);
  muteBtn.disabled = !localStream;
  cameraBtn.disabled = !localStream;
  hangupBtn.disabled = !pc;
}

async function ensureLocalMedia() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideo.srcObject = localStream;
  setButtons();
  return localStream;
}

function cleanupPeerConnection() {
  if (pc) {
    try { pc.onicecandidate = null; } catch {}
    try { pc.ontrack = null; } catch {}
    try { pc.onconnectionstatechange = null; } catch {}
    try { pc.onnegotiationneeded = null; } catch {}
    try { pc.close(); } catch {}
  }
  pc = null;
  pendingCandidates = [];
  makingOffer = false;
  ignoreOffer = false;
  remoteVideo.srcObject = null;
  setButtons();
}

async function createPeerConnection() {
  if (pc) return pc;

  await ensureLocalMedia();

  pc = new RTCPeerConnection(rtcConfig);

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && targetPeerId) {
      socket.send(JSON.stringify({
        type: "candidate",
        target: targetPeerId,
        candidate
      }));
    }
  };

  pc.onconnectionstatechange = () => {
    setStatus(`Connection: ${pc.connectionState}`);
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      // leave pc for manual re-call; don't destroy local media
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      if (!targetPeerId) return;
      makingOffer = true;
      await pc.setLocalDescription();
      socket.send(JSON.stringify({
        type: "description",
        target: targetPeerId,
        description: pc.localDescription
      }));
    } catch (err) {
      console.error("negotiationneeded error", err);
      setStatus("Negotiation error. Check console.");
    } finally {
      makingOffer = false;
    }
  };

  setButtons();
  return pc;
}

async function addCandidateSafely(candidate) {
  try {
    if (pc?.remoteDescription?.type) {
      await pc.addIceCandidate(candidate);
    } else {
      pendingCandidates.push(candidate);
    }
  } catch (err) {
    console.error("Error adding ICE candidate", err);
    setStatus("Error adding ICE candidate.");
  }
}

async function flushPendingCandidates() {
  while (pendingCandidates.length && pc?.remoteDescription?.type) {
    const candidate = pendingCandidates.shift();
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.error("Error flushing ICE candidate", err);
    }
  }
}

socket.addEventListener("open", () => {
  setStatus("Connected to signaling server.");
});

socket.addEventListener("message", async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "welcome") {
    myPeerId = msg.peerId;
    myIdEl.textContent = myPeerId;
    return;
  }

  if (msg.type === "joined-room") {
    joined = true;
    roomName = msg.room;
    myPeerId = msg.peerId;
    myIdEl.textContent = myPeerId;
    setStatus(`Joined room: ${roomName}`);
    if (msg.peers.length > 0) {
      targetPeerId = msg.peers[0];
      polite = false; // newer joiner is impolite and usually initiator
    }
    await createPeerConnection();
    setButtons();
    return;
  }

  if (msg.type === "peer-joined") {
    targetPeerId = msg.peerId;
    polite = true; // older peer is polite
    await createPeerConnection();
    setStatus(`Peer joined: ${targetPeerId}`);
    setButtons();
    return;
  }

  if (msg.type === "ready") {
    targetPeerId = msg.target;
    await createPeerConnection();
    setStatus(`Peer ready: ${targetPeerId}`);
    setButtons();

    if (msg.initiator) {
      try {
        await pc.setLocalDescription();
        socket.send(JSON.stringify({
          type: "description",
          target: targetPeerId,
          description: pc.localDescription
        }));
        setStatus("Offer sent.");
      } catch (err) {
        console.error("Error starting call", err);
        setStatus("Could not start call.");
      }
    }
    return;
  }

  if (msg.type === "room-full") {
    setStatus(msg.message || "Room is full.");
    return;
  }

  if (msg.type === "peer-left") {
    if (msg.peerId === targetPeerId) {
      setStatus("Peer left the room.");
      targetPeerId = null;
      cleanupPeerConnection();
      await createPeerConnection();
      setButtons();
    }
    return;
  }

  if (msg.type === "description") {
    const description = msg.description;
    targetPeerId = msg.from;

    await createPeerConnection();

    const offerCollision =
      description.type === "offer" &&
      (makingOffer || pc.signalingState !== "stable");

    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) {
      console.warn("Ignoring offer collision");
      return;
    }

    try {
      await pc.setRemoteDescription(description);
      await flushPendingCandidates();

      if (description.type === "offer") {
        await pc.setLocalDescription();
        socket.send(JSON.stringify({
          type: "description",
          target: targetPeerId,
          description: pc.localDescription
        }));
        setStatus("Answer sent.");
      } else {
        setStatus("Remote description applied.");
      }
    } catch (err) {
      console.error("Error applying remote description", err);
      setStatus("Remote description error.");
    }
    return;
  }

  if (msg.type === "candidate") {
    if (!ignoreOffer) {
      await addCandidateSafely(msg.candidate);
    }
    return;
  }

  if (msg.type === "error") {
    setStatus(msg.message || "Server error.");
  }
});

joinBtn.addEventListener("click", async () => {
  const room = roomInput.value.trim();
  if (!room) {
    setStatus("Write a room name first.");
    return;
  }

  try {
    await ensureLocalMedia();
    socket.send(JSON.stringify({
      type: "join-room",
      room
    }));
  } catch (err) {
    console.error(err);
    setStatus("Could not access camera/microphone.");
  }
});

startBtn.addEventListener("click", async () => {
  if (!targetPeerId) {
    setStatus("Wait for another person to join the same room.");
    return;
  }
  await createPeerConnection();

  try {
    await pc.setLocalDescription();
    socket.send(JSON.stringify({
      type: "description",
      target: targetPeerId,
      description: pc.localDescription
    }));
    setStatus("Offer sent manually.");
  } catch (err) {
    console.error(err);
    setStatus("Could not start call.");
  }
});

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
});

cameraBtn.addEventListener("click", () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.textContent = videoTrack.enabled ? "Camera Off" : "Camera On";
});

hangupBtn.addEventListener("click", () => {
  cleanupPeerConnection();
  createPeerConnection().then(() => {
    setStatus("Call reset. You can start again.");
  }).catch(() => {
    setStatus("Call reset.");
  });
});

setButtons();
