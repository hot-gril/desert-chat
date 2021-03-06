const protobuf = require("protobufjs");
const WebSocket = require('ws');
const readline = require('readline');
const uuid = require("uuid");
const util = require("util");
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");

const boolFlag = function(key, defaultValue) {
  const ret = process.env[key]
  if (ret === undefined) return defaultValue
  return ret
}
const DEBUG = boolFlag("DEBUG", false)
if (!DEBUG) {
  console.debug = function() {}
}

var myHostname = "desert-chat-dev.herokuapp.com:80"
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const inspect = function(obj) {
  return util.inspect(obj)
}

function newSocket() {
  return new Promise(function(resolve, reject) {
    const ws = new WebSocket(`ws://${myHostname}`, {
      perMessageDeflate: false
    });
    ws.on('open', function() {
      console.info("Connected to server " + myHostname)
      resolve(ws)
    })
  })
}

// abstract
class Client {
  constructor(proto, ws, hostname) {
    this.proto = proto
    this.ws = ws
    this.uuid = uuid.v4();
    this.hostname = hostname
    this.pendingRequests = {}
    this.c2sCounter = 0  // Client-to-server sequence number.
    this.c2cCounters = {}  // Map from destination channel ID to integer.
    this.datagramSignPair = nacl.sign.keyPair()
    this.signPair = nacl.box.keyPair()
    this.encryptPair = nacl.box.keyPair()
    this.dmChannelId = undefined

    this.ws.on('message', function(data) {
      const bytes = Array.prototype.slice.call(data, 0)
      const message = this.proto.server.C2sResponse.decode(bytes)
      console.debug(`${this.name()} rx from server: ${inspect(message)}`)
      if (message.incomingDatagram && this.isInitialized()) {
        this.handleC2C(message)
      } else {
        const f = this.pendingRequests[message.id]
        if (f === undefined) {
          console.warn(`${this.name()} ignoring unsolicited message from server`)
          return
        }
        delete this.pendingRequests[message.id]
        f(message)
      }
    }.bind(this))
  }

  isInitialized() {
    return this.dmChannelId !== undefined
  }

  checkInitialized() {
    if (!this.isInitialized()) throw "uninitialized"
  }

  async init() {
    console.info("Initializing client " + this.uuid)
    if (this.isInitialized()) return
    const dmChannelId = await this.createChannel()
    if (this.isInitialized()) return  // checks again in case of concurrent initialization
    this.dmChannelId = dmChannelId
    console.info("Finished initializing client " + this.uuid)
  }

  // for debugging
  name() {
    throw "unimplemented"
  }

  async handleC2C(message) {
    throw "unimplemented"
  }

  request(req, timeout) {
    timeout = timeout || 5000
    return new Promise(function(resolve, reject) {
      req.id = this.c2sCounter
      this.c2sCounter++
      this.pendingRequests[req.id] = resolve
      const buffer = this.proto.server.C2sRequest.encode(req).finish()
      console.debug(`${this.name()} tx to server ${inspect(req)}`)
      this.ws.send(buffer)
      setTimeout(reject, timeout)
    }.bind(this))
  }

  async createChannel(subscribe=undefined) {
    if (subscribe === undefined) subscribe = true
    const resp = await this.request(this.proto.server.C2sRequest.create({
      createChannel: this.proto.server.CreateChannelRequest.create({})
    }))
    if (subscribe) {
      await this.request(this.proto.server.C2sRequest.create({
        sub: this.proto.server.SubRequest.create({
          channelId: resp.createChannel.id 
        })
      }))
    }
    return resp.createChannel.id
  }

  async subscribeToChannel(id) {
    await this.request(this.proto.server.C2sRequest.create({
      sub: this.proto.server.SubRequest.create({
        channelId: id
      })
    }))
  }

  // `datagram` is a proto.client.Datagram,
  //   will be mutated to contain nonce, seq number, and participant uuid
  //   then wrapped in a SignedDatagram
  async sendC2C({
    // Exactly one of the following must be defined.
    // If symmetricKey, uses nacl.secretbox symmetric key crypto.
    // If encryptionKey, uses nacl.box asymmetric key crypto.
    symmetricKey,
    encryptionKey,

    channelId,
    hostname,
    datagram,  // proto.client.Datagram
    includeIdentity
  }) {
    this.checkInitialized()
    if (this.c2cCounters[channelId] === undefined) {
      this.c2cCounters[channelId] = 0
    }
    datagram.sequence_number = this.c2cCounters[channelId]
    this.c2cCounters[channelId] += 1
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    datagram.nonce = nonce
    const datagramBytes = this.proto.client.Datagram.encode(datagram).finish()
    const signature = nacl.sign.detached(datagramBytes, this.datagramSignPair.secretKey)
    const signedDatagram = this.proto.client.SignedDatagram.create({
      signature,
      datagram,
    })
    console.debug(`${this.name()} tx to another client: ${inspect(signedDatagram)}`)
    const signedDatagramBytes = this.proto.client.SignedDatagram.encode(signedDatagram).finish()
    var boxed
    if (symmetricKey) {
      boxed = nacl.secretbox(signedDatagramBytes, nonce, Buffer.from(symmetricKey))
    } else {
      boxed = nacl.box(signedDatagramBytes, nonce,
        Buffer.from(encryptionKey), Buffer.from(this.signPair.secretKey))
    }
    const c2sDatagram = this.proto.server.Datagram.create({
      dstHostname: hostname, nonce, payload: boxed, srcUuid: this.uuid,
      dstChannelId: channelId
    })
    if (includeIdentity) c2sDatagram.srcPublicSigningKey = this.signPair.publicKey
    await this.request(this.proto.server.C2sRequest.create({
      tx: this.proto.server.TxRequest.create({datagram: c2sDatagram})
    }))
  }
}

class RoomMasterClient extends Client {
  constructor(proto, ws, hostname) {
    super(proto, ws, hostname)
    this.hellos = {}  // Map from uuid to SignedDatagram containing hello.
    this.roomKey = undefined
    this.roomChannelId = undefined
  }

  hasRoom() { return this.roomChannelId != undefined }

  async createRoom() {
    this.checkInitialized()
    if (this.hasRoom()) throw "already controlling a room"
    const roomChannelId = await this.createChannel(false)
    this.roomChannelId = roomChannelId
    const invitationKey = nacl.randomBytes(16)
    const invitation = this.proto.client.RoomInvitation.create({
      dmChannelId: this.dmChannelId,
      dmHostname: this.hostname,
      dmSigningKey: this.signPair.publicKey,
      dmEncryptionKey: this.encryptPair.publicKey,
      invitationKey: invitationKey,
      // TODO add room profile
    })
    const invitationBytes = this.proto.client.RoomInvitation.encode(invitation).finish()
    return invitationBytes
  }

  name() {
    return `[RoomMasterClient ${this.uuid}]`
  }

  async handleC2C(message) {
    const pubSigningKey = Buffer.from(message.incomingDatagram.srcPublicSigningKey)
    const signedDatagramData = nacl.box.open(
      Buffer.from(message.incomingDatagram.payload),
      Buffer.from(message.incomingDatagram.nonce),
      pubSigningKey,
      this.encryptPair.secretKey)
    const sd =
      this.proto.client.SignedDatagram.decode(signedDatagramData)
    const datagram = sd.datagram
    console.debug(`${this.name()} rx from another client: ${inspect(datagram)}`)

    const hello = datagram.hello
    if (hello) {
      this.roomKey = nacl.randomBytes(nacl.secretbox.keyLength)
      const newMasterHello = this.proto.client.Datagram.create({
        masterHello: this.proto.client.MasterHello.create({
          roomKey: this.roomKey,
          roomChannelId: this.roomChannelId,
          participantHellos: Object.values(this.hellos),
        })
      })
      const oldMasterHello = this.proto.client.Datagram.create({
        masterHello: this.proto.client.MasterHello.create({
          roomKey: this.roomKey,
          roomChannelId: this.roomChannelId,
          participantHellos: [sd],
        })
      })
      await Promise.all([
        // All existing participants' hellos go to the new participant.
        this.sendC2C({channelId: hello.dmChannelId, hostname: hello.dmHostname,
          encryptionKey: hello.dmEncryptionKey, datagram: newMasterHello}),
        // Only the new participant's hello goes to the existing participants.
        Promise.all(Object.values(this.hellos).map(function(helloDg) {
          const hello = helloDg.datagram.hello
          return this.sendC2C({channelId: hello.dmChannelId, hostname: hello.dmHostname,
            encryptionKey: hello.dmEncryptionKey,
            datagram: oldMasterHello})
        }.bind(this)))
      ])
      this.hellos[hello.uuid] = sd
    }
  }
}

class RoomParticipantClient extends Client {
  constructor(proto, ws, hostname, userProfile) {
    super(proto, ws, hostname)
    this.userProfile = userProfile
    this.roomKeys = []  // From oldest to newest.
    this.roomProfile = undefined
    this.roomMasterPubSigningKey = undefined
    this.hellos = {}  // Map from uuid to Hello (different from RoomMasterClient's map).
  }

  async init() {
    await super.init()
    this.hello = this.proto.client.Hello.create({
      uuid: this.uuid,
      hostname: this.hostname,
      datagramSigningKey: this.datagramSignPair.publicKey,
      dmSigningKey: this.signPair.publicKey,
      dmEncryptionKey: this.encryptPair.publicKey,
      dmChannelId: this.dmChannelId,
      userProfile: this.userProfile,
    })
    this.hellos[this.uuid] = this.hello
  }

  isInRoom() {
    const ret = (this.roomKeys.length > 0) && this.roomChannelId
    return ret
  }

  displayName(hello) {
    // TODO differentiate between identical names
    return (hello.userProfile || {}).displayName || "anon"
  }

  name() {
    return `[RoomParticipantClient ${this.uuid}]`
  }

  async handleC2C(message) {
    const srcUuid = message.incomingDatagram.srcUuid
    var datagram
    try {
      if (message.incomingDatagram.dstChannelId == this.dmChannelId) {
        // Assumed to be from room master.
        const sdd = nacl.box.open(
          Buffer.from(message.incomingDatagram.payload),
          Buffer.from(message.incomingDatagram.nonce),
          this.roomMasterPubSigningKey,
          this.encryptPair.secretKey)
        const sd =
          this.proto.client.SignedDatagram.decode(sdd)
        // We don't check the inner signature because room master messages only
        // come through the room master channel.
        datagram = sd.datagram
      } else {
        if (!this.isInRoom()) {
          console.warn(`${this.name()} received a room message while not in a room; ignoring`)
          return
        }

        // Assumed to be from another client in the room.
        const senderHello = this.hellos[srcUuid]
        if (senderHello === undefined) {
          throw "unknown sender"
        }
        var dd = undefined
        const payload = Buffer.from(message.incomingDatagram.payload)
        const nonce = Buffer.from(message.incomingDatagram.nonce)
        for (let roomKey of this.roomKeys.slice().reverse()) {
          try {
            dd = nacl.secretbox.open(payload, nonce, roomKey)
          } catch(err) {}
          if (dd) break
        }
        if (dd === undefined) throw "unable to decrypt message"
        const sd =
          this.proto.client.SignedDatagram.decode(dd)
        const dg = sd.datagram
        const dgb = this.proto.client.Datagram.encode(dg).finish()
        if (!nacl.sign.detached.verify(
          dgb,
          Buffer.from(sd.signature),
          Buffer.from(senderHello.datagramSigningKey))) {
          throw "invalid client signature"
        }
        datagram = dg
      }
    } catch(err) {
      console.warn(`${this.name()} ignoring C2C message: ${err}\nstack: ${err.stack}`)
      return
    }

    console.debug(`${this.name()} rx from another client: ${inspect(datagram)}`)
    if (datagram.masterHello) {
      for (let sd of datagram.masterHello.participantHellos) {
        const dg = sd.datagram
        const hello = dg.hello
        const dge = this.proto.client.Datagram.encode(dg).finish()
        if (!nacl.sign.detached.verify(dge, sd.signature, hello.datagramSigningKey)) {
          console.warn(`${this.name()} ignoring signed hello datagram with invalid signature: ${sd}`)
          continue
        }
        if (this.hellos[hello.uuid] === undefined) {
          this.hellos[hello.uuid] = hello
        }
      }
      this.roomProfile = datagram.masterHello.roomProfile
      this.roomKeys.push(Buffer.from(datagram.masterHello.roomKey))
      this.roomChannelId = datagram.masterHello.roomChannelId
      await this.subscribeToChannel(this.roomChannelId)
    }
    else if (datagram.text) {
      const senderHello = this.hellos[srcUuid]
      console.info(`${this.name()} message from ${this.displayName(senderHello)}: ${datagram.text.body}`)
    }
  }

  async joinRoom(invitationCode) {
    this.checkInitialized()
    if (this.isInRoom()) throw "already in a room"
    const invitationBytes = naclUtil.decodeBase64(invitationCode)
    const invitationProto = this.proto.client.RoomInvitation.decode(invitationBytes)
    this.roomInvitation = invitationProto
    this.roomMasterPubSigningKey = Buffer.from(invitationProto.dmSigningKey)
    const datagram = this.proto.client.Datagram.create({
      hello: this.hello,
    })
    await this.sendC2C({channelId: invitationProto.dmChannelId,
      hostname: invitationProto.dmHostname,
      encryptionKey: invitationProto.dmEncryptionKey, datagram,
      includeIdentity: true})
  }

  async sendMessage(body) {
    this.checkInitialized()
    if (!this.isInRoom()) throw "not in a room"
    const datagram = this.proto.client.Datagram.create({
      text: this.proto.client.Text.create({body}),
    })
    await this.sendC2C({
      channelId: this.roomChannelId,
      hostname: this.hostname,
      symmetricKey: this.roomKeys[this.roomKeys.length - 1],
      datagram,
      includeIdentity: false})
  }
}

const ClientLoop = async function(ctx) {
  var participants = {}
  var roomMasters = {}
  var userProfile
  const handle = async function(spl) {
    if (spl.length < 1 || spl[0] == "help") {
      console.log("The commands are setName, createRoom, joinRoom. Read the src code.")
    }
    else if (spl[0] == "setName") {
      if (spl.length != 2) {
        console.log("Usage: setName [name]")
        return
      }
      userProfile = ctx.proto.client.UserProfile.create({displayName: spl[1]})
      for (let client of Object.values(participants)) {
        client.userProfile = userProfile
        // TODO send hello again
      }
      console.log("Set name to \"" + spl[1] + "\"")
    }
    else if (spl[0] == "createRoom") {
      if (spl.length != 1) {
        console.log("Usage: createRoom")
        return
      }
      const client = new RoomMasterClient(ctx.proto, await newSocket(), myHostname)
      await client.init()
      roomMasters[client.uuid] = client
      const roomCode = await client.createRoom()
      const client2 = new RoomParticipantClient(ctx.proto, await newSocket(), myHostname)
      await client2.init()
      participants[client2.uuid] = client2
      const roomCode64 = naclUtil.encodeBase64(roomCode)
      await client2.joinRoom(roomCode64)
      console.log("Created room. Invitation code:", roomCode64)
    }
    else if (spl[0] == "sendMessage") {
      if (spl.length != 2) {
        console.log("Usage: sendMessage [message]")
        return
      }
      if (Object.keys(participants).length != 1) {
        // TODO
        console.log("Must be in exactly one room")
        return
      }
      var client
      for (let c of Object.values(participants)) client = c
      client.sendMessage(spl.slice(1, spl.length).join(" "))
    }
    else if (spl[0] == "joinRoom") {
      if (spl.length != 2) {
        console.log("Usage: joinRoom [invitation code]")
        return
      }
      const client = new RoomParticipantClient(ctx.proto, await newSocket(), myHostname)
      await client.init()
      participants[client.uuid] = client
      await client.joinRoom(spl[1])
    }
    else {
      console.log("The commands are createRoom and joinRoom. Read the src code.")
    }
  }

  const prompt = async function() {
    rl.question("#> ", async (cmd) => {
      const spl = cmd.split(" ")
      await handle(spl)
      prompt()
    })
  }
  prompt()
}

const main = async function() {
  console.info("Client starting")

  const serverRoot = await protobuf.load("../proto/server.proto")
  const clientRoot = await protobuf.load("../proto/client.proto")
  const proto = {
    client: {
      root: clientRoot,
      UserProfile: clientRoot.lookupType("desert.client.UserProfile"),
      RoomProfile: clientRoot.lookupType("desert.client.RoomProfile"),
      Hello: clientRoot.lookupType("desert.client.Hello"),
      MasterHello: clientRoot.lookupType("desert.client.MasterHello"),
      Text: clientRoot.lookupType("desert.client.Text"),
      Datagram: clientRoot.lookupType("desert.client.Datagram"),
      SignedDatagram: clientRoot.lookupType("desert.client.SignedDatagram"),
      RoomInvitation: clientRoot.lookupType("desert.client.RoomInvitation"),
    },
    server: {
      root: serverRoot,
      C2sRequest: serverRoot.lookupType("desert.server.C2sRequest"),
      C2sResponse: serverRoot.lookupType("desert.server.C2sResponse"),
      CreateChannelRequest: serverRoot.lookupType("desert.server.CreateChannelRequest"),
      CreateChannelResponse: serverRoot.lookupType("desert.server.CreateChannelResponse"),
      TxRequest: serverRoot.lookupType("desert.server.TxRequest"),
      TxResponse: serverRoot.lookupType("desert.server.TxResponse"),
      SubRequest: serverRoot.lookupType("desert.server.SubRequest"),
      SubResponse: serverRoot.lookupType("desert.server.SubResponse"),
      UnsubRequest: serverRoot.lookupType("desert.server.UnsubRequest"),
      UnsubResponse: serverRoot.lookupType("desert.server.UnsubResponse"),
      Datagram: serverRoot.lookupType("desert.server.Datagram"),
    }
  }
  console.debug("loaded proto")

  ClientLoop({proto})
}
main()
