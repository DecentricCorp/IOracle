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