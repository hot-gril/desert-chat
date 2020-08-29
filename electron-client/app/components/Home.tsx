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

const kNewId = "new"
const kIds = "identities"

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
    console.log({selected: this.props.selected})
    return (
      <div
        ref={el => this.button = el}
        onMouseEnter={() => this.setState({hover: true})}
        onMouseLeave={() => this.setState({hover: false})}
        className={this.state.fade ? 'fade' : ''}
        onClick={this.onClick.bind(this)}
        style={{
          height: 60,
            padding: 10,
            userSelect: "none",
            opacity: this.props.selected ? 0.5 : undefined,
            backgroundColor: isNew ? common.color.specialWine : common.color.wine,
            borderColor: common.color.white,
            borderStyle: "outset",
            borderWidth: 2,
            borderRadius: 20,
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
    const ids = global.store.get(kIds) || {}
    const dropdownIds = Object.values(ids).map(function(id) {
      return {
        value: desert.helloId(id),
        label: common.userName(undefined, id),
      }
    })
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
      global.store.set(kIds, ids)
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
      var win = new BrowserWindow({
        width: 2000, height: 1000,
        webPreferences: { nodeIntegration: true}
      } )
      win.on('close', function () { win = null })
      //win.loadURL(`file://${__dirname}/app.html#${routes.ROOM}?invitationCode=${encodeURIComponent(code)}`)
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
      console.debug("joining room with options", options)
      win.loadURL(`file://${electron.remote.app.getAppPath()}/app.html#${routes["ROOM"]}?options=${encodeURIComponent(JSON.stringify(options))}`)
      win.show()
      this.setState({selectedIdentity: null, username: ""})
    } catch(e) {
      this.handleError(e)
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
                <Dropdown options={[{value: kNewId, label: "Create new..."}].concat(this.state.dropdownIds)}
                  onChange={this.onSelectIdentity}
                  value={this.state.selectedIdentity}
      placeholder="Saved identities" />
  </label>
      {(this.state.selectedIdentity || {}).value == kNewId && (
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

class ParticipantList extends React.Component {
  constructor(props) {
    super(props);
    this.scrollView = undefined
    this.renderItem = this.renderItem.bind(this)
    this.renderSeparator = this.renderSeparator.bind(this)
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
              list={this.props.hellos.slice().sort(function(a, b) {
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
            this.setState({selectedIdx: idx})
            console.log(`clicked ${idx}`)
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
        <div ref={el => this.scrollView = el}
          style={{
            overflowY: "scroll",
            height: "100%",
          }}>
          <ul style={{listStyle: "none", margin: 0, padding: 0}}>
            <FlatList
              list={[RoomList.kNew, ...this.props.clients]}
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
              width: "100%",
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
            list={this.props.messages}
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

const testSelfKey = "self"
const testSelfClient = {identity: {datagramSigningKey: testSelfKey}}

const testMessages= [
  {senderHello: MessageList.kClientSender,
    text: {body: "message from client"}},
  {senderHello: {datagramSigningKey: "deadbeef"},
    text: {body: "message from other"}},
  {senderHello: MessageList.kClientSender,
    text: {body: "message from client"}},
  {senderHello: MessageList.kSelfSender,
    text: {body: "message from self"}},
  {senderHello: {datagramSigningKey: "a13de09"},
    text: {body: "message from other"}},
]
for (var i = 0; i < 100; i++) testMessages.push(testMessages[4])

const testHellos = [
  {datagramSigningKey: "cat"},
  {datagramSigningKey: "banana"},
  {datagramSigningKey: "apple"},
  {datagramSigningKey: testSelfKey},
]

const testRooms = [
  {...testSelfClient, hellos: [
    {datagramSigningKey: "cat"},
    {datagramSigningKey: testSelfKey},
  ]},
  {...testSelfClient, hellos: [
    {datagramSigningKey: "cat"},
    {datagramSigningKey: "banana"},
    {datagramSigningKey: "apple"},
    {datagramSigningKey: testSelfKey},
  ]},
  {...testSelfClient, hellos: [
    {datagramSigningKey: "cat"},
    {datagramSigningKey: "banana"},
    {datagramSigningKey: "orange"},
    {datagramSigningKey: "maserati"},
    {datagramSigningKey: "apple"},
    {datagramSigningKey: testSelfKey},
  ]},
]

class ChatView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
    }
  }

  render() {
    return (
      <div style={{display: "flex", width: "100%", height: "100%"}}>
        <div style={{flex: 8}}>
            <MessageList
              client={this.props.client}
              messages={testMessages}
            />
        </div>
        <div style={{flex: 1}}>
            <ParticipantList
              client={this.props.client}
              hellos={testHellos}
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
    }
  }

  render() {
    return (
      <div style={{display: "flex", width: "100%", height: "100%",
        fontFamily: "monospace", 
      }}>
        <div style={{flex: 1, backgroundColor: common.c.offBlack}}>
          <RoomList
            clients={testRooms}
          />
        </div>
        <div style={{flex: 8}}>
          <ChatView
            client={testSelfClient}
            hellos={testHellos}
          />
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
