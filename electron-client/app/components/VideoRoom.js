import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const common = require("./common")
const desert = require("../model/desert")

const mediaType = `video/webm;codecs=vp9`;

class VideoRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      invitationCode: "",
      client: null,
    };
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.openCamera = this.openCamera.bind(this)
    this.joinRoom = this.joinRoom.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  handleError(e) {
    alert(e)
  }

  handleChange(event) {
    this.setState({invitationCode: event.target.value})
  }

  handleSubmit(event) {
    this.joinRoom(this.state.invitationCode)
    event.preventDefault()
  }

  async openCamera() {
    try {
      const constraints = {
        audio: false,
        video: true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.txVideo.srcObject = stream 
      const mediaRecorder = new MediaRecorder(stream, {mimeType: mediaType})
      mediaRecorder.ondataavailable = async function(event) {
        if (event.data.size > 0) {
          this.state.client.sendVideo(new Uint8Array(await event.data.arrayBuffer()))
        }
      }.bind(this)
      mediaRecorder.start(100)
    } catch (e) {
      this.handleError(e);
    }
  }

  async joinRoom(code) {
    const client = await desert.makeParticipantClient()
    this.setState({client})
    await client.joinRoom(code)
    await this.openCamera()

    const mediaSource = new MediaSource()
    this.rxVideo.src = URL.createObjectURL(mediaSource)
    var sourceBuffer
    mediaSource.addEventListener("sourceopen", function() {
      sourceBuffer = mediaSource.addSourceBuffer(mediaType);
      client.onReceiveVideo = function(senderHello, video) {
        if (!sourceBuffer.updating) {
          sourceBuffer.appendBuffer(video.buffer)
        }
      }
    });
  }

  render() {
    return (
      <div>
        <div style={{width: "50%"}}>
          <form onSubmit={this.handleSubmit}>
              <label>
                Invitation code:
                <div style={{width: "50%"}}>
                <textarea value={this.state.invitationCode} onChange={this.handleChange}/>
                </div>
              </label>
            <input type="submit" value="Submit" />
          </form>
        </div>
        <video ref={ref => this.txVideo = ref} autoPlay playsInline></video>
        <video ref={ref => this.rxVideo = ref} autoPlay playsInline></video>
      </div>
    );
  }
}
