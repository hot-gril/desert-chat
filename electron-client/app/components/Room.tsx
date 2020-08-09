import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
const queryString = require('query-string');
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import {Launcher} from 'react-chat-window'

class TextRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: undefined,
      messageList: []
    };
    this.handleError = this.handleError.bind(this)
    this.checkClient = this.checkClient.bind(this)
  }

  async _onMessageWasSent(message) {
    this.setState({
      messageList: [...this.state.messageList, message]
    })
    await this.state.client.sendText(message.data.text)
  }

  handleError(e) {
    alert(e)
  }

  async checkClient() {
    if (!this.props.invitationCode) return
    try {
      if (this.state.client === undefined) {
        const client = await desert.makeParticipantClient()
        await client.joinRoom(this.props.invitationCode)
        client.onReceiveText = function(senderHello, text) {
          console.log(`Message from ${common.userName(senderHello)}: ${text}`)
          this.setState({
            messageList: [...this.state.messageList, {
              author: common.userName(senderHello),
              type: "text",
              data: { text: text.body },
            }]
          })
        }.bind(this)
        this.setState({client})
      }
    } catch(err) {
      console.error({err})
      this.handleError(err)
      this.setState({client: null})
    }
  }

  render() {
    this.checkClient()
    return (
      <div style={{}}>
        <Launcher
        agentProfile={{
          teamName: 'react-chat-window',
          imageUrl: 'https://a.slack-edge.com/66f9/img/avatars-teams/ava_0001-34.png'
        }}
        onMessageWasSent={this._onMessageWasSent.bind(this)}
        messageList={this.state.messageList}
        showEmoji
      />
      </div>
    );
  }
}

class RoomDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: undefined,
    };
    this.handleError = this.handleError.bind(this)
    const params = queryString.parse(location.hash.split("?")[1])
    this.invitationCode = (params.invitationCode || "").replaceAll(' ','')
  }

  handleError(e) {
    alert(e)
  }

  render() {
    return (
      <div>
      <TextRoom invitationCode={this.invitationCode} />
      </div>
    );
  }
}

export default function Room(): JSX.Element {
  return (
    <div style={{backgroundColor: common.c.offBlack}}>
      <RoomDialog />
    </div>
  );
}
