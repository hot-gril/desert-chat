class RedisKvStore {
  constructor(redisClient) {
    this.redisClient = redisClient
  }

  set(k, v) {
    return new Promise(function(resolve, reject) {
      try {
        this.redisClient.set(k,
          JSON.stringify({v}),
          resolve)
      } catch(e) { reject(e) }
    })
  }

  get(k) {
    return new Promise(function(resolve, reject) {
      try {
        this.redisClient.get(k, function(str) {
          if (str == null) return null
          resolve(JSON.parse(str).v) 
        })
      } catch(e) { reject(e) }
    })
  }
}

module.exports = {
  RedisKvStore,
}

