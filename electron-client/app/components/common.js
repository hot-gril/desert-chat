const color = {
  offBlack: "#333333",
  black: "black",
  white: "white",
  wine: "#370038",
  text: "white",
  specialText: "#ffbff3",
  selfText: "#ade2ff",
}

userName = function(hello, identity) {
  hello = hello || {}
  identity = identity || {}
  return (hello.userProfile || {}).displayName || identity.displayName
    || ("anon " + Buffer.from(hello.datagramSigningKey || identity.datagramSignPair.publicKey).toString("hex").substr(0, 7))
}

handleError = function(e) {
    console.error({e})
    alert(e)
}

module.exports = {
  c: color,
  color,
  userName,
  handleError,
}
