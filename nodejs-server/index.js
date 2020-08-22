const WebSocket = require('ws');
const protobuf = require("protobufjs");
const uuid = require("uuid");
const util = require("util");

const DEBUG = false
const debug = function() {
  if (!DEBUG) return
  console.debug(arguments)
}

class Pubsub {
  constructor() {
    this._topics = {}  // topic -> clientId -> callback
    this._topic_seq = {}  // topic -> sequence_number
  }

  // f takes (message, sequence_number)
  sub(topic, clientId, f) {
    debug("sub", {topic, clientId})
    if (this._topics[topic] === undefined) {
      this._topics[topic] = {}
    }
    this._topics[topic][clientId] = f
  }

  unsub(topic, clientId) {
    debug("unsub", {topic, clientId})
    if (this._topics[topic]) {
      delete this._topics[topic][clientId]
    }
  }

  async pub(sender, topic, msg) {
    debug("pub", {topic, msg})
    if (this._topics[topic] === undefined) return
    const seq = this._topic_seq[topic] || 0
    this._topic_seq[topic] = seq + 1
    const clientToCallback = this._topics[topic]
    await Promise.all(Object.keys(clientToCallback).map(function(client) {
      if (client == sender) return
      clientToCallback[client](msg, seq)
    }))
  }
}

const pubsub = new Pubsub()

const verifyProto = function(type, proto) {
  const error = type.verify(proto) 
  if (error) throw error
}

const handleClient = async function(ws, proto) {
  const clientId = uuid.v4();
  debug("handleClient", {clientId})

  const topics = {}

  const tx = function(msg) {
    debug("tx", {clientId, msg})
    verifyProto(proto.C2sResponse, msg)
    const buffer = proto.C2sResponse.encode(msg).finish()
    ws.send(buffer)
  }

  const handlePubsubRx = async function(msg, seq) {
    debug("handlePubsubRx", {clientId, msg})
    const msgCopy = proto.Datagram.create(msg)
    msgCopy.sequenceNumber = seq
    const resp = proto.C2sResponse.create({
      incomingDatagram: msgCopy,
    })
    tx(resp)
  }

  ws.on("close", function() {
    debug("close", {clientId})
    for (let topic of Object.keys(topics)) {
      pubsub.unsub(topic, clientId)
    }
  })

  ws.on("message", function incoming(data) {
    var bytes = Array.prototype.slice.call(data, 0)
    var message = proto.C2sRequest.decode(bytes)
    debug("message", {clientId, message})

    if (message.createChannel) {
      const channelId = uuid.v4();
      topics[channelId] = true
      const response = proto.C2sResponse.create({
        id: message.id,
        createChannel: proto.CreateChannelResponse.create({id: channelId}),
      })
      tx(response)
    }
    else if (message.tx) {
      pubsub.pub(clientId, message.tx.datagram.dstChannelId, message.tx.datagram)
      const response = proto.C2sResponse.create({
        id: message.id,
        tx: proto.TxResponse.create({}),
      })
      tx(response)
    }
    else if (message.sub) {
      const channelId = message.sub.channelId
      topics[channelId] = true
      pubsub.sub(channelId, clientId, handlePubsubRx)
      const response = proto.C2sResponse.create({
        id: message.id,
        sub: proto.SubResponse.create({}),
      })
      tx(response)
    }
    else if (message.unsub) {
      const channelId = message.unsub.channelId
      pubsub.unsub(channelId, clientId)
      const response = proto.C2sResponse.create({
        id: message.id,
        unsub: proto.UnsubResponse.create({}),
      })
      tx(response)
    }
  })
}

const f = async function() {
  debug("starting")
  const root = await protobuf.load("../proto/server.proto")
  const proto = {
    root,
    C2sRequest: root.lookupType("desert.server.C2sRequest"),
    C2sResponse: root.lookupType("desert.server.C2sResponse"),
    CreateChannelRequest: root.lookupType("desert.server.CreateChannelRequest"),
    CreateChannelResponse: root.lookupType("desert.server.CreateChannelResponse"),
    TxRequest: root.lookupType("desert.server.TxRequest"),
    TxResponse: root.lookupType("desert.server.TxResponse"),
    SubRequest: root.lookupType("desert.server.SubRequest"),
    SubResponse: root.lookupType("desert.server.SubResponse"),
    UnsubRequest: root.lookupType("desert.server.UnsubRequest"),
    UnsubResponse: root.lookupType("desert.server.UnsubResponse"),
    Datagram: root.lookupType("desert.server.Datagram"),
  }
  debug("loaded proto")

	function noop() {}
	function heartbeat() {
		this.isAlive = true;
	}
	const wss = new WebSocket.Server({ port: process.env.PORT || 1453 });
  debug("started server")
  wss.on('connection', function connection(ws) {
    debug("New connection")
		ws.isAlive = true;
    ws.on('pong', heartbeat);
    handleClient(ws, proto)
	});
	const interval = setInterval(function ping() {
    debug("Checking for dead connections")
		wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) {
        debug("Cleaning up dead connection")
        return ws.terminate();
      }

			ws.isAlive = false;
			ws.ping(noop);
		});
	}, 30000);
	wss.on('close', function close() {
		clearInterval(interval);
	});
}


f()
