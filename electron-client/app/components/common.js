const colors = {
  offBlack: "#333333",
  text: "white",
}

userName = function(hello) {
  return (hello.user_profile || {}).display_name
    || "anon " + hello.uuid.substr(0, 7)
}

module.exports = {
  c: colors,
  userName,
}
