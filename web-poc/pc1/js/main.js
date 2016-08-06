'use strict';

var mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleSourceOpen, false);
var mediaRecorder;
var recordedBlobs;
var sourceBuffer;

var startButton = document.getElementById('startButton');
var broadcastButton = document.getElementById('broadcastButton');
var hangupButton = document.getElementById('hangupButton');
var recordButton = document.querySelector('button#record');
var playButton = document.querySelector('button#play');
var uploadButton = document.querySelector('button#upload');
broadcastButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
broadcastButton.onclick = call;
hangupButton.onclick = hangup;
recordButton.onclick = toggleRecording;
playButton.onclick = play;
uploadButton.onclick = upload;

var startTime;
var localVideo = document.getElementById('localVideo');
var recordedVideo = document.querySelector('video#recorded');

localVideo.addEventListener('loadedmetadata', function() {
  trace('Local video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

function handleSuccess(stream) {
  console.log('getUserMedia() got stream: ', stream);
  window.stream = stream;
}

function handleError(error) {
  console.log('navigator.getUserMedia error: ', error);
}

var constraints = {
  audio: true,
  video: true
};
navigator.mediaDevices.getUserMedia(constraints).
    then(handleSuccess).catch(handleError);

var localStream;
var pc1;
var offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function gotStream(stream) {
  trace('Received local stream');
  localVideo.srcObject = stream;
  localStream = stream;
  broadcastButton.disabled = false;
}

function start() {
  firebase.database().ref('offer_ice').remove();
  firebase.database().ref('offer').remove();
  firebase.database().ref('answers_ice').remove();
  firebase.database().ref('answers').remove();
  trace('Requesting local stream');
  startButton.disabled = true;
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    trace('getUserMedia() error: ' + e.name);
  });
}

function call() {
  broadcastButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call');
  startTime = window.performance.now();
  var videoTracks = localStream.getVideoTracks();
  var audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    trace('Using video device: ' + videoTracks[0].label);
  }
  if (audioTracks.length > 0) {
    trace('Using audio device: ' + audioTracks[0].label);
  }
  var servers = null;
  pc1 = new RTCPeerConnection(servers);
  trace('Created local peer connection object pc1');
  pc1.onicecandidate = function(e) {
    onIceCandidate(pc1, e);
  };
  pc1.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc1, e);
  };
  pc1.addStream(localStream);
  trace('Added local stream to pc1');

  trace('pc1 createOffer start');
  pc1.createOffer(
    offerOptions
  ).then(
    onCreateOfferSuccess,
    onCreateSessionDescriptionError
  );
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function onCreateOfferSuccess(desc) {
  trace('Offer from pc1\n');
  firebase.database().ref('offer').set({
    sdp : desc.sdp
  });
  firebase.database().ref('answers').on('child_added', function(answer) {
     var desc = { 'type':'answer', 'sdp':answer.val().sdp };
     pc1.setRemoteDescription(desc).then(
       function() {
         onSetRemoteSuccess(pc1);
        },
        onSetSessionDescriptionError
    );    
  });
  firebase.database().ref('answers_ice').on('child_added', function(ice) {
    pc1.addIceCandidate(
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
  
  trace('pc1 setLocalDescription start');
  pc1.setLocalDescription(desc).then(
    function() {
      onSetLocalSuccess();
    },
    onSetSessionDescriptionError
  );
}

function onSetLocalSuccess() {
  trace(' setLocalDescription complete');
}

function onSetRemoteSuccess() {
  trace('setRemoteDescription complete');
}

function onSetSessionDescriptionError(error) {
  trace('Failed to set session description: ' + error.toString());
}

function onIceCandidate(pc, event) {
  if (event.candidate) {
//    trace(' ICE candidate: \n' + event.candidate.candidate);
    firebase.database().ref('offer_ice').push({
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
}

function hangup() {
  trace('Ending call');
  pc1.close();
  pc1 = null;
  hangupButton.disabled = true;
  broadcastButton.disabled = false;
}

function toggleRecording() {
  if (recordButton.textContent === 'Start Recording') {
    startRecording();
  } else {
    stopRecording();
    recordButton.textContent = 'Start Recording';
    playButton.disabled = false;
    uploadButton.disabled = false;
  }
}


function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data);
  }
}
function handleStop(event) {
  console.log('Recorder stopped: ', event);
}


// The nested try blocks will be simplified when Chrome 47 moves to Stable
function startRecording() {
  recordedBlobs = [];
  var options = {mimeType: 'video/webm;codecs=vp9'};
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    console.log(options.mimeType + ' is not Supported');
    options = {mimeType: 'video/webm;codecs=vp8'};
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log(options.mimeType + ' is not Supported');
      options = {mimeType: 'video/webm'};
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(options.mimeType + ' is not Supported');
        options = {mimeType: ''};
      }
    }
  }
  try {
    mediaRecorder = new MediaRecorder(localStream, options);
//    mediaRecorder = new MediaRecorder(window.stream, options);
  } catch (e) {
    console.error('Exception while creating MediaRecorder: ' + e);
    alert('Exception while creating MediaRecorder: '
      + e + '. mimeType: ' + options.mimeType);
    return;
  }
  console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
  recordButton.textContent = 'Stop Recording';
  playButton.disabled = true;
  uploadButton.disabled = true;
  mediaRecorder.onstop = handleStop;
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start(10); // collect 10ms of data
  console.log('MediaRecorder started', mediaRecorder);
}

function stopRecording() {
  mediaRecorder.stop();
  console.log('Recorded Blobs: ', recordedBlobs);
  recordedVideo.controls = true;
}

function play() {
  var superBuffer = new Blob(recordedBlobs, {type: 'video/webm'});
  recordedVideo.src = window.URL.createObjectURL(superBuffer);
}

function upload() {
  var blob = new Blob(recordedBlobs, {type: 'video/webm'});
//  var url = window.URL.createObjectURL(blob);
  var uploadTask = firebase.storage().ref().child('videos/word.webm').put(blob);
  uploadTask.on('state_changed', function(snapshot){
    // Observe state change events such as progress, pause, and resume
    }, function(error) {
      trace('file upload error ' + error);
    }, function() {
      trace('upload completed');
    var uploadURL = uploadTask.snapshot.uploadURL;
    });
}

function handleSourceOpen(event) {
  console.log('MediaSource opened');
  sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
  console.log('Source buffer: ', sourceBuffer);
}
