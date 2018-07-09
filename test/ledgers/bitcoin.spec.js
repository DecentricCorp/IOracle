const expect = require('chai').expect
const btc = require('../../ledgers/bitcoin.js')
const PeerGroup = require('bitcoin-net').PeerGroup
const Params = require('webcoin-bitcoin').net

describe('Bitcoin', () => {
    describe('extract dict from JSON', () => {
        it('returns a dictionary of key-value pairs from the payload', () => {
            expect(btc.extractDictFromJSON('').keys().length == 0)
            const dict = btc.extractDictFromJSON('"key1":"value1","key2":"value2"')
            expect(dict['key1']).to.equal('value1')
            expect(dict['key2']).to.equal('value2')
        })
    })
    describe('add to mempool', () => {
        it('adds an address to the mempool unless it is already present', () => {
            expect(btc.addToMemPool('txnid')).to.true
            expect(btc.addToMemPool('txnid')).to.false
        })
    })
    describe('color int', () => {
        it('colors the number green if positive, red otherwise', () => {
            expect(btc.colorInt(-5)).to.equal('\u001b[31m-5\u001b[39m')
            expect(btc.colorInt(0)).to.equal('\u001b[31m0\u001b[39m')
            expect(btc.colorInt(5)).to.equal('\u001b[32m5\u001b[39m')
        })
    })
    describe('add and remove peers', () => {
        it('adds a peer to the list of existing peers if it is not yet in the list, and removes a peer if it is present', () => {
            expect(btc.connectedPeers).to.eql(['67.205.182.87'])
            const peer = new MockPeer(new MockSocket('012.345.678.910'))
            btc.addPeerToPeerList(peer)
            expect(btc.connectedPeers).to.eql(['67.205.182.87', '012.345.678.910'])
            btc.addPeerToPeerList(peer)
            expect(btc.connectedPeers).to.eql(['67.205.182.87', '012.345.678.910'])
            btc.removePeerFromPeerList(peer)
            expect(btc.connectedPeers).to.eql(['67.205.182.87'])
            btc.removePeerFromPeerList(peer)
            expect(btc.connectedPeers).to.eql(['67.205.182.87'])
        })
    })
    describe('add peer to relaying peer list', () => {
        it('adds the peer to the relayers if the peer is not already in the list', () => {
            const peer = new MockPeer(new MockSocket('012.345.678.910'))
            expect(btc.Relayers).to.eql(['104.198.89.77'])
            btc.addPeerToRelayingPeerList(peer)
            expect(btc.Relayers).to.eql(['104.198.89.77', '012.345.678.910'])
            btc.addPeerToRelayingPeerList(peer)
            expect(btc.Relayers).to.eql(['104.198.89.77', '012.345.678.910'])
        })
    })
    describe('reset peer connection', () => {

    })
    describe('subscribe to PubNub', () => { // TODO test actual PubNub service
        it('subscribes to a service channel and listens for status, message, and presence events', () => {
            const service = new MockPubNub()
            btc.subscribe(service)
            expect(service.subscription.channels).to.eql(['emblem_cart'])
            // expect(service.listener.status)
            // expect(service.listener.message)
            // expect(service.listener.presence)
        })
    })
    describe('publish to PubNub', () => { // TODO test actual PubNub service
        it('publishes a message with the payload to the service before logging the status/response', () => {
            const payload = {
                message: {
                    'body': 'message'
                },
                channel: 'emblem_cart',
                sendByPost: false,
                storeInHistory: false,
                meta: {
                    'body': 'meta'
                }
            }
            const service = new MockPubNub() // TODO test actual pubnub publishing w/integration test?
            var statusAndResponse = ''
            btc.publish(service, 'message', 'meta', (status, response) => statusAndResponse = '' + status + response)
            expect(service.publishedMessages[0]).to.eql(payload)
            expect(statusAndResponse).to.equal('undefinedundefined')
        })
    })
    describe('get PubNub history', () => {
        it('returns the specified items from the service history', () => {
            // expect(btc.getHistory()).to.equal('[[{"text":"hey"},{"text":"hey"},{"text":"hey2","txn_type":"purchase"},{"text":"hey2","txn_type":"purchase"},{"text":"hey"},{"text":"hey"},{"text":"Enter Message Here"},{"text":"HISTORY MESSAGE"}],"15308024924992581","15308147177087533"]')
        })
    })
    describe('remove stale addresses', () => {
        it('removes monitored addresses that are ready to timeout', () => {
            const originalPOIs = btc.POIs

            const time = Date.now()
            const pair1 = new btc.AddressTimeout('12345', time + 2000)
            const pair2 = new btc.AddressTimeout('67890', time + 4000)
            btc.POIs = [pair1.address, pair2.address]
            btc.AddressTimeouts = [pair1, pair2]

            expect(btc.removeStaleAddresses(time)).to.eql([pair1.address, pair2.address])

            expect(btc.removeStaleAddresses(time + 1999)).to.eql([pair1.address, pair2.address])

            expect(btc.removeStaleAddresses(time + 2000)).to.eql([pair2.address])

            expect(btc.removeStaleAddresses(time + 3000)).to.eql([pair2.address])

            expect(btc.removeStaleAddresses(time + 4000)).to.empty

            expect(btc.removeStaleAddresses(time + 4001)).to.empty

            btc.POIs = originalPOIs
        })
    })
})

class MockSocket {
    constructor(remoteAddress) {
        this.remoteAddress = remoteAddress
    }
}

class MockPeer {
    constructor(socket) {
        this.socket = socket
    }
}

class MockPubNub {
    constructor() {
        this.publishedMessages = []
    }
    addListener(listener) {
        this.listener = listener
    }
    subscribe(subscription) {
        this.subscription = subscription
    }
    publish(payload, cb) {
        this.publishedMessages.push(payload)
        cb()
    }
}

class MockStatus {
    constructor(affectedChannelGroups, affectedChannels, category, operation) {
        this.affectedChannelGroups = affectedChannelGroups
        this.affectedChannels = affectedChannels
        this.category = category
        this.operation = operation
    }
}

class MockMessage {
    constructor(channelName, channelGroup, publishTimeToken, publisher, payload) {
        this.channel = channelName
        this.subscription = channelGroup
        this.timetoken = publishTimeToken
        this.publisher = publisher
        this.message = payload
    }
}

class MockPresence { // ABSTRACT
    constructor(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs) {
        this.channel = channelName
        this.occupancy = userCount
        this.state = userState
        this.subscription = channelGroup
        this.timestamp = publishTimeToken
        this.timetoken = currentTimetoken
        this.uuid = userUUIDs
    }
}

class MockJoinPresence extends MockPresence {
    constructor(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs) {
        super(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs)
        this.action = 'join'
    }
}

class MockLeavePresence extends MockPresence {
    constructor(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs) {
        super(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs)
        this.action = 'leave'
    }
}

class MockStateChangePresence extends MockPresence {
    constructor(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs) {
        super(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs)
        this.action = 'state-change'
    }
}

class MockTimeoutPresence extends MockPresence {
    constructor(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs) {
        super(channelName, userCount, userState, channelGroup, publishTimeToken, currentTimetoken, userUUIDs)
        this.action = 'timeout'
    }
}
