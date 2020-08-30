import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const common = require("./common")
const desert = require("../model/desert")
const global = require("../model/global")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import FlatList from 'flatlist-react';
const Split = require('react-split')
import Dropdown from 'react-dropdown';
import 'react-dropdown/style.css';

const kStoreIds = "identities"
const kStoreClients = "clients"

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
          height: 60,
            marginLeft: 5, marginRight: 5,
            padding: 10,
            userSelect: "none",
            opacity: this.props.selected ? 0.5 : (this.state.hover ? 0.8 : 1),
            backgroundColor: isNew ? common.color.specialWine : common.color.wine,
            borderColor: common.color.white,
            borderStyle: "solid",
            borderWidth: 1,
            //            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: isNew ? 50 : undefined,
            fontWeight: isNew ? "bold" : undefined,
        }}>
          {this.props.children}
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
      ids: {},
      dropdownIds: [],
      selectedIdentity: null,
      mode: "",
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
    var ids = {}
    try {
      ids = global.store.get(kStoreIds) || {}
    } catch(err) {
      handleError(`Couldn't load saved state: ${err}`)
      ids = {}
    }
    var tries = 0
    var dropdownIds
    while (tries < 2) {
      try {
        dropdownIds = Object.values(ids).map(function(id) {
          return {
            value: desert.helloId(id),
            label: common.userName(undefined, id),
          }
        })
        break
      } catch(err) {
        handleError(`Couldn't load saved state: ${err}`)
        ids = {}
        tries++
      }
    }
    this.setState({ids, dropdownIds})
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

  handleSubmit(event) {
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
      const ids = this.state.ids
      id = desert.makeIdentity()
      id.displayName = this.state.username
      ids[desert.helloId(id)] = id
      const dropdownIds = this.state.dropdownIds
      dropdownIds.unshift({value: desert.helloId(id), label: common.userName(undefined, id)})
      try {
        global.store.set(kStoreIds, ids)
      } catch(err) {
        common.handleError(`Failed to save: ${err}`)
      }
      this.setState({ids, dropdownIds})
    } else {
      id = this.state.ids[this.state.selectedIdentity.value]
    }
    this.joinRoom(invitationCode, id)
  }

  onSelectIdentity({value, label}) {
    this.setState({selectedIdentity: {value, label}})
  }

  async joinRoom(invitationCode, identity) {
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
        options.invitationCode = await masterClient.createRoom()
        client.masterClient = masterClient
        electron.clipboard.writeText(options.invitationCode)
        client.messages.push({
          senderHello: MessageList.kClientSender,
              text: {body: `Copied invitation code to clipboard: ${options.invitationCode}`},
        })
      }
      await client.joinRoom(options.invitationCode)
      if (this.props.onJoinRoom) {
        this.props.onJoinRoom(client)
      }
      this.setState({selectedIdentity: null, username: ""})
    } catch(e) {
      common.handleError(e)
    }
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
              <label>
                {"2. Choose an identity:"}
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
            <input style={{fontColor: this.state.invitationCode ? "green" : "grey", fontWeight: "bold", fontSize: 24, width: 100, height: 50, border: "none"}} type="submit" value={"Go"} disabled={this.state.mode == "join" && !this.state.invitationCode} />
          </form>)}
        </div>
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
      update: false
    }
  }

  renderItem(userHello, idx) {
    const isSelf = desert.helloId(userHello) == desert.helloId(this.props.client.identity)
    return (
      <li key={idx} style={{color : isSelf ? common.color.selfText : undefined, fontWeight: isSelf ? "bold" : undefined}}>
        {common.userName(userHello)}
      </li>
    )
  }

  renderSeparator(group, idx, groupLabel) {
    return (
      <br/>
    )
  }

  render() {
    return (
      <div style={{color: common.c.text}}>
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
              list={Object.values(this.props.client.hellos).sort(function(a, b) {
                if (desert.helloId(a) ==
                  desert.helloId(this.props.client.identity)) {
                  return -1
                }
                if (desert.helloId(b) ==
                desert.helloId(this.props.client.identity)) {
                  return 1 
                }
                const aName = common.userName(a)
                const bName = common.userName(b)
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
      roomName = (client.roomProfile || {}).displayName
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
        var nameList = others.slice(0, maxNames).map(common.userName).join(", ")
        if (others.length > maxNames) {
          roomName = nameList + ` + ${others.length - maxNames}`
        } else {
          roomName = nameList
        }
      }
    }

    const isSelected = idx == this.state.selectedIdx
    return (
      <li key={idx}>
        <RoomButton
          isNew={isNew}
          selected={!isNew && isSelected}
          onClick={() => {
            console.log(`clicked ${idx}`)
            this.setState({selectedIdx: idx})
            if (this.props.onSelect) {
              this.props.onSelect(parseInt((idx - 1) / 2))
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
    var right = ""
    if (isClient) {
      left = "~~ "
      right = " ~~"
      messageStyle = {
        color: common.color.specialText,
        fontStyle: "italic",
      }
      justifyContent = "flex-start"
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
              {left + msg.text.body + right}
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
    }
    this.messageList = undefined
    this.id = parseInt(Math.random() * 1000000)
  }

  async onSend(body) {
    console.log("onSend", {id: this.id,
      client: this.props.client.name()})
    await this.props.client.sendText(body) 
    this.props.client.messages.push({
      senderHello: MessageList.kSelfSender,
      text: {body},
    })
    this.setState({update: !this.state.update})
    if (this.messageList) {
      setTimeout(() => {
        this.messageList.scrollToBottom()
      })
    }
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
    }
  }

  componentDidMount() {
    global.store.set(kStoreClients, this.state.clients)   // TODO temp
    var clients = []
    try {
      clients = global.store.get(kStoreClients) || []
      console.debug("loaded clients", {clients})
    } catch(err) {
      common.handleError(`Failed to load rooms: ${err}`)
    }
    this.setState({clients})
  }

  onJoinRoom(client) {
    this.state.clients.unshift(client)
    try {
      global.store.set(kStoreClients, this.state.clients) 
    } catch(err) {
      common.handleError(`Failed to save rooms: ${err}`)
    }

    // TODO: optimize
    client.pubsub.sub("receivedText", function(e) {
      console.log("receivedText")
      client.messages.push(e)
      this.setState({update: !this.state.update})
    }.bind(this))
    client.pubsub.sub("userJoined", function(e) {
      console.log("userJoined")
      setTimeout(function() {
        this.setState({update: !this.state.update})
      }.bind(this), 100)
    }.bind(this))
    client.pubsub.sub("selfJoined", function(e) {
      console.log("selfJoined")
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

  render() {
    return (
      <div style={{display: "flex", width: "100%", height: "100%",
        fontFamily: "monospace", 
      }}>
        <div style={{flex: 1, backgroundColor: common.c.offBlack}}>
          <RoomList
            clients={this.state.clients}
            onSelect={(idx) => this.setState({selectedIdx: idx})}
            onPressNew={(idx) => this.setState({selectedIdx: undefined})}
          />
        </div>
        <div style={{flex: 8}}>
          {this.state.selectedIdx !== undefined && (<ChatView
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
