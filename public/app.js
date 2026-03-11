const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const socket = new WebSocket(`${wsProtocol}://${window.location.host}`);

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentRoom = null;
let isAudioEnabled = true;
let isVideoEnabled = true;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function updateStatus(message) {
  statusText.textContent = message;
}

async function ensureLocalMedia() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;
  toggleAudioBtn.disabled = false;
  toggleVideoBtn.disabled = false;
  return localStream;
}

function resetRemoteVideo() {
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoom) {
      socket.send(JSON.stringify({
        type: 'ice-candidate',
        roomId: currentRoom,
        payload: event.candidate
      }));
    }
  };

  peerConnection.ontrack = (event) => {
    if (!remoteStream) resetRemoteVideo();
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') updateStatus('Conexión establecida. Videollamada activa.');
    if (state === 'disconnected') updateStatus('El otro participante se desconectó.');
    if (state === 'failed') updateStatus('Falló la conexión WebRTC.');
  };

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });
}

async function makeOffer() {
  if (!peerConnection) createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.send(JSON.stringify({
    type: 'offer',
    roomId: currentRoom,
    payload: offer
  }));

  updateStatus('Oferta enviada. Esperando respuesta...');
}

async function handleOffer(offer) {
  if (!peerConnection) createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.send(JSON.stringify({
    type: 'answer',
    roomId: currentRoom,
    payload: answer
  }));

  updateStatus('Oferta recibida y respondida. Conectando...');
}

async function handleAnswer(answer) {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  updateStatus('Respuesta recibida. Finalizando conexión...');
}

async function handleIceCandidate(candidate) {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error al agregar ICE candidate', error);
  }
}

function cleanupConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }

  remoteVideo.srcObject = null;
  remoteStream = null;
}

async function joinRoom() {
  const roomId = roomInput.value.trim();
  if (!roomId) {
    updateStatus('Escribe un nombre de sala antes de continuar.');
    return;
  }

  try {
    await ensureLocalMedia();
    currentRoom = roomId;

    socket.send(JSON.stringify({
      type: 'join',
      roomId
    }));

    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    roomInput.disabled = true;
    updateStatus(`Uniéndote a la sala "${roomId}"...`);
  } catch (error) {
    console.error(error);
    updateStatus('No se pudo acceder a la cámara o al micrófono.');
  }
}

function leaveRoom() {
  if (currentRoom) {
    socket.send(JSON.stringify({
      type: 'leave',
      roomId: currentRoom
    }));
  }

  cleanupConnection();
  currentRoom = null;
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  roomInput.disabled = false;
  updateStatus('Saliste de la sala.');
}

function toggleAudio() {
  if (!localStream) return;
  isAudioEnabled = !isAudioEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = isAudioEnabled;
  });
  toggleAudioBtn.textContent = isAudioEnabled ? 'Silenciar micrófono' : 'Activar micrófono';
}

function toggleVideo() {
  if (!localStream) return;
  isVideoEnabled = !isVideoEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = isVideoEnabled;
  });
  toggleVideoBtn.textContent = isVideoEnabled ? 'Apagar cámara' : 'Encender cámara';
}

socket.addEventListener('open', () => {
  updateStatus('Conectado al servidor de signaling.');
});

socket.addEventListener('message', async (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'joined': {
      const count = message.payload.userCount;
      if (count === 1) {
        updateStatus('Sala creada. Esperando a otro participante...');
      } else {
        updateStatus('Entraste a la sala. Preparando conexión...');
      }
      break;
    }
    case 'ready': {
      resetRemoteVideo();
      await makeOffer();
      break;
    }
    case 'offer':
      resetRemoteVideo();
      await handleOffer(message.payload);
      break;
    case 'answer':
      await handleAnswer(message.payload);
      break;
    case 'ice-candidate':
      await handleIceCandidate(message.payload);
      break;
    case 'peer-left':
      cleanupConnection();
      updateStatus('El otro participante salió de la sala.');
      break;
    case 'room-full':
      currentRoom = null;
      joinBtn.disabled = false;
      leaveBtn.disabled = true;
      roomInput.disabled = false;
      updateStatus('La sala ya tiene 2 participantes. Usa otro nombre.');
      break;
    case 'error':
      updateStatus(message.message || 'Ocurrió un error en el servidor.');
      break;
    default:
      console.log('Mensaje no manejado:', message);
  }
});

socket.addEventListener('close', () => {
  updateStatus('Se perdió la conexión con el servidor.');
});

joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
toggleAudioBtn.addEventListener('click', toggleAudio);
toggleVideoBtn.addEventListener('click', toggleVideo);

resetRemoteVideo();
