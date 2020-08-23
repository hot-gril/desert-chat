import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
const queryString = require('query-string');
import Split from 'react-split'
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import FlatList from 'flatlist-react';

const kSelf = "self"
const kClient = "client"

class ParticipantList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      list: [],
    };
    this.state.listLength = this.state.list.length
    this.renderSeparator = this.renderSeparator.bind(this)
    this.renderItem = this.renderItem.bind(this)
    this.checkParticipants = this.checkParticipants.bind(this)
    this.checkParticipantsLoop = this.checkParticipantsLoop.bind(this)
    this.onUserJoined = this.onUserJoined.bind(this)
    this.onSelfJoined = this.onSelfJoined.bind(this)
  }

  componentDidMount() {
    //this.checkParticipantsLoop()
  }

  onUserJoined(hello) {
    setTimeout(this.checkParticipants, 500)
  }

  onSelfJoined(hello) {
    setTimeout(this.checkParticipants, 500)
  }

  renderItem(userHello, idx) {
    const isSelf = userHello.uuid == this.props.client.identity.uuid
    return (
      <li key={idx} style={{color : isSelf ? common.color.specialText : undefined, fontWeight: isSelf ? "bold" : undefined}}>
        {common.userName(userHello)}
      </li>
    )
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  checkParticipantsLoop() {
    this.checkParticipants()
    setTimeout(this.checkParticipantsLoop, 500)
  }

  checkParticipants() {
    if (!this.props.client) return
    const list = Object.values(this.props.client.hellos)
    if (list.length != this.state.listLength) {
      list.sort(function(e0, e1) {
        if (e0.uuid == this.props.client.identity.uuid) return -1
        else if (e1.uuid == this.props.client.identity.uuid) return 1
        return common.userName(e0) < common.userName(e1) ? -1 : 1
      }.bind(this))
      console.log({list: list.map(e => common.userName(e))})
      this.setState({
        list,
        listLength: list.length,
      })
    }
  }

  render() {
    return (
      <div style={{color: common.c.text}}>
        <div ref={el => this.scrollView = el} style={{overflowY: "scroll", height: "calc(100vh - 105px)", padding: 10}}>
          <ul style={{listStyle: "none", margin: 0, padding: 0}}>
            <FlatList
              list={this.state.list}
              renderItem={this.renderItem}
              groupOf={1}
              groupSeparator={this.renderSeparator}
              renderWhenEmpty={() => <div>No participants</div>}/> 
          </ul>
        </div>
      </div>
    );
  }
}

class Messenger extends React.Component {
  constructor(props) {
    super(props);
    const body = this.props.mode == "create" ? `Creating room...` : "Joining room..."
    this.state = {
      messages: [{senderHello: kClient, text: {body}}],
      composingText: "",
    };
    this.renderMessage = this.renderMessage.bind(this)
    this.renderSeparator = this.renderSeparator.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.onUserJoined = this.onUserJoined.bind(this)
    this.onSelfJoined = this.onSelfJoined.bind(this)
    this.onReceiveText = this.onReceiveText.bind(this)
  }

  componentDidMount() {
    this.textInput.focus()
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  onReceiveText(senderHello, text) {
    console.log(`Message from ${common.userName(senderHello)}: ${text.body}`)
    const messages = this.state.messages
    messages.push({senderHello, text})
    this.setState({messages})
  }

  onSelfJoined() {
    const messages = this.state.messages
    var body
    electron.clipboard.writeText(this.props.invitationCode)
    if (this.props.mode == "create") {
      //body = "Copied invitation code to clipboard"
      body = `Copied invitation code to clipboard: ${this.props.invitationCode}`
    } else {
      body = "Joined room"
    }
    messages.push({senderHello: kClient, text: {body}})
    this.setState({messages})
  }

  onUserJoined(hello) {
  }

  renderMessage(msg, idx) {
    var justify
    const isClient = (msg.senderHello === kClient)
    const isSelf = !isClient && (msg.senderHello === kSelf || msg.senderHello.uuid == (this.props.options.identity || {}).uuid)
    var messageStyle
    if (isClient) {
      messageStyle = {
        color: common.color.specialText,
        fontStyle: "italic",
      }
    }
    return (
      <li key={idx}>
        <div style={{display: "flex", justifyContent: isSelf ? "flex-end" : "flex-start"}}>
          <span style={{
                fontFamily: "monospace",
                  wordWrap: "break-word",
              display: "block",
              width: "calc(100vw - 130px)",
              textAlign: isSelf ? "right" : "left",
                  whiteSpace: "normal",
          }}>
            {(!isSelf && !isClient) && (
              <span style={{
                  fontWeight: isSelf ? "bold" : undefined,
              }}>
                {common.userName(msg.senderHello) + ": "}
              </span>
            )}
            <span style={messageStyle}>
              {msg.text.body}
            </span>
          </span>
        </div>
      </li>
    )
  }

  async handleSubmit(event) {
    event.preventDefault()
    const body = this.state.composingText
    if ((body || "").replaceAll(' ','').length <= 0) {
      return
    }
    try {
      await this.props.client.sendText(body)
    } catch(err) {
      common.handleError(err)
    }
    const messages = this.state.messages
    messages.push({senderHello: kSelf, text: {body}})
    this.setState({composingText: "", messages})
    this.scrollView.scrollTop = this.scrollView.scrollHeight - this.scrollView.clientHeight
  }

  handleChange(event) {
    this.setState({composingText: event.target.value})
  }

  render() {
    return (
      <div style={{color: common.c.text, flex: 6}}>
        <div ref={el => this.scrollView = el} style={{overflowY: "scroll", height: "calc(100vh - 85px)", width: "calc(100% - 20px)", padding: 10}}>
          <ul style={{listStyle: "none", margin: 0, padding: 0}}>
            <FlatList
              list={this.state.messages}
              renderItem={this.renderMessage}
              groupOf={1}
              groupSeparator={this.renderSeparator}
              renderWhenEmpty={() => <div>No chat messages yet.</div>}/> 
          </ul>
        </div>
        <br/>
        <div style={{width: "96%", background: common.c.black,
            position: "fixed", left: 0, bottom: 0, height: 50, paddingTop: 20, paddingLeft: "2%", paddingRight: "2%"}}>
          <form onSubmit={this.handleSubmit}>
            <div style={{display: "flex", flexDirection: "column", justifyContent: "flex-end"}}>
              <input
                type="text"
                ref={el => this.textInput = el}
                style={{resize: "none"}}
                value={this.state.composingText}
                onChange={this.handleChange}/>
              <input type="submit" value="Send" />
            </div>
          </form>
        </div>
      </div>
    );
  }
}

class RoomDialog extends React.Component {
  constructor(props) {
    super(props);
    const params = queryString.parse(location.hash.split("?")[1])
    this.options = JSON.parse(params.options)
    this.options.mode = this.options.invitationCode ? "join" : "create"
    this.state = {
      participantClient: undefined,
      masterClient: undefined,
      errored: false,
    }
    this.checkClient = this.checkClient.bind(this)
    this.checkingClient = false
  }

  async checkClient() {
    if (this.checkingClient) return
    this.checkingClient = true
    if (!this.options) return
    try {
      if (!this.options.invitationCode) {
        // making a new room
        const client = await desert.makeMasterClient(this.options.hostname)
        this.options.invitationCode = await client.createRoom()
        this.setState({masterClient: client})
      }
      if (this.state.participantClient === undefined) {
        const client = await desert.makeParticipantClient(this.options)
        client.onReceiveText = function(senderHello, text) {
          this.messenger.onReceiveText(senderHello, text)
        }.bind(this)
        client.onUserJoined = function(hello) {
          this.messenger.onUserJoined(hello)
          this.participantList.onUserJoined(hello)
        }.bind(this)
        client.onSelfJoined = function() {
          this.messenger.onSelfJoined()
          this.participantList.onSelfJoined()
        }.bind(this)
        await client.joinRoom(this.options.invitationCode)
        this.setState({participantClient: client})
      }
      this.setState({errored: false})
    } catch(err) {
      console.error(err)
      this.setState({errored: true, masterClient: undefined, participantClient: undefined})
      if (this.state.errored) {
        await new Promise(r => setTimeout(r, 2000))
      } else {
        common.handleError(err)
      }
    }
    this.checkingClient = false
  }

  render() {
    this.checkClient()
    return (
      <div style={{display: "flex", flexDirection: "row"}}>
        <div style={{width: 150}}>
          <ParticipantList ref={el => this.participantList = el} client={this.state.participantClient}/>
        </div>
        <div style={{}}>
          <Messenger ref={el => this.messenger = el} client={this.state.participantClient} invitationCode={this.options.invitationCode} mode={this.options.mode} options={this.options}/>
        </div>
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
