const color = {
  offBlack: "#333333",
  black: "black",
  white: "white",
  wine: "#370038",
  specialWine: "#73304a",
  text: "white",
  specialText: "#ffbff3",
  selfText: "#ade2ff",
}

// `identity` field is deprecated; just pass a hello or identity into `hello`
userName = function(hello, identity) {
  hello = hello || {}
  if (hello && !identity && !hello.datagramSigningKey) {  // detects type of `hello`
    identity = hello
    hello = {}
  }
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
