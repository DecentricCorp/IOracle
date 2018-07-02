const expect = require('chai').expect
const btc = require('../../ledgers/bitcoin.js')

describe('Bitcoin', () => {
    describe('extractDictFromJSON', () => {
        it('returns a dictionary of key-value pairs from the payload', () => {
            expect(btc.extractDictFromJSON('').keys().length == 0)
            const dict = btc.extractDictFromJSON('"key1":"value1","key2":"value2"')
            expect(dict['key1']).to.equal('value1')
            expect(dict['key2']).to.equal('value2')
        })
    })
    describe('addToMemPool', () => {
        it('adds an address to the mempool unless it is already present', () => {
            expect(btc.addToMemPool('txnid')).to.true
            expect(btc.addToMemPool('txnid')).to.false
        })
    })
    describe('colorInt', () => {
        it('colors the number green if positive, red otherwise', () => {
            expect(btc.colorInt(-5)).to.equal('\u001b[31m-5\u001b[39m')
            expect(btc.colorInt(0)).to.equal('\u001b[31m0\u001b[39m')
            expect(btc.colorInt(5)).to.equal('\u001b[32m5\u001b[39m')
        })
    })
})
