import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const queryString = require('query-string');
const common = require("./common")
const desert = require("../model/desert")
const electron = require("electron")
const BrowserWindow = electron.remote.BrowserWindow

class RoomDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: undefined,
    };
    this.handleError = this.handleError.bind(this)
    this.checkClient = this.checkClient.bind(this)
  }

  handleError(e) {
    alert(e)
  }

  async checkClient() {
    try {
    if (this.state.client === undefined) {
      const params = queryString.parse(location.hash.split("?")[1])
      const invitationCode = params.invitationCode.replaceAll(' ','')
      console.log("invitation code: " + invitationCode)
      const client = await desert.makeParticipantClient()
      await client.joinRoom(invitationCode)
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
      <div style={{width: "50%", backgroundColor: "green"}}>
          <form onSubmit={this.handleSubmit}>
              <label>
                {"test"}
                <div style={{width: "50%"}}>
                  <textarea value={this.state.invitationCode}
                    onChange={this.handleChange}/>
                </div>
              </label>
            <input type="submit" value="Submit" />
          </form>
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
