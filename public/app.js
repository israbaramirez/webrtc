
const socket = new WebSocket(location.origin.replace(/^http/, "ws"));

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc;
let localStream;
let pendingCandidates = [];

async function start() {
  localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  localVideo.srcObject = localStream;

  pc = new RTCPeerConnection({
    iceServers:[{urls:"stun:stun.l.google.com:19302"}]
  });

  localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));

  pc.ontrack = e=> remoteVideo.srcObject = e.streams[0];

  pc.onicecandidate = e=>{
    if(e.candidate){
      socket.send(JSON.stringify({candidate:e.candidate}));
    }
  };

  socket.onmessage = async (event)=>{
    const msg = JSON.parse(event.data);

    if(msg.description){
      const desc = msg.description;

      if(desc.type==="offer"){
        await pc.setRemoteDescription(desc);
        flushCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.send(JSON.stringify({description:pc.localDescription}));
      }

      if(desc.type==="answer"){
        if(pc.signalingState==="have-local-offer"){
          await pc.setRemoteDescription(desc);
          flushCandidates();
        }
      }
    }

    if(msg.candidate){
      addCandidate(msg.candidate);
    }
  };

  socket.onopen = ()=>{
    socket.send(JSON.stringify({join:"room1"}));
  };
}

async function call(){
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({description:pc.localDescription}));
}

async function addCandidate(c){
  if(pc.remoteDescription){
    await pc.addIceCandidate(c);
  }else{
    pendingCandidates.push(c);
  }
}

async function flushCandidates(){
  while(pendingCandidates.length){
    await pc.addIceCandidate(pendingCandidates.shift());
  }
}

start();
document.getElementById("callBtn").onclick = call;
