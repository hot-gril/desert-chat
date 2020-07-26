import React from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';
import styles from './Home.css';
const common = require("./common")

class Room extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      invitationCode: "",
    };
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange(event) {
    this.setState({invitationCode: event.target.value})
  }

  handleSubmit(event) {
    alert("submitted " + this.state.invitationCode)
    event.preventDefault()
  }

  render() {
    return (
      <div>
        <div style={{width: "50%"}}>
          <form onSubmit={this.handleSubmit}>
              <label>
                Invitation code:
                <div style={{width: "50%"}}>
                <textarea value={this.state.invitationCode} onChange={this.handleChange}/>
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
      <Room/>
    </div>
  );
}
