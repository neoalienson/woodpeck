'use strict';

var sendButton = document.getElementById('sendButton');
var messageInput = document.getElementById('messageInput');
var watchButton = document.getElementById('watchButton');
var hangupButton = document.getElementById('hangupButton');
hangupButton.disabled = true;
watchButton.onclick = watch;
hangupButton.onclick = hangup;
sendButton.onclick = send;

function send() {
  var text = messageInput.value;
  firebase.database().ref('chat').push({
    name : 'user1',
    message : text,
    postOn : new Date().getTime()
  });  

  var message = document.createElement('div');
  message.className = 'message';
  message.textContent = text;
  document.getElementById('messageContainer').appendChild(message);
  messageInput.value = '';

}

var startTime;
var remoteVideo = document.getElementById('remoteVideo');
var recordedVideo = document.querySelector('video#recorded');

remoteVideo.addEventListener('loadedmetadata', function() {
  trace('Remote video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

function handleSuccess(stream) {
  console.log('getUserMedia() got stream: ', stream);
  window.stream = stream;
}

function handleError(error) {
  console.log('navigator.getUserMedia error: ', error);
}

// one-way
var constraints = {
  audio: true,
  video: true
};
navigator.mediaDevices.getUserMedia(constraints).
    then(handleSuccess).catch(handleError);

remoteVideo.onresize = function() {
  trace('Remote video size changed to ' +
    remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    var elapsedTime = window.performance.now() - startTime;
    trace('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
};

var remoteStream;
var pc2;
var offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function gotStream(stream) {
  trace('Received local stream');
//  remoteVideo.srcObject = stream;
  remoteStream = stream;
  watchButton.disabled = false;
}

function watch() {
  firebase.database().ref('answers_ice').remove();
  firebase.database().ref('answers').remove();
  
  watchButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call');
  startTime = window.performance.now();
  var servers = null;
  pc2 = new RTCPeerConnection(servers);
  trace('Created remote peer connection object pc2');
  pc2.onicecandidate = function(e) {
    onIceCandidate(pc2, e);
  };
  pc2.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc2, e);
  };
  pc2.onaddstream = gotRemoteStream;

  firebase.database().ref('offer').on('value', function(snapshot) {
    setRemoteDescription(snapshot.val().sdp);
  });
  firebase.database().ref('offer_ice').on('child_added', function(ice) {
    pc2.addIceCandidate(
      new RTCIceCandidate(ice.val())
    ).then(
      function() {
        onAddIceCandidateSuccess();
      },
      function(err) {
        onAddIceCandidateError(err);
      }
    );
  });

}

function setRemoteDescription(sdp) {
  var desc = {'type':'offer', 'sdp' : sdp };
  pc2.setRemoteDescription(desc).then(
    function() {
      onSetRemoteSuccess();
    },
    onSetSessionDescriptionError
  );
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function onSetLocalSuccess() {
  trace(' setLocalDescription complete');
}

function onSetRemoteSuccess() {
  trace('setRemoteDescription complete');
  trace('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  pc2.createAnswer().then(
    onCreateAnswerSuccess,
    onCreateSessionDescriptionError
  );
}

function onSetSessionDescriptionError(error) {
  trace('Failed to set session description: ' + error.toString());
}

function gotRemoteStream(e) {
  remoteVideo.srcObject = e.stream;
  trace('pc2 received remote stream');
}

function onCreateAnswerSuccess(desc) {
  trace('pc2 setLocalDescription start');
  firebase.database().ref('answers').push({
    sdp : desc.sdp
  });  
  pc2.setLocalDescription(desc).then(
    function() {
      onSetLocalSuccess();
  },
    onSetSessionDescriptionError
  );
}

function onIceCandidate(pc, event) {
  if (event.candidate) {
//    trace(' ICE candidate: \n' + event.candidate.candidate);
    firebase.database().ref('answers_ice').push({
      candidate : event.candidate.candidate
    });  
  }
}

function onAddIceCandidateSuccess() {
  trace(' addIceCandidate success');
}

function onAddIceCandidateError(error) {
  trace(' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
  if (pc) {
    trace(' ICE state: ' + pc.iceConnectionState);
    console.log('ICE state change event: ', event);
  }
}

function hangup() {
  trace('Ending call');
  pc2.close();
  pc2 = null;
  hangupButton.disabled = true;
  watchButton.disabled = false;
}

