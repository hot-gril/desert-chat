import React from 'react';
import { Link } from 'react-router-dom';
const common = require("./common")
const desert = require("../model/desert")

export default class TextRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      client: null,
    };
    this.handleError = this.handleError.bind(this)
  }

  handleError(e) {
    alert(e)
  }

  render() {
    return (
      <div style={{backgrondColor: "green"}}>
      </div>
    );
  }
}
