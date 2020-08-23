import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow
import Dropdown from 'react-dropdown';
import 'react-dropdown/style.css';

const kNewId = "new"

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
      ids[id.uuid] = id
      const dropdownIds = this.state.dropdownIds
      dropdownIds.unshift({value: id.uuid, label: common.userName(undefined, id)})
      this.setState({ids, dropdownIds})
      console.log({id})
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
        width: 1000, height: 1000,
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
      console.log("joining room with options", options)
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

export default function Home(): JSX.Element {
  return (
    <div style={{backgroundColor: common.c.offBlack, position: "fixed", width: "100%", height: "100%", bottom: 0, left: 0}}>
      <JoinDialog />
    </div>
  );
}
