import React from 'react';

const color = {
  offBlack: "#333333",
  black: "black",
  white: "white",
  wine: "#370038",
  bad: "red",
  specialWine: "#73304a",
  text: "white",
  specialText: "#ffbff3",
  selfText: "#ade2ff",
}

// `identity` field is deprecated; just pass a hello or identity into `hello`
const userName = function(hello, identity) {
  hello = hello || {}
  if (hello && !identity && !hello.datagramSigningKey) {  // detects type of `hello`
    identity = hello
    hello = {}
  }
  identity = identity || {}
  return (hello.userProfile || {}).displayName || identity.displayName
    || ("anon " + Buffer.from(hello.datagramSigningKey || identity.datagramSignPair.publicKey).toString("hex").substr(0, 7))
}

const handleError = function(e) {
  e = e || "unknown error"
  console.error(e, e.stack)
  alert(e)
}

class ContextMenu extends React.Component {
  constructor(props) {
    super(props);
  }

	handleClick() {
	}

	render() {
    const { xPos, yPos } = this.props;
		if (xPos !== undefined && yPos !== undefined)
			return (
				<ul
          className="menu"
          onMouseLeave={() => {
            this.props.onMouseLeave()
          }}
          style={{
            position: "absolute",
              listStyle: "none",
              padding: 0,
              margin: 10,
              top: yPos,
              left: xPos,
              backgroundColor: color.white,
              color: color.black
          }}
        >
          {this.props.options.map(o => {
            return (
					    <li>{o}</li>
            )
          })} 
				</ul>
			);
		else return null;
	}
}

export default {
  c: color,
  color,
  userName,
  handleError,
  ContextMenu,
}
