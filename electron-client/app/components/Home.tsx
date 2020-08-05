import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow

class JoinDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      invitationCode: "",
    }

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
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

  async joinRoom(code) {
    try {
      var win = new BrowserWindow({
        width: 400, height: 400,
        webPreferences: { nodeIntegration: true}
      } )
      win.invitationCode = code
      win.on('close', function () { win = null })
      win.loadURL(`file://${__dirname}/app.html#${routes.ROOM}?invitationCode=${encodeURIComponent(code)}`)
      win.show()
    } catch(e) {
      this.handleError(e)
    }
  }

  render() {
    return (
      <div>
        <div style={{width: "50%"}}>
          <form onSubmit={this.handleSubmit}>
              <label>
                Invitation code:
                <div style={{width: "50%"}}>
                  <textarea value={this.state.invitationCode}
                    onChange={this.handleChange}/>
                </div>
              </label>
            <input type="submit" value="Submit" />
          </form>
        </div>
      </div>
    );
  }
}

export default function Home(): JSX.Element {
  return (
    <div style={{backgroundColor: common.c.offBlack}}>
      <JoinDialog />
    </div>
  );
}
