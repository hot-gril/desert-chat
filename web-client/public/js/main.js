/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
'use strict';

// Put variables in global scope to make them available to the browser console.
const constraints = window.constraints = {
  audio: false,
  video: true
};
const mediaType = `video/webm;codecs=vp9`

var client
function handleSuccess(stream) {
  const video = document.querySelector('#own-camera');
  const videoTracks = stream.getVideoTracks();
  console.log('Got stream with constraints:', constraints);
  console.log(`Using video device: ${videoTracks[0].label}`);
  window.stream = stream; // make variable available to browser console
  video.srcObject = stream;

  var options = {mimeType: mediaType};
  const mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.ondataavailable = async function(event) {
    if (event.data.size > 0 && client) {
      client.sendVideo(new Uint8Array(await event.data.arrayBuffer()))
    }
  }
  mediaRecorder.start(100);
}

function handleError(error) {
  if (error.name === 'ConstraintNotSatisfiedError') {
    const v = constraints.video;
    errorMsg(`The resolution ${v.width.exact}x${v.height.exact} px is not supported by your device.`);
  } else if (error.name === 'PermissionDeniedError') {
    errorMsg('Permissions have not been granted to use your camera and ' +
      'microphone, you need to allow the page access to your devices in ' +
      'order for the demo to work.');
  }
  errorMsg(`getUserMedia error: ${error.name}`, error);
}

function errorMsg(msg, error) {
  const errorElement = document.querySelector('#errorMsg');
  errorElement.innerHTML += `<p>${msg}</p>`;
  if (typeof error !== 'undefined') {
    console.error(error);
  }
}

async function init(e) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    handleSuccess(stream);
    e.target.disabled = true;
  } catch (e) {
    handleError(e);
  }
}

document.querySelector('#showVideo').addEventListener('click', e => init(e));

var proto
async function joinRoom(invitationCode) {
  if (!proto) proto = await setup()
  client = new RoomParticipantClient(proto, await newSocket(), myHostname)
  await client.init()
  client.onReceiveText = function(senderHello, text) {
    console.info(`${client.name()} message from ${client.displayName(senderHello)}: ${text.body}`)
    // TODO
  }

  // https://stackoverflow.com/a/50354182
  // https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer
  const rxCamera = document.querySelector('#rx-camera');
  var mediaSource = new MediaSource();
  rxCamera.src = URL.createObjectURL(mediaSource)
  var sourceBuffer
  mediaSource.addEventListener("sourceopen", function() {
    sourceBuffer = mediaSource.addSourceBuffer(mediaType);
    setTimeout(function() {
      rxCamera.play();
    }, 1000)  // TODO replace this with proper user interaction detection
    client.onReceiveVideo = function(senderHello, video) {
      console.info(`${client.name()} video from ${client.displayName(senderHello)}`)
      if (!sourceBuffer.updating) {
        sourceBuffer.appendBuffer(video.buffer)
      }
    }
  });
  await client.joinRoom(invitationCode)
}
joinRoom("CiQzNDYzOWUxNi04OTA3LTRiYmQtYjg3YS1mOWU4ZmQ1YWQ2ODYSDmxvY2FsaG9zdDoxNDUzGiAW/ePPJkmK8f1xpwNX4UpzNmZa1lCWYHD0ek7z5BjoCiIg0VrEjAF9OMAzAfXwWYAkWJDxMqdodtolb9xaJ4jNPFIqEPhdJhvV25IWX4dKMIZfHrk=")
