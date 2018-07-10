const expect = require('chai').expect
const btc = require('../../ledgers/bitcoin.js')
const PeerGroup = require('bitcoin-net').PeerGroup
const Params = require('webcoin-bitcoin').net
const AddressTimeout = require('../../ledgers/AddressTimeout')

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
        // Currently Unused
    })
    describe('subscribe to PubNub', () => { // TODO test actual PubNub service
        describe('status', () => {
            it('publishes a message if the status category is PNConnectedCategory', () => {
                const service = new MockPubNub()
                expect(service.publishedMessages.length).to.equal(0)
                btc.subscribeStatus(new MockStatus('', '', 'PNConnectedCategory', ''), service)
                expect(service.publishedMessages.length).to.equal(1)
                btc.subscribeStatus(new MockStatus('', '', 'OtherCategory', ''), service)
                expect(service.publishedMessages.length).to.equal(1)
            })
        })
        describe('message', () => {
            it('monitors the address and publishes to PubNub on the first message, warns on subsequent messages', () => {
                const originalPOIs = btc.POIs

                const service = new MockPubNub()
                expect(service.publishedMessages.length).to.equal(0)
                btc.subscribeMessage(new MockMessage('', '', '', '', JSON.stringify({ "txn_type": "purchase", "address": "12345" })), service)
                expect(service.publishedMessages.length).to.equal(1)
                btc.subscribeMessage(new MockMessage('', '', '', '', JSON.stringify({ "txn_type": "other", "address": "12345" })), service)
                expect(service.publishedMessages.length).to.equal(2) // TODO check that this is a warning

                btc.POIs = originalPOIs
            })
        })
        describe('presence', () => {
            // just logs to console
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
            const service = new MockPubNub()
            btc.publish('message', 'meta', service)
            expect(service.publishedMessages[0]).to.eql(payload)
        })
    })
    describe('get PubNub history', () => {
        it('returns the specified items from the service history', () => {
            expect(btc.getHistory()).to.equal('[[{"text":"hey"},{"text":"hey"},{"text":"hey2","txn_type":"purchase"},{"text":"hey2","txn_type":"purchase"},{"text":"hey"},{"text":"hey"},{"text":"Enter Message Here"},{"text":"HISTORY MESSAGE"}],"15308024924992581","15308147177087533"]')
        })
    })
    describe('Inv', () => {
        describe('Inv on Tx', () => {

        })
    })
    describe('Peer', () => {
        describe('Peer on Peer', () => {
            it('adds the peer, with disconnect and ping functionality, to the list of peers', () => {
                const startingPeers = btc.connectedPeers.slice()

                const address = '123.456.789.012';
                const peer = new MockPeer(new MockSocket(address))
                btc.peerOnPeer(peer)
                expect(btc.connectedPeers).to.eql(startingPeers.concat([address]))
                expect(peer.sendCommand).to.equal('ping')
                expect(peer.sendAssert).to.true
                expect(peer.sendPayload.nonce.length).to.equal(8)
                expect(peer.onceEvent).to.equal('disconnect')
                peer.onceCB()
                expect(btc.connectedPeers).to.eql(startingPeers)
            })
        })
        describe('Peer on Inv', () => {

        })
    })
    describe('remove stale addresses', () => {
        it('removes monitored addresses that are ready to timeout', () => {
            const originalPOIs = btc.POIs

            const time = Date.now()
            const addressTimeout1 = new AddressTimeout('12345', time + 2000)
            const addressTimeout2 = new AddressTimeout('67890', time + 4000)
            btc.POIs = [addressTimeout1, addressTimeout2]

            expect(btc.removeStaleAddresses(time)).to.eql([addressTimeout1, addressTimeout2])

            expect(btc.removeStaleAddresses(time + 1999)).to.eql([addressTimeout1, addressTimeout2])

            expect(btc.removeStaleAddresses(time + 2000)).to.eql([addressTimeout2])

            expect(btc.removeStaleAddresses(time + 3000)).to.eql([addressTimeout2])

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

    once(event, cb) {
        this.onceEvent = event
        this.onceCB = cb
    }

    send(command, payload, assert) {
        this.sendCommand = command
        this.sendPayload = payload
        this.sendAssert = assert
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
