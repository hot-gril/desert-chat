const colors = {
  offBlack: "#333333",
  black: "black",
  text: "white",
}

userName = function(hello, identity) {
  hello = hello || {}
  identity = identity || {}
  return (hello.userProfile || {}).displayName || identity.displayName
    || ("anon " + (hello.uuid || identity.uuid).substr(0, 7))
}

module.exports = {
  c: colors,
  userName,
}
