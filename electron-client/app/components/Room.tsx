import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
const queryString = require('query-string');
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import FlatList from 'flatlist-react';

class TextRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: undefined,
      messages: [],
    };
    this.handleError = this.handleError.bind(this)
    this.checkClient = this.checkClient.bind(this)
    this.renderMessage = this.renderMessage.bind(this)
  }

  handleError(e) {
    console.error({e})
    alert(e)
  }

  async sendMessage(body) {
    try {
      await this.state.client.sendText(body)
    } catch(err) {
      this.handleError(err)
    }
  }

  async checkClient() {
    if (!this.props.invitationCode) return
    try {
      if (this.state.client === undefined) {
        const client = await desert.makeParticipantClient()
        await client.joinRoom(this.props.invitationCode)
        client.onReceiveText = function(senderHello, text) {
          console.log(`Message from ${common.userName(senderHello)}: ${text.body}`)
          const messages = this.state.messages
          messages.push({senderHello, text})
          this.setState({messages})
        }.bind(this)
        this.setState({client})
      }
    } catch(err) {
      this.handleError(err)
      this.setState({client: null})
    }
  }

  renderMessage(msg, idx) {
    console.log("renderMessage", {msg, idx})
    return (
      <li key={idx}>
        <b>{common.userName(msg.senderHello)}</b> (<span>{msg.text.body}</span>)
      </li>
    )
  }

  render() {
    this.checkClient()
    return (
      <div style={{color: "white"}}>
        <ul>
          <FlatList
            list={this.state.messages}
            renderItem={this.renderMessage}
            renderWhenEmpty={() => <div>List is empty!</div>}
          /> 
      </ul>
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
