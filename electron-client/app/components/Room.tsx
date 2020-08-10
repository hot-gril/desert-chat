import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
const queryString = require('query-string');
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import { MessageList, Input, Button } from 'react-chat-elements'

const kSelf = "self"

class TextRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: undefined,
      messages: [],
      composingText: "",
    };
    this.handleError = this.handleError.bind(this)
    this.checkClient = this.checkClient.bind(this)
    this.renderMessage = this.renderMessage.bind(this)
    this.renderSeparator = this.renderSeparator.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleError(e) {
    console.error({e})
    alert(e)
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

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  renderMessage(msg, idx) {
    var justify
    const isSelf = (msg.senderHello === kSelf)
    return (
      <li key={idx}>
        <div style={{display: "flex", justifyContent: isSelf ? "flex-end" : "flex-start"}}>
          <span style={{
                fontFamily: "monospace",
                  wordWrap: "break-word",
              display: "block",
              width: "50%",
              textAlign: isSelf ? "right" : "left",
                  whiteSpace: "normal",
          }}>
            {(!isSelf) && (
              <span style={{
                  fontWeight: isSelf ? "bold" : undefined,
              }}>
                {common.userName(msg.senderHello) + ": "}
              </span>
            )}
            <span>
              {msg.text.body}
            </span>
          </span>
        </div>
      </li>
    )
  }

  async handleSubmit(event) {
    const body = this.state.composingText
    if ((body || "").replaceAll(' ','').length <= 0) {
      return
    }
    try {
      await this.state.client.sendText(body)
    } catch(err) {
      this.handleError(err)
    }
    const messages = this.state.messages
    messages.push({senderHello: kSelf, text: {body}})
    this.setState({composingText: "", messages})
  }

  handleChange(event) {
    this.setState({composingText: event.target.value})
  }

  render() {
    this.checkClient()
    return (
      <div style={{color: common.c.text}}>
        <MessageList
          className='message-list'
          lockable={true}
          toBottomHeight={'100%'}
          dataSource={[
            {
              position: 'right',
              type: 'text',
              text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit',
              date: new Date(),
            },
            ]} />
          <br/>
          <Input
            placeholder="Type here..."
            multiline={true}
            />
      </div>
    );
  }
}

class RoomDialog extends React.Component {
  constructor(props) {
    super(props);
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
    <div style={{backgroundColor: common.c.offBlack, position: "fixed", width: "100%", height: "100%", bottom: 0, left: 0}}>
    <RoomDialog />
    </div>
  );
}
