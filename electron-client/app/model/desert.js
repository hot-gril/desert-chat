const protobuf = require("protobufjs");
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const {PubSub} = require('./pubsub')


const DEBUG = true//false
function debug() {
  if (!DEBUG) return
  console.debug(...arguments)
}

const inspect = function(obj) {
  return JSON.stringify(obj)
}

function newSocket(hostname) {
  return new Promise(function(resolve, reject) {
    const ws = new WebSocket(`ws://${hostname}`);
    ws.onopen = function() {
      console.info("Connected to server " + hostname)
      resolve(ws)
    }
  })
}

const setJsonSerialization = function(keyPair) {
  keyPair.toJSON = function(_) {
    return {
      publicKey: Array.from(keyPair.publicKey),
      secretKey: Array.from(keyPair.secretKey),
    }
  }.bind(keyPair)
}

const newSignKeyPair = function() {
  const ret = nacl.sign.keyPair()
  setJsonSerialization(ret)
  return ret
}

const newBoxKeyPair = function() {
  const ret = nacl.box.keyPair()
  setJsonSerialization(ret)
  return ret
}

// Returns a key that unique identifies a hello or local identity
const helloId = function(hello) {
  var key = hello.datagramSigningKey
  if (!key) key = hello.datagramSignPair.publicKey
  return naclUtil.encodeBase64(key)
}

// abstract
class Client {
  constructor(proto, ws, hostname, options) {
    options = options || {}
    this.options = options
    this.proto = proto
    this.ws = ws
    this.hostname = hostname
    this.pendingRequests = {}
    this.c2sCounter = 0  // Client-to-server sequence number.
    this.c2cCounters = {}  // Map from destination channel ID to integer.
    this.signPair = newBoxKeyPair()
    this.encryptPair = newBoxKeyPair()
    this.dmChannelId = undefined
    this.identity = options.identity || makeIdentity()
    this.identity.datagramSignPair.publicKey = new Uint8Array(this.identity.datagramSignPair.publicKey)
    this.identity.datagramSignPair.secretKey = new Uint8Array(this.identity.datagramSignPair.secretKey)
    setJsonSerialization(this.identity.datagramSignPair)
    this.pubsub = new PubSub()
  }

  isInitialized() {
    return this.dmChannelId !== undefined
  }

  checkInitialized() {
    if (!this.isInitialized()) throw "uninitialized"
  }

  async init() {
    console.info("Initializing client " + helloId(this.identity))
    this.ws.onmessage = async function(event) {
      const data = event.data
      const bytes = new Uint8Array(await data.arrayBuffer())
      const message = this.proto.server.C2sResponse.decode(bytes)
      debug(`${this.name()} rx from server: ${inspect(message)}`)
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
    }.bind(this)
    if (this.isInitialized()) return
    const dmChannelId = await this.createChannel()
    if (this.isInitialized()) return  // checks again in case of concurrent initialization
    this.dmChannelId = dmChannelId
    console.info("Finished initializing client " + helloId(this.identity))
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
      debug(`${this.name()} tx to server ${inspect(req)}`)
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
  //   will be mutated to contain nonce and seq number
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
    const signature = nacl.sign.detached(datagramBytes, this.identity.datagramSignPair.secretKey)
    const signedDatagram = this.proto.client.SignedDatagram.create({
      signature,
      datagram,
    })
    debug(`${this.name()} tx to another client: ${inspect(signedDatagram)}`)
    const signedDatagramBytes = this.proto.client.SignedDatagram.encode(signedDatagram).finish()
    var boxed
    if (symmetricKey) {
      boxed = nacl.secretbox(signedDatagramBytes, nonce, Buffer.from(symmetricKey))
    } else {
      boxed = nacl.box(signedDatagramBytes, nonce,
        Buffer.from(encryptionKey), Buffer.from(this.signPair.secretKey))
    }
    const c2sDatagram = this.proto.server.Datagram.create({
      dstHostname: hostname, nonce, payload: boxed, srcUuid: helloId(this.identity),
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
    this.invitationKey = undefined
    this.roomProfile = undefined
  }

  hasRoom() { return this.roomChannelId != undefined }

  async createRoom(roomProfile) {
    this.checkInitialized()
    if (this.hasRoom()) throw "already controlling a room"
    const roomChannelId = await this.createChannel(false)
    this.roomChannelId = roomChannelId
    this.roomProfile = roomProfile ? this.proto.client.RoomProfile.create(roomProfile) : undefined,
    console.log({roomProfile, this_roomProfile: this.roomProfile})
    this.invitationKey = nacl.randomBytes(16)
    const invitation = this.proto.client.RoomInvitation.create({
      dmChannelId: this.dmChannelId,
      dmHostname: this.hostname,
      dmSigningKey: this.signPair.publicKey,
      dmEncryptionKey: this.encryptPair.publicKey,
      invitationKey: this.invitationKey,
    })
    this.invitationProto = invitation
    const invitationBytes = this.proto.client.RoomInvitation.encode(invitation).finish()
    this.pubsub.pub("selfJoined", {})
    return naclUtil.encodeBase64(invitationBytes)
  }

  name() {
    return `[RoomMasterClient ${helloId(this.identity)}]`
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
    debug(`${this.name()} rx from another client: ${inspect(datagram)}`)

    const hello = datagram.hello
    if (hello) {
      if ("" + hello.invitationKey != "" + this.invitationKey) {
        debug(`${this.name()} ignoring hello with mismatched invitation key`, {expected: this.invitationKey, actual: hello.invitationKey})
        return
      }
      this.roomKey = nacl.randomBytes(nacl.secretbox.keyLength)
      const newMasterHello = this.proto.client.Datagram.create({
        masterHello: this.proto.client.MasterHello.create({
          roomKey: this.roomKey,
          roomChannelId: this.roomChannelId,
          participantHellos: Object.values(this.hellos),
          roomProfile: this.roomProfile,
        })
      })
      const oldMasterHello = this.proto.client.Datagram.create({
        masterHello: this.proto.client.MasterHello.create({
          roomKey: this.roomKey,
          roomChannelId: this.roomChannelId,
          participantHellos: [sd],
          roomProfile: this.roomProfile,
        })
      })
      console.log("masterhello roomProfile", this.roomProfile, {newMasterHello, oldMasterHello})
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
      this.hellos[helloId(hello)] = sd
      this.pubsub.pub("userJoined", {hello})
    }
  }
}

class RoomParticipantClient extends Client {
  constructor(proto, options) {
    super(proto, null, null, options)
    this.roomKeys = []  // From oldest to newest.
    this.roomProfile = undefined
    this.roomMasterPubSigningKey = undefined
    this.hellos = {}  // Map from uuid to Hello (different from RoomMasterClient's map).
    this.messages = []
    this.masterClient = undefined
    this.invitationProto = undefined
  }

  async init() {
    await super.init()
    const userProfile = this.proto.client.UserProfile.create({
      displayName: (this.options.identity || {}).displayName,
    })
    this.hello = this.proto.client.Hello.create({
      hostname: this.hostname,
      datagramSigningKey: this.identity.datagramSignPair.publicKey,
      dmSigningKey: this.signPair.publicKey,
      dmEncryptionKey: this.encryptPair.publicKey,
      dmChannelId: this.dmChannelId,
      userProfile: userProfile,
    })
    this.hellos[helloId(this.hello)] = this.hello
  }

  isInRoom() {
    const ret = (this.roomKeys.length > 0) && this.roomChannelId
    return ret
  }

  displayName(hello) {
    // TODO differentiate between identical names
    return (hello.userProfile || {}).displayName || "anon"
  }

  helloId() {
    return helloId(this.identity)    
  }

  name() {
    return `[RoomParticipantClient ${this.helloId()}]`
  }

  onReceiveText(senderHello, text) {
    console.info(`${this.name()} message from ${this.displayName(senderHello)}: ${text.body}`)
    this.pubsub.pub("receivedText", {senderHello, text})
  }

  onReceiveVideo(senderHello, video) {
    console.info(`${this.name()} video buffer from ${this.displayName(senderHello)}`)
    this.pubsub.pub("receivedVideo", {senderHello, video})
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

    debug(`${this.name()} rx from another client: ${inspect(datagram)}`)
    if (datagram.masterHello) {
      for (let sd of datagram.masterHello.participantHellos) {
        const dg = sd.datagram
        const hello = dg.hello
        const dge = this.proto.client.Datagram.encode(dg).finish()
        if (!nacl.sign.detached.verify(dge, sd.signature, hello.datagramSigningKey)) {
          console.warn(`${this.name()} ignoring signed hello datagram with invalid signature: ${sd}`)
          continue
        }
        if (this.hellos[helloId(hello)] === undefined) {
          this.hellos[helloId(hello)] = hello
          this.pubsub.pub("userJoined", {hello})
        }
      }
      this.roomProfile = datagram.masterHello.roomProfile
      this.roomKeys.push(Buffer.from(datagram.masterHello.roomKey))
      const wasInRoom = this.isInRoom()
      this.roomChannelId = datagram.masterHello.roomChannelId
      await this.subscribeToChannel(this.roomChannelId)
      if (!wasInRoom) {
        this.pubsub.pub("selfJoined", {})
      }
    }
    else if (datagram.text) {
      const senderHello = this.hellos[srcUuid]
      this.onReceiveText(senderHello, datagram.text)
    } else if (datagram.video) {
      const senderHello = this.hellos[srcUuid]
      this.onReceiveVideo(senderHello, datagram.video)
    }
  }

  async joinRoom(invitationCode) {
    if (this.isInRoom()) throw "already in a room"
    var invitationProto
    if (invitationCode.constructor != String) {
      invitationProto = invitationCode
    } else {
      const invitationBytes = naclUtil.decodeBase64(invitationCode)
      invitationProto = this.proto.client.RoomInvitation.decode(invitationBytes)
    }
    this.invitationProto = invitationProto
    this.hostname = invitationProto.dmHostname
    this.ws = await newSocket(this.hostname)
    this.roomMasterPubSigningKey = Buffer.from(invitationProto.dmSigningKey)
    await this.init()
    this.hello.invitationKey = this.invitationProto.invitationKey
    const datagram = this.proto.client.Datagram.create({
      hello: this.hello,
    })
    await this.sendC2C({channelId: invitationProto.dmChannelId,
      hostname: invitationProto.dmHostname,
      encryptionKey: invitationProto.dmEncryptionKey, datagram,
      includeIdentity: true})
  }

  async sendText(body) {
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

  async sendVideo(buffer) {
    this.checkInitialized()
    if (!this.isInRoom()) throw "not in a room"
    const datagram = this.proto.client.Datagram.create({
      video: this.proto.client.Video.create({buffer}),
    })
    await this.sendC2C({
      channelId: this.roomChannelId,
      hostname: this.hostname,
      symmetricKey: this.roomKeys[this.roomKeys.length - 1],
      datagram,
      includeIdentity: false})
  }
}

const setup = async function() {
  console.debug("Loading proto definitions...")

  const serverRoot = await protobuf.load("./dist/proto/server.proto")
  const clientRoot = await protobuf.load("./dist/proto/client.proto")
  const proto = {
    client: {
      root: clientRoot,
      UserProfile: clientRoot.lookupType("desert.client.UserProfile"),
      RoomProfile: clientRoot.lookupType("desert.client.RoomProfile"),
      Hello: clientRoot.lookupType("desert.client.Hello"),
      MasterHello: clientRoot.lookupType("desert.client.MasterHello"),
      Text: clientRoot.lookupType("desert.client.Text"),
      Video: clientRoot.lookupType("desert.client.Video"),
      Datagram: clientRoot.lookupType("desert.client.Datagram"),
      SignedDatagram: clientRoot.lookupType("desert.client.SignedDatagram"),
      RoomInvitation: clientRoot.lookupType("desert.client.RoomInvitation"),
      SavedClient: clientRoot.lookupType("desert.client.SavedClient"),
      SavedMasterClient: clientRoot.lookupType("desert.client.SavedMasterClient"),
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
  console.debug("Done loading proto definitions.")
  return proto
}

var proto
async function makeParticipantClient(options) {
  if (!proto) proto = await setup()
  return new RoomParticipantClient(proto, options)
}
async function makeMasterClient(hostname) {
  if (!proto) proto = await setup()
  const client = new RoomMasterClient(proto, await newSocket(hostname), hostname)
  await client.init()
  return client
}
function makeIdentity() {
  return {
    displayName: "",
    datagramSignPair: newSignKeyPair(),
  }
}
async function baseClientToProto(client) {
  if (!proto) proto = await setup()
  const ret = proto.client.SavedClient.create({
    hostname: client.hostname,
    roomInvitation: client.invitationProto,
    datagramSignSecret: client.identity.datagramSignPair.secretKey,
    datagramSignPublic: client.identity.datagramSignPair.publicKey,
    userProfile: proto.client.UserProfile.create({displayName:
      client.identity.displayName}),
  })
  return ret
}
async function masterClientToProto(client) {
  if (!proto) proto = await setup()
  const ret = proto.client.SavedMasterClient.create({
    base: await baseClientToProto(client),
    masterHello: proto.client.Datagram.create({
      roomKey: client.roomKey,
      roomChannelId: client.roomChannelId,
      participantHellos: Object.values(client.hellos),
      roomProfile: client.roomProfile,
    }),
    dmChannelId: client.dmChannelId,
    dmSignSecret: client.signPair.secretKey,
    dmSignPublic: client.signPair.publicKey,
    dmEncryptSecret: client.encryptPair.secretKey,
    dmEncryptPublic: client.encryptPair.publicKey,
  })
  return ret
}
async function participantToObject(client) {
  if (!proto) proto = await setup()
  const client64 = naclUtil.encodeBase64(proto.client.SavedClient.encode(
  await baseClientToProto(client)).finish())
  var master64
  if (client.masterClient) {
    master64 = naclUtil.encodeBase64(proto.client.SavedMasterClient.
      encode(await masterClientToProto(client.masterClient)).finish())
  }
  const ret = {client64, master64}
  return ret
}
async function objectToParticipant(object) {
  if (!proto) proto = await setup()
  const clientPb = proto.client.SavedClient.decode(naclUtil.decodeBase64(object.client64))
  const datagramSignPair = {
      secretKey: clientPb.datagramSignSecret,
      publicKey: clientPb.datagramSignPublic,
  }
  console.debug("Loading participant...", clientPb)
  const client = await makeParticipantClient({identity: {
    displayName: clientPb.userProfile.displayName,
    datagramSignPair,
  }})
  client.hostname = clientPb.hostname
  client.datagramSignPair = datagramSignPair
  client.invitationProto = clientPb.roomInvitation
  if (!object.master64) {
    console.debug("Loaded participant", {proto: clientPb, client})
    return client
  }

  const masterPb = proto.client.SavedMasterClient.decode(naclUtil.decodeBase64(object.master64))
  console.debug("Loading master+participant...", {clientPb, masterPb})
  const base = masterPb.base
  const master = new RoomMasterClient(proto,
    await newSocket(base.hostname), base.hostname)
  master.dmChannelId = masterPb.dmChannelId
  master.signPair = {
    secretKey: masterPb.dmSignSecret,
    publicKey: masterPb.dmSignPublic,
  }
  master.encryptPair = {
    secretKey: masterPb.dmEncryptSecret,
    publicKey: masterPb.dmEncryptPublic,
  }
  master.roomChannelId = masterPb.masterHello.roomChannelId
  master.roomKey = masterPb.masterHello.roomKey
  master.invitationProto = base.roomInvitation
  master.invitationKey = base.roomInvitation.invitationKey
  master.roomProfile = masterPb.masterHello.roomProfile
  await master.init()
  await master.subscribeToChannel(master.dmChannelId)
  client.masterClient = master
  console.debug("Loaded master+participant", {proto: clientPb, client, masterPb})
  return client
}

module.exports = {
  makeParticipantClient,
  participantToObject,
  objectToParticipant,
  makeMasterClient,
  makeIdentity,
  helloId,
}
