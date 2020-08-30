class PubSub {
  constructor() {
    this.subscribers = {}
  }

  sub(topic, f) {
    if (this.subscribers[topic] === undefined) {
      this.subscribers[topic] = []
    }
    this.subscribers[topic].push(f)
  }

  async pub(topic, event) {
    const subs = this.subscribers[topic]
    if (subs === undefined) return
    await Promise.all(subs.map(s => s(event)))
  }
}

module.exports = {PubSub}
