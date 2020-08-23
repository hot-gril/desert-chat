const color = {
  offBlack: "#333333",
  black: "black",
  text: "white",
  specialText: "#ade2ff",
}

userName = function(hello, identity) {
  hello = hello || {}
  identity = identity || {}
  return (hello.userProfile || {}).displayName || identity.displayName
    || ("anon " + (hello.uuid || identity.uuid).substr(0, 7))
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
