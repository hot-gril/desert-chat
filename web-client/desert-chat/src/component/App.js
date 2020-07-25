import React from "react";
import client from "../model/client";

var desertClient

export default class App extends React.Component {
  state = {
    inRoom: false,
  };

  handleClick = buttonName => {
    console.log("clicked " + buttonName)
  };

  joinRoom() {
    console.log("joinRoom")
    var proto
    async function joinRoom(invitationCode) {
      if (!proto) proto = await client.setup()
      desertClient = new client.RoomParticipantClient(proto, await client.newSocket(), client.myHostname)
      await desertClient.init()
      desertClient.onReceiveText = function(senderHello, text) {
        console.info(`${desertClient.name()} message from ${desertClient.displayName(senderHello)}: ${text.body}`)
      }

      //      // https://stackoverflow.com/a/50354182
      //      // https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer
      //      const rxCamera = document.querySelector('#rx-camera');
      //      var mediaSource = new MediaSource();
      //      rxCamera.src = URL.createObjectURL(mediaSource)
      //      var sourceBuffer
      //      mediaSource.addEventListener("sourceopen", function() {
      //        sourceBuffer = mediaSource.addSourceBuffer(mediaType);
      //        setTimeout(function() {
      //          rxCamera.play();
      //        }, 1000)  // TODO replace this with proper user interaction detection
      //        client.onReceiveVideo = function(senderHello, video) {
      //          console.info(`${client.name()} video from ${client.displayName(senderHello)}`)
      //          if (!sourceBuffer.updating) {
      //            sourceBuffer.appendBuffer(video.buffer)
      //          }
      //        }
      //      });
      await desertClient.joinRoom(invitationCode)
    }
    joinRoom("CiQ2MjAzZjNhMC0wYWVhLTRlNzQtYWNhNS00YThhOWJmNDQ2MDASDmxvY2FsaG9zdDoxNDUzGiBLmNohK1KLn0gSSeQ1Lp0IsBAQRQzw/BmF0ui3Nyn4bCIggJ0YCbA3xTEN7SsyZs0wcFpS7oYEZ1sytq4YomDLpEoqEGQG+6pkjD95qKhIV1ddZOg=")
  }

  render() {
    if (!this.state.inRoom) {
      this.joinRoom()
      this.setState({inRoom: true})
    }
    return (
      <div style={{display: "flex", flex: 1, flexDirection: "column",
        backgroundColor: "black"}}>
      </div>
    );
  }
}
