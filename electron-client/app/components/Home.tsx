import React from 'react';
import routes from '../constants/routes.json';
import styles from './Home.css';
import common from "./common"
const desert = require("../model/desert")
const global = require("../model/global")
import PersistentState from "../model/saved";
const electron = require("electron")
import FlatList from 'flatlist-react';
import Dropdown from 'react-dropdown';
import 'react-dropdown/style.css';
import Loader from 'react-loader-spinner'
import "react-loader-spinner/dist/loader/css/react-spinner-loader.css"
const prompt = require('electron-prompt');

const kTimeoutMs = 5000
const pstate = new PersistentState()

class RoomButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hover: false,
    }
  }

  onClick() {
    this.props.onClick()
  }

  onDelete() {
    this.props.onDelete()
  }

  render() {
    const isNew = this.props.isNew
    return (
      <div
        ref={el => this.button = el}
        onMouseEnter={() => this.setState({hover: true})}
        onMouseLeave={() => this.setState({hover: false})}
        className={this.state.fade ? 'fade' : ''}
        onClick={this.onClick.bind(this)}
        style={{
          height: 70,
          width: 70,
            marginLeft: 5, marginRight: 5,
            padding: 10,
            userSelect: "none",
            opacity: this.props.selected ? 0.5 : (this.state.hover ? 0.8 : 1),
            backgroundColor: isNew ? common.color.specialWine : common.color.wine,
            borderColor: common.color.white,
            borderStyle: "solid",
            borderWidth: 2,
            borderRadius: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: "center",
            fontSize: isNew ? 50 : undefined,
            fontWeight: isNew ? "bold" : undefined,
        }}>
          {this.props.children}
          {this.state.hover && !this.props.isNew && (
          <div style={{backgroundColor: common.color.white, fontFamily: "sans-serif", color: common.color.black}}
            onClick={this.onDelete.bind(this)} 
          >{"X"}</div>) }
        </div>
    )
  }
}

class Title extends React.Component {
  render() {
    return (
      <div style={{
          borderWidth: 2,
          borderColor: common.color.white,
          textAlign: "center",
          fontSize: this.props.fontSize || 24,
      }}>
        {this.props.children}
      </div>
    )
  }
}

class JoinDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      invitationCode: "",
      username: "",
      hostname: "desert-chat-dev.herokuapp.com:80",
      roomName: "",
      ids: {},
      idsArray: [],
      dropdownIds: [],
      selectedIdentity: null,
      mode: "",
      loading: false,
    }

    this.handleChangeCode = this.handleChangeCode.bind(this)
    this.handleChangeHostname = this.handleChangeHostname.bind(this)
    this.handleChangeUsername = this.handleChangeUsername.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.joinRoom = this.joinRoom.bind(this)
    this.onSelectIdentity = this.onSelectIdentity.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  componentDidMount() {
    (async function() {
      const {ids, idsArray} = await pstate.getIds()
      var tries = 0
      var dropdownIds
      while (tries < 2) {
        try {
          dropdownIds = idsArray.map(function(id) {
            return {
              value: desert.helloId(id),
              label: common.userName(undefined, id),
            }
          })
          break
        } catch(err) {
          handleError(`Couldn't load saved state: ${err}`)
          ids = {}
          idsArray = []
          tries++
        }
      }
      this.setState({ids, idsArray, dropdownIds})
    }.bind(this))()
  }

  handleError(e) {
    alert(e)
  }

  handleChangeCode(event) {
    this.setState({invitationCode: event.target.value})
  }

  handleChangeHostname(event) {
    this.setState({hostname: event.target.value})
  }

  handleChangeUsername(event) {
    this.setState({username: event.target.value})
  }

  handleChangeRoomName(event) {
    this.setState({roomName: event.target.value})
  }

  async handleSubmit(event) {
    event.preventDefault()
    var invitationCode = null
    if (this.state.mode == "join") {
      invitationCode = (this.state.invitationCode || "").replaceAll(' ','')
      if (!invitationCode.endsWith("=")) {
        invitationCode = invitationCode + "="
      }
    } else if (this.state.mode != "create") {
      // shouldn't happen
      return
    }
    var id
    var username = this.state.username
    if (!this.state.selectedIdentity && !username) {
      username = "anon"
    }
    if (username) {
      const {ids, idsArray} = await pstate.getIds()
      id = desert.makeIdentity()
      id.displayName = this.state.username
      ids[desert.helloId(id)] = id
      idsArray.unshift(id)
      const dropdownIds = this.state.dropdownIds
      dropdownIds.unshift({value: desert.helloId(id), label: common.userName(undefined, id)})
      try {
        await pstate.save()
      } catch(err) {
        common.handleError(`Failed to save: ${err}`)
      }
      this.setState({ids, idsArray, dropdownIds})
    } else {
      id = this.state.ids[this.state.selectedIdentity.value]
    }
    this.joinRoom(invitationCode, id)
  }

  onSelectIdentity({value, label}) {
    this.setState({selectedIdentity: {value, label}})
  }

  async joinRoom(invitationCode, identity) {
    this.setState({loading: true})
    try {
      const options = {
        invitationCode,
        hostname: this.state.hostname,
        identity: {
          ...identity,
          datagramSignPair: {
            publicKey: Array.from(identity.datagramSignPair.publicKey),
            secretKey: Array.from(identity.datagramSignPair.secretKey),
          }
        },
      }
      const client = await desert.makeParticipantClient(options)
      if (!options.invitationCode) {
        const masterClient = await desert.makeMasterClient(options.hostname)
        options.invitationCode = await masterClient.createRoom({
          displayName: this.state.roomName ? this.state.roomName : undefined, 
        })
        client.masterClient = masterClient
        electron.clipboard.writeText(options.invitationCode)
      }
      await client.joinRoom(options.invitationCode)
      if (this.props.onJoinRoom) {
        this.props.onJoinRoom(client)
      }
      this.setState({selectedIdentity: null, username: ""})
    } catch(e) {
      common.handleError(e)
    }
    this.setState({loading: false})
  }

  render() {
    var createFontColor
    var joinFontColor
    if (this.state.mode == "create") {
      createFontColor = "green"
      joinFontColor = "grey"
    } else if (this.state.mode == "join") {
      createFontColor = "grey"
      joinFontColor = "green"
    }
    return (
      <div>
        <div style={{color: common.c.text, padding: 10, fontFamily: "sans-serif", fontSize: 24}}>
          <div style={{display: "flex", flexDirection: "row", justifyContent: "flex-start", alignItems: "center"}}>
          <form style={{width: 150}} onSubmit={() => this.setState({mode: "create"})}>
            <input style={{color: createFontColor, fontWeight: "bold", fontSize: 22, width: 150, height: 50, border: "none"}} type="submit" value="Create Room" />
          </form>
          <div style={{width: 10}}/>
          <div style={{}}>{"or"}</div>
          <div style={{width: 10}}/>
          <form style={{width: 150}} onSubmit={() => this.setState({mode: "join"})}>
            <input style={{color: joinFontColor, fontWeight: "bold", fontSize: 22, width: 150, height: 50, border: "none"}} type="submit" value="Join Room" />
          </form>
        </div>
          <br/>
          {this.state.mode && (<form onSubmit={this.handleSubmit}>
              {this.state.mode == "join" && ( 
                <label>
                  1. Paste the invitation code:
                  <div style={{display: "flex"}}>
                    <textarea style={{resize: "none", width: "100%", color: "blue"}}
                      placeholder="CiQ3YjVjNDFhNS05MDg5LTRiMDEtYTNmNC0wNjkxZGI3NzYwOWESFHN2bC56YWRpa2lhbi51czoxNDUzGiDd53BGHZgTcI9XHy0kg/5rD4M4iikhrAR6uQdoRq4UGiIgYPrRwuXSVAmleFwSNfLT3SvjfptsV0Tc58ByQsrHJCcqEP0YFYE0mexwJmiQuGyEGyw="
                      value={this.state.invitationCode}
                      onChange={this.handleChangeCode}/>
                  </div>
                </label>
              )}
              {this.state.mode == "create" && ( 
                <label>
                  1. Enter the server's address:
                  <div style={{display: "flex"}}>
                    <textarea style={{fontSize: 20, resize: "none", width: "100%", height: 30, color: "blue"}}
                      placeholder="desert-chat-dev.herokuapp.com:80"
                      value={this.state.hostname}
                      onChange={this.handleChangeHostname}/>
                  </div>
                </label>
              )}
              <br/>
              {this.state.mode == "create" && ( 
              <label>
                {"2. Optionally pick a room name:"}
                <div style={{display: "flex"}}>
                  <textarea style={{fontSize: 20, resize: "none", width: "100%", height: 30, color: "blue"}}
                    placeholder="By default, will be the participants' names"
                    value={this.state.roomName}
                    onChange={this.handleChangeRoomName.bind(this)}/>
                </div>
                  <br/>
              </label>
              )}
              <label>
                {(this.state.mode == "create" ? 3 : 2) + ". Choose an identity:"}
                <Dropdown options={[{value: JoinDialog.kNewId, label: "Create new..."}].concat(this.state.dropdownIds)}
                  onChange={this.onSelectIdentity}
                  value={this.state.selectedIdentity}
      placeholder="Saved identities" />
  </label>
      {(this.state.selectedIdentity || {}).value == JoinDialog.kNewId && (
              <label>
                <div style={{display: "flex"}}>
                  <input style={{fontSize: 24, resize: "none", width: "20%", color: "green"}}
                    type="text"
                    placeholder="anon"
                    value={this.state.username}
                    onChange={this.handleChangeUsername}/>
                </div>
              </label>
            )}
            <br/>
              {this.state.mode == "create" && ( 
              <label>
                <div style={{display: "flex"}}>
                  {"You will own this room, and others may only join while you're in it."}
                </div>
                <br/>
              </label>
              )}
            <input style={{fontColor: this.state.invitationCode ? "green" : "grey", fontWeight: "bold", fontSize: 24, width: 100, height: 50, border: "none"}} type="submit" value={"Go"} disabled={this.state.mode == "join" && !this.state.invitationCode} />
          </form>)}
        </div>
      {this.state.loading && (
        <div style={{display: "flex", alignItems: "center",
            justifyContent: "center"}}>
        <Loader
           type="TailSpin"
           color={common.color.white}
           height={100}
           width={100}
         />
       </div>
      )}
      </div>
    );
  }
}
JoinDialog.kNewId = "new"

class ParticipantList extends React.Component {
  constructor(props) {
    super(props);
    this.scrollView = undefined
    this.renderItem = this.renderItem.bind(this)
    this.renderSeparator = this.renderSeparator.bind(this)
    this.state = {
      update: false,
      menuX: undefined,
      menuY: undefined,
      selected: undefined,
    }
  }

  onClick(event, userHello) {
    event.preventDefault()
    event.stopPropagation()
    this.setState({
      menuX: event.clientX,
      menuY: event.clientY,
      selected: userHello,
    })
  }

  renderItem(userHello, idx) {
    const isSelf = desert.helloId(userHello) == desert.helloId(this.props.client.identity)
    return (
      <li key={idx} style={{color : isSelf ? common.color.selfText : undefined, fontWeight: isSelf ? "bold" : undefined}}>
        <div onClick={(e) => {
          this.onClick(e, userHello)
        }}>
          {this.props.client.userName(userHello)}
        </div>
      </li>
    )
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  render() {
    const client = this.props.client
    const selected = this.state.selected
    const selectedId = selected ? desert.helloId(selected) : undefined
    var menuOptions
    var menuMode
    if (selectedId == desert.helloId(client.identity)) {
      menuOptions = ["This is you"]
      menuMode = "self"
    } else if (client.isContact(selectedId)) {
      menuOptions = ["Remove contact", "Rename"]
      menuMode = "rm"
    } else if (selectedId) {
      menuOptions = ["Add contact"]
      menuMode = "add"
    } 

    return (
      <div style={{color: common.c.text}} onClick={() => {
        this.setState({menuX: undefined, menuY: undefined}) 
      }}>
        <common.ContextMenu
          xPos={this.state.menuX} yPos={this.state.menuY}
          onMouseLeave={() => {this.setState({
            menuX: undefined, menuY: undefined})}}
            options={menuOptions}
            onClick={
              async function(o) {
              this.setState({menuX: undefined, menuY: undefined})
              if (menuMode == "add") {
                const nickname = await prompt({
                    title: "Choose a nickname", 
                    value: client.userName(selected)
                  }, electron.window)
                  client.setContact(selectedId, nickname)
                  await pstate.save()
                  this.setState({update: !this.state.update})
                } else if (menuMode == "rm") {
                  if (o == "Remove contact") {
                    client.unsetContact(selectedId)
                    await pstate.save()
                  } else if (o == "Rename") {
                const nickname = await prompt({
                    title: "Choose a nickname", 
                    value: client.userName(selected)
                  }, electron.window)
                  client.setContact(selectedId, nickname)
                    await pstate.save()
                  this.setState({update: !this.state.update})
                }
              }
              }.bind(this)
            }
          />
        <Title fontSize={20}>
          {"Users"}
        </Title>
        <div ref={el => this.scrollView = el}
          style={{
            overflowY: "auto",
            height: "100%",
          }}>
          <ul style={{listStyle: "none", margin: 10, padding: 0}}>
            <FlatList
              list={Object.values(client.hellos).sort(function(a, b) {
                if (desert.helloId(a) ==
                  desert.helloId(client.identity)) {
                  return -1
                }
                if (desert.helloId(b) ==
                desert.helloId(client.identity)) {
                  return 1 
                }
                const aName = client.userName(a)
                const bName = client.userName(b)
                if (aName == bName) return 0
                return aName < bName ? -1 : 1
              }.bind(this))}
              renderItem={this.renderItem}
              groupOf={1}
              groupSeparator={this.renderSeparator}
              renderWhenEmpty={() => <div></div>}/> 
          </ul>
        </div>
      </div>
    );
  }
}

function getRoomName(client) {
  var roomName = (client.roomProfile || {}).displayName
  if (!roomName) {
    const maxNames = 3
    const others = Object.values(client.hellos)
      .filter(h => desert.helloId(h) !=
        desert.helloId(client.identity))
    others.sort(function(a, b) {
      const aName = common.userName(a)
      const bName = common.userName(b)
      if (aName == bName) return 0
      return aName < bName ? -1 : 1
    })
    others.unshift(client.identity)
    var nameList = others.slice(0, maxNames).map(client.userName.bind(client)).join(", ")
    if (others.length > maxNames) {
      roomName = nameList + ` + ${others.length - maxNames}`
    } else {
      roomName = nameList
    }
  }
  return roomName
}

class RoomList extends React.Component {
  constructor(props) {
    super(props);
    this.scrollView = undefined
    this.renderSeparator = this.renderSeparator.bind(this)
    this.state = {
      selectedIdx: null,
      update: false,
    }
  }

  renderItem(client, idx) {
    const isNew = client == RoomList.kNew
    var roomName
    if (isNew) {
      roomName = "+"
    } else {
      roomName = getRoomName(client)
    }

    const isSelected = idx == this.state.selectedIdx
    return (
      <li key={idx}>
        <RoomButton
          isNew={isNew}
          selected={!isNew && isSelected}
          onClick={() => {
            this.setState({selectedIdx: idx})
            if (this.props.onSelect) {
              this.props.onSelect(parseInt((idx - 1) / 2))
            }
          }}
          onDelete={() => {
            if (this.props.onDelete) {
              this.props.onDelete(parseInt((idx - 1) / 2))
            }
          }}
        >
          {roomName}
        </RoomButton>
      </li>
    )
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <div style={{height: 20}}/>
    )
  }

  render() {
    return (
      <div style={{color: common.c.text, height: "100%"}}>
        <div style={{overflowY: "scroll"}}>
          <Title>
            {"Rooms"}
          </Title>
        </div>
        <div style={{overflowY: "scroll"}}>
          <br/>
          <RoomButton
            isNew={true}
            selected={false}
            onClick={() => {
              this.setState({selectedIdx: undefined})
              if (this.props.onSelect) {
                this.props.onPressNew()
              }
            }}
          >
            {"+"}
          </RoomButton>
          <br/>
        </div>
        <div ref={el => this.scrollView = el}
          style={{
            overflowY: "scroll",
            height: "100%",
          }}>
          <ul style={{listStyle: "none", margin: 0, padding: 0}}>
            <FlatList
              list={this.props.clients}
              renderItem={this.renderItem.bind(this)}
              groupOf={1}
              groupSeparator={this.renderSeparator}
              renderWhenEmpty={() => <div></div>}/> 
          </ul>
        </div>
      </div>
    );
  }
}
RoomList.kNew = "new"

class MessageList extends React.Component {
  constructor(props) {
    super(props);
    this.scrollView = undefined
    this.scrollToBottom = this.scrollToBottom.bind(this)
    this.renderMessage = this.renderMessage.bind(this)
    this.renderSeparator = this.renderSeparator.bind(this)
    this.state = {
      update: false
    }
    this.id = parseInt(Math.random() * 1000000)
  }

  scrollToBottom() {
    if (!this.scrollView) return
    this.scrollView.scrollTop =
      this.scrollView.scrollHeight - this.scrollView.clientHeight
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  renderMessage(msg, idx) {
    var justify
    const isClient = (msg.senderHello === MessageList.kClientSender)
    const isSelf = !isClient &&
      (msg.senderHello === MessageList.kSelfSender ||
        desert.helloId(msg.senderHello) == desert.helloId(
          this.props.client.identity))
    var messageStyle
    var textAlign
    var justifyContent
    var left = ""
    if (isClient) {
      left = ""
      messageStyle = {
        color: common.color.specialText,
        fontStyle: "italic",
      }
      justifyContent = "center"
      textAlign = "center"
    } else if (isSelf) {
      messageStyle = {
        color: common.color.selfText,
      }
      justifyContent = "flex-end"
      textAlign = "right"
    } else {
      left = common.userName(msg.senderHello) + ": "
      justifyContent = "flex-start"
      textAlign = "left"
    }
    if (msg.sent !== undefined) {
      if (msg.failed) {
        messageStyle.color = common.color.bad
      } else if (!msg.sent) {
        messageStyle.fontStyle = "italic"
      }
    }
    return (
      <li key={idx}>
        <div style={{display: "flex", justifyContent}}>
          <span style={{
              wordWrap: "break-word",
              display: "block",
              textAlign,
              width: 500,//"100%",
              whiteSpace: "normal",
          }}>
            <span style={messageStyle}>
              {left + msg.text.body}
            </span>
          </span>
        </div>
      </li>
    )
  }

  render() {
    return (
      <div
        ref={el => this.scrollView = el}
        style={{
          overflowY: "scroll",
            overflowX: "hidden",
            height: "100%",
            width: "100%",
            color: common.c.text,
            fontSize: 22,
        }}>
        <ul style={{listStyle: "none", margin: 10, padding: 0}}>
          <FlatList
            list={this.props.client.messages}
            renderItem={this.renderMessage}
            groupOf={1}
            groupSeparator={this.renderSeparator}
            renderWhenEmpty={() => <div></div>}/> 
        </ul>
      </div>
    )
  }
}
MessageList.kClientSender = "client"
MessageList.kSelfSender = "self"

var testClients = []
for (var clientI = 0; clientI < 100; clientI++) {
  const selfId = "" + Math.random()
  const client = {
    datagramSigningKey: selfId,
    identity: {datagramSigningKey: selfId},
    hellos: {},
  }
  const hellos = [
    {datagramSigningKey: "alice"},
    {datagramSigningKey: "bob"},
    {datagramSigningKey: "carl"},
    {datagramSigningKey: "dave"},
  ].slice(0, clientI % 3 + 1)
  hellos.push({datagramSigningKey: selfId})
  for (let hello of hellos) {
    client.hellos[desert.helloId(hello)] = hello
  }
  client.messages = [
    {senderHello: MessageList.kClientSender,
      text: {body: "message from client"}},
    {senderHello: MessageList.kSelfSender,
      text: {body: "message from self"}},
  ]
  for (var messageI = 0; messageI < 100; messageI++) {
    client.messages.push({
      senderHello: hellos[parseInt(Math.random() * hellos.length)],
      text: {body: `my favorite number is ${parseInt(Math.random() * 100)}`}
    })
  }
  testClients.push(client)
}

class ComposerView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      text: "",
    }
    this.textInput = ""
  }

  handleChange(event) {
    this.setState({text: event.target.value})
  }

  send() {
    if (this.props.onSend) {
      this.props.onSend(this.state.text)
    }
    this.setState({text: ""})
  }

  render() {
    return (
      <form onSubmit={this.send.bind(this)}
        style={{display: "flex", width: "100%", height: "100%"}}>
        <div style={{height: "100%", flex: 1, display: "flex"}}>
          <input
            type="text"
            ref={el => this.textInput = el}
            style={{
              flex: 1,
                display: "flex",
              resize: "none",
                fontFamily: "monospace",
                fontSize: 24,
            }}
            value={this.state.text}
            onChange={this.handleChange.bind(this)}/>
        </div>
        <div
          onClick={this.send.bind(this)}
          style={{
            height: "100%",
            backgroundColor: common.color.specialWine,
            color: common.color.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 30
          }}>
          {"|Send|"}
        </div>
      </form>
    )
  }
}

class ChatView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      update: false,
      lastNotifiedOfFailedMessages: undefined,
    }
    this.messageList = undefined
    this.id = parseInt(Math.random() * 1000000)
    this.props.eventRope.subs.push(this.handleEvent.bind(this))
  }

  refreshMessages() {
    this.setState({update: !this.state.update})
    if (this.messageList) {
      setTimeout(() => {
        this.messageList.scrollToBottom()
      })
    }
  }

  handleEvent(name, event) {
    if (event.client.helloId() != this.props.client.helloId()) return
    if (name == "receivedText") {
      this.refreshMessages()
    }
  }

  sendClientMessage(body) {
    const msg = {
      senderHello: MessageList.kClientSender, text: {body},
    }
    this.props.client.messages.push(msg)
    this.refreshMessages()
  }

  notifyOfFailedMessages() {
    if (this.state.lastNotifiedOfFailedMessages
      || new Date() - this.state.lastNotifiedOfFailedMessages < 30000) {
      return
    }
    this.sendClientMessage(
      "Some messages have failed to send, but they might succeed later. Check your network connection.")
    this.setState({lastNotifiedOfFailedMessages: new Date()})
  }

  async onSend(body) {
    const msg = {
      senderHello: MessageList.kSelfSender,
      text: {body},
      failed: false,
    }
    setTimeout(function() {
      if (!msg.sent) msg.sent = false
      this.refreshMessages()
    }.bind(this), 500)
    this.props.client.messages.push(msg)
    this.refreshMessages()
    setTimeout(function() {
      if (!msg.sent) {
        msg.failed = true
        this.notifyOfFailedMessages()
      }
      this.refreshMessages()
    }.bind(this), kTimeoutMs)
    try {
      await this.props.client.sendText(body) 
      msg.sent = true
      msg.failed = false
    } catch(err) {
      common.handleError(err)
      msg.failed = true
      this.notifyOfFailedMessages()
    }
    this.refreshMessages()
  }

  render() {
    return (
      <div style={{display: "flex", width: "100%", height: "100%",
          flexDirection: "row"}}>
          <div style={{display: "flex", flex: 8, flexDirection: "column"}}>
            <div style={{flex: 8, height: 0}}>
              <MessageList
                ref={el => this.messageList = el}
                client={this.props.client}
              />
            </div>
            <div style={{height: 60, overflowY: "scroll"}}>
              <ComposerView
                onSend={this.onSend.bind(this)}
              />
            </div>
          </div>
          <div style={{flex: 1}}>
            <ParticipantList
              client={this.props.client}
            />
          </div>
        </div>
      )
  }
}

class HomeWindow extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedIdx: undefined,
      clients: [],
      update: false,
      loading: false,
    }
    this.eventRope = {subs: []}
  }

  pub(name, event) {
    for (let sub of this.eventRope.subs) {
      sub(name, event)
    }
  }

  componentDidMount() {
    (async function() {
      const {ids, idsArray} = await pstate.getIds();
      this.setState({loading: true})
      try {
        const clients = await pstate.getClients()
        var i = 0
        for (let client of clients) {
          if (client.invitationProto) {
            await client.joinRoom(client.invitationProto)
          }
          this.onJoinRoom(client, i == clients.length - 1)
          i++
        }
      } catch(err) {
        common.handleError(`Failed to load rooms: ${err}`)
      }
      this.setState({loading: false})
    }.bind(this))()
  }

  async saveClients() {
    try {
      await pstate.save(this.state.clients)
    } catch(err) {
      common.handleError(`Failed to save rooms: ${err}`)
    }
  }

  sendClientMessage(client, body) {
    const msg = {
      senderHello: MessageList.kClientSender, text: {body},
    }
    client.messages.push(msg)
    this.pub("receivedText", {client, e: msg})
  }

  joinRoomLoop(client, tries=1) {
    client.joinRoom(client.invitationProto)
    setTimeout(function() {
      if (!client.isInRoom()) {
        this.sendClientMessage(client,
          `Still haven't joined. Will retry in ${parseInt(kTimeoutMs * (tries + 1) / 1000)} seconds...`)
        this.joinRoomLoop(client, tries + 1)
      }
    }.bind(this), kTimeoutMs * tries)
  }

  onJoinRoom(client, save=true) {
    this.state.clients.unshift(client);
    if (save) {
      this.saveClients()
    }

    this.sendClientMessage(client, "Joining room...")
    setTimeout(function() {
      if (!client.isInRoom()) {
        this.sendClientMessage(client,
          "This is taking a while. Maybe the room owner is offline. We'll keep trying...")
        this.joinRoomLoop(client)
      }
    }.bind(this), kTimeoutMs)

    client.pubsub.sub("receivedText", function(e) {
      client.messages.push(e)
      this.pub("receivedText", {client, e})
    }.bind(this))
    client.pubsub.sub("userJoined", function(e) {
      this.pub("userJoined", {client, e})
      setTimeout(function() {
        this.setState({update: !this.state.update})
      }.bind(this), 100)
    }.bind(this))
    client.pubsub.sub("selfJoined", function(e) {
      this.pub("selfJoined", {client, e})
      this.sendClientMessage(client, "You're in!")
      if (client.masterClient) {
        this.sendClientMessage(client,
          `Copied invitation code to clipboard: ${client.masterClient.invitationCode}`)
      }
      setTimeout(function() {
        this.setState({update: !this.state.update})
      }.bind(this), 100)
    }.bind(this))

    this.setState({
      selectedIdx: 0,
      clients: this.state.clients,
      update: !this.state.update,
    })
  }

  onDelete(idx) {
    const client = this.state.clients[idx]
    if (confirm(`Are you sure you want to leave the room named "${getRoomName(client)}"?`)) {
      if (idx == this.state.selectedIdx) this.setState({selectedIdx: undefined})
      this.state.clients.splice(idx, 1)
      this.setState({clients: this.state.clients})
      this.saveClients()
    }
  }

  render() {
    return (
      <div style={{display: "flex", width: "100%", height: "100%",
        fontFamily: "monospace", 
      }}>
        {this.state.loading && (
          <div style={{display: "flex", alignItems: "center",
              justifyContent: "center", position: "absolute",
              width: "50%", height: "50%", left: "25%", top: "25%"}}>
          <Loader
             type="TailSpin"
             color={common.color.white}
             width="100%" height="100%"
           />
         </div>
        )}
        <div style={{width: 120, backgroundColor: common.c.offBlack}}>
          <RoomList
            clients={this.state.clients}
            onSelect={(idx) => {
              if (idx >= this.state.clients.length) { idx = undefined }
              this.setState({selectedIdx: idx})}
              }
            onDelete={function(idx) { this.onDelete(idx) }.bind(this)}
            onPressNew={(idx) => this.setState({selectedIdx: undefined})}
          />
        </div>
        <div style={{flex: 8}}>
          {this.state.selectedIdx !== undefined && (<ChatView
            eventRope={this.eventRope}
            client={this.state.clients[this.state.selectedIdx]}
          />)}
          {this.state.selectedIdx === undefined && (
            <JoinDialog
              onJoinRoom={this.onJoinRoom.bind(this)}
            />
          )}
        </div>
      </div>
    )
  }
}

export default function Home(): JSX.Element {
  return (
    <div style={{backgroundColor: common.c.black, position: "fixed", width: "100%", height: "100%", bottom: 0, left: 0}}>
      <HomeWindow/>
    </div>
  );
}
