const global = require("../model/global")
const desert = require("../model/desert")

const kStoreIds = "identities"
const kStoreClients = "clients"
const kStoreBackupIds = "backup_identities"
const kStoreBackupClients = "backup_clients"
const kSpinTime = 500

export default class PersistentState {
  constructor() {
    this._ids = undefined
    this._idsArray = undefined
    this._clients = undefined
    this._locked = false
  }

  _isLoaded() {
    return (this._clients !== undefined
      && this._idsArray !== undefined
      && this._ids !== undefined)
  }

  async _loadIfNeeded() {
    if (!this._isLoaded()) {
      await this.load()
    }
  }

  async load() {
    while (this._locked) {
      console.debug("Trying to load while locked! Sleeping.")
      await new Promise(r => setTimeout(r, kSpinTime))
    }
    if (this._isLoaded()) return
    this._locked = true
    try {
      var ids = {}
      var idsArray = global.store.get(kStoreIds)
      console.log({idsArray})
      idsArray = idsArray || []
      for (let id of idsArray) {
        id.datagramSignPair = {
          publicKey: new Uint8Array(id.datagramSignPair.publicKey),
          secretKey: new Uint8Array(id.datagramSignPair.secretKey),
        }
        ids[desert.helloId(id)] = id
      }
      console.debug("loaded ids", idsArray)
      this._ids = ids
      this._idsArray = idsArray

      var clients = global.store.get(kStoreClients) || []
      clients = await Promise.all(clients.map(desert.objectToParticipant))
      for (let client of clients) {
        console.log({client, id: ids[desert.helloId(client.identity)]})
        client.identity.contacts =
          (ids[desert.helloId(client.identity)] || {}).contacts || {}
      }
      clients.reverse()
      this._clients = clients
      console.trace("loaded persistent state", {clients, ids, idsArray})
    } catch(e) {
      this._locked = false
      throw e
    }
    this._locked = false
  }

  async save(clients=undefined) {
    while (this._locked) {
      console.debug("Trying to save while locked! Sleeping.")
      await new Promise(r => setTimeout(r, kSpinTime))
    }
    this._locked = true
    try {
      var old = global.store.get(kStoreIds)
      if (old) {
        global.store.set(kStoreBackupIds, old)
      }
      old = global.store.get(kStoreClients)
      if (old) {
        global.store.set(kStoreBackupClients, old)
      }

      await this._loadIfNeeded()
      if (clients !== undefined) {
        this._clients = clients
      }
      const clients2 = await Promise.all(
        this._clients.map(desert.participantToObject)
      )
      console.log("set", {kStoreIds, ids: this._idsArray})
      global.store.set(kStoreIds, this._idsArray)
      global.store.set(kStoreClients, clients2)
      console.trace("saved persistent state",
        {clients2, ids: this._idsArray})
    } catch(e) {
      this._locked = false
      throw e
    }
    this._locked = false
  }

  async getClients() {
    await this._loadIfNeeded()
    return this._clients
  }

  async getIds() {
    await this._loadIfNeeded()
    return {ids: this._ids, idsArray: this._idsArray}
  }
}
