const Name = "bitcoin"
const AddressTimeout = require('./AddressTimeout')
const Crypto = require('crypto')
const UI = require('../ui.js')
const Verbose = process.argv[2] || false
const Inventory = require('bitcoin-inventory')
const BitcoinFilter = require('bitcoin-filter')
const Reverse = require("buffer-reverse")
const DataDir = "./." + Name + "/"
const PeersFile = DataDir + "/peers.json"
var connectedPeers = require(PeersFile).peers
const RelayPeersFile = DataDir + "/relayers.json"
const RelayPeers = require(RelayPeersFile).peers
const BlocksFile = DataDir + "/blocks.json"
const Blocks = require(BlocksFile).blocks
const InterestingTransactionsFile = DataDir + "/interesting-txns.json"
const InterestingTransactions = require(InterestingTransactionsFile).transactions
const TimeoutMillis = 60 * 60 * 1000
const MonitoredAddressesFile = DataDir + "/pois.json"
var monitoredAddresses = require(MonitoredAddressesFile).pois.map((poi) => new AddressTimeout(poi, Date.now() + TimeoutMillis))
const Params = require('webcoin-bitcoin').net
Params.numPeers = 50
Params.staticPeers = RelayPeers.reverse()
const FS = require('fs')
const Bitcoin = require('bitcoinjs-lib')
const Colors = require('colors')
const RPC = require('../rpc')
const ServiceChannel = 'emblem_cart'
var timeouts = 0
var memPool = []
const PubNubService = require('pubnub')
const PubNub = new PubNubService({
    publishKey: 'pub-c-2ff3735b-93b6-4913-893c-eea3fe2411c0',
    subscribeKey: 'sub-c-e3f20f58-7bb1-11e8-a4a6-464114960942',
    secretKey: 'sec-c-YTI3ZTA1NjUtOGFlYi00MjQ3LWFlODUtNzU0YWFlYmRhYTdm',
    ssl: true,
    // logVerbosity: true,
    // uuid: "cv1",
})
var spinner
const PeerGroup = require('bitcoin-net').PeerGroup
const Peers = new PeerGroup(Params, ["wrtc"])
const Filter = new BitcoinFilter(Peers)
const Inv = Inventory(Peers)

function preInit() {
    console.log(Name, "Starting I/Oracle")
    console.log(Name, "Verbose?", Verbose)
    console.log(Name, "Loaded", colorInt(RelayPeers.length), "relaying peers")
    console.log(Name, "Loaded", colorInt(connectedPeers.length), "general peers")
    console.log(Name, "Loaded", colorInt(monitoredAddresses.length), "addresses of interest")
    console.log(Name, "Loaded", colorInt(InterestingTransactions.length), "interesting Transactions")
    const reported = InterestingTransactions.filter((tx) => tx.reported)
    console.log(Name, "          -", colorInt(reported.length), "Transactions have been reported")
    console.log(Name, "          -", colorInt(InterestingTransactions.length - reported.length), "Transactions have not been reported")
    console.log(Name, "Loaded", colorInt(Blocks.length), "blocks")
}

function init() {
    Peers.on('peer', peerOnPeer)
    Peers.on('inv', peerOnInv)
    Inv.on('merkleblock', (block) => console.log(Colors.red('merkleblock'), block))
    Inv.on('tx', (tx) => invOnTx(tx))
    spinner = UI.make_spinner("connecting to peers, looking for transactions")
    Peers.connect()
    setInterval(() => monitoredAddresses = removeStaleAddresses(), TimeoutMillis)
}

function invOnTx(tx, service = PubNub) {
    const txid = Reverse(tx.getHash()).toString('hex')
    const report = { txid: txid, addresses: { out: [] }, tracked: false }
    const reportJSON = JSON.stringify(report, null, 4)
    tx.outs.forEach(function (out, index) {
        try {
            const address = Bitcoin.address.fromOutputScript(out.script).toString()
            if (Verbose) {
                console.log("txid", txid, "address", address)
            }
            else {
                spinner.message(`txid: ${txid}`)
            }
            const tracked = monitoredAddresses.filter((pair) => pair.address === address)
            report.addresses.out.push({ address: address, value: parseInt(out.value), tracked: tracked.length > 0 })
            if (tracked.length > 0) {
                Filter.add(new Buffer(address, 'hex'))
                report.tracked = true
                report.reported = false
                //console.log("---------  Tracked!!", tracked, reportJSON)
            }
        }
        catch (e) {
            console.log(`\r\nGraceful Failure: ${e.message}`)
        }
        if (index === tx.outs.length - 1) { /* Done looping over outputs, time to finish */
            if (report.tracked) {
                InterestingTransactions.push(report)
                const txns = JSON.stringify({ transactions: InterestingTransactions }, null, 4)
                FS.writeFile(InterestingTransactionsFile, txns, 'utf8', () => console.log('---------  Interesting Transaction Found!', reportJSON))
                publish(reportJSON, `Interesting Transaction ${txid}`, service)
            }
        }
    })
}

function peerOnPeer(peer) {
    timeouts = 0
    addPeerToPeerList(peer)
    /* DIRTY HAx0R looking for open RPC
        try {
            rpc.rpcCheck(peer.socket.remoteAddress)
        } catch(err){}
    */
    if (Verbose) {
        printProgress(`Peer ${connectedPeers.length} ${peer.socket.remoteAddress}`)
    }
    peer.once('disconnect', function () {
        timeouts = 0
        removePeerFromPeerList(peer)
        if (Verbose) {
            printProgress(`Disconnected from peer ${peer.socket.remoteAddress}`)
        }
    })
    peer.send('ping', { nonce: Crypto.pseudoRandomBytes(8) }, true)
}

function peerOnInv(inventory, peer) {
    timeouts = 0
    if (inventory[0].type === 1) { // a transaction - TODO what if the inventory contains heterogenous types?
        addPeerToRelayList(peer)
        printProgress("Receiving Transaction Inventory")
        inventory.forEach(function (tx) {
            Inv.get(tx.hash) // TODO what does this do? figure out how to test this
            const txid = Reverse(tx.hash).toString('hex')
            if (Verbose) {
                printProgress('Transaction Inventory', txid)
            }
            else {
                spinner.message(`Transaction Inventory: ${txid}`)
            }
            addToMemPool(txid)
        }, this) // TODO is this necessary here?
    } else {
        memPool.length = 0
        const hash = Reverse(inventory[0].hash).toString('hex')
        if (Blocks.filter((blockHash) => blockHash === hash).length < 1) {
            Blocks.push(hash)
            FS.writeFile(BlocksFile, JSON.stringify({ blocks: Blocks }, null, 4), 'utf8', () => printProgress('Block Found', hash))
        }
    }
}

function colorInt(count) {
    return count > 0 ? Colors.green(count) : Colors.red(count)
}

function addToMemPool(txid) {
    const found = memPool.filter((id) => id === txid)
    if (found.length > 0) {
        // console.log("====> Duplicate TXN ID: ", txid)
        return false
    } else {
        console.log("Adding to mempool", txid)
        memPool.push(txid)
        return true
    }
}

function addPeerToPeerList(peer) {
    const found = connectedPeers.filter(remoteAddress => remoteAddress === peer.socket.remoteAddress)
    if (found.length === 0) {
        connectedPeers.push(peer.socket.remoteAddress)
        //fs.writeFile(AllPeersFile, JSON.stringify({peers: connectedPeers},null,4), 'utf8', () => ()))
    }
}

function addPeerToRelayList(peer) {
    const peerAddress = peer.socket.remoteAddress
    if (RelayPeers.filter((relayer) => relayer === peerAddress).length < 1) {
        RelayPeers.push(peerAddress)
        console.log(`\r\nFound Relay Peer ${peerAddress} and added peer to ${RelayPeersFile}`)
        // TODO publish to a channel instead of writing to file (which doesn't currently work)
        // FS.writeFile(RelayersFile, JSON.stringify({ peers: Relayers }, null, 4), 'utf8', function () {
        //     if (Verbose) { printProgress("Found peer " + peerAddress + " that relays transactions, Added peer to", RelayersFile) }
        // })
    }
}

function removePeerFromPeerList(peer) {
    const address = peer.socket.remoteAddress
    if (connectedPeers.includes(address))
        connectedPeers.splice(connectedPeers.indexOf(address), 1)
}

function resetPeerConnection() {
    if (connectedPeers.length < Params.numPeers) {
        printProgress(`Connected to ${connectedPeers.length} non-relaying peers. Trying to connect to more.`)
        Peers.removeListener('peer', (err) => console.log("err", err))
        Peers.removeListener('inv', (err) => console.log("err", err))
        spinner.stop()
        init()
    }
}

function getHistory(service = PubNub) {
    service.history(
        {
            channel: ServiceChannel,
            count: 100, // how many items to fetch
            stringifiedTimeToken: true, // false is the default
        },
        (status, response) => console.log(`${status} ${response}`)
    )
}

function subscribe(service = PubNub) {
    service.addListener({
        status: (status) => subscribeStatus(status),
        message: (message) => subscribeMessage(message),
        presence: subscribePresence
    })
    console.log("Subscribing...")
    service.subscribe({
        channels: [ServiceChannel]
    })
}

function subscribeStatus(status, service = PubNub) {
    if (status.category === "PNConnectedCategory") {
        publish('Status: PN Connected', 'PN Connected', service)
    }
    const affectedChannelGroups = status.affectedChannelGroups
    const affectedChannels = status.affectedChannels
    const category = status.category
    const operation = status.operation
    console.log(`\r\nNew Status!!\r\n`, status)
}

function subscribeMessage(message, service = PubNub) {
    const channelName = message.channel
    const channelGroup = message.subscription // ...or wildcard subscription match (if exists)
    const publishTimeToken = message.timetoken
    const publisher = message.publisher
    const payload = JSON.stringify(message.message)
    const payloadDict = extractDictFromJSON(payload)
    const address = payloadDict["address"]
    if (monitoredAddresses.filter((pair) => pair.address == address).length != 0) {
        publish('WARNING', `Additional Message from Address ${address}`, service)
    }
    else if (payloadDict['txn_type'] == 'purchase') {
        console.log('\r\nNew Message!!', payload)
        monitoredAddresses.push(new AddressTimeout(address, Date.now() + TimeoutMillis))
        console.log(`\r\nMonitoring Address ${address}`)
        publish('Purchase Detected', `Monitoring Address ${address}`, service)
    }
}

function subscribePresence(presence) {
    const action = presence.action // can be join, leave, state-change or timeout
    const channelName = presence.channel
    const userCount = presence.occupancy
    const userState = presence.state
    const channelGroup = presence.subscription // ...or wildcard subscription match (if exists)
    const publishTimeToken = presence.timestamp
    const currentTimetoken = presence.timetoken
    const userUUIDs = presence.uuid
    console.log("New Presence!!", presence)
}

function publish(message, meta, service = PubNub) {
    const payload = {
        message: {
            'body': message
        },
        channel: ServiceChannel,
        sendByPost: false,
        storeInHistory: false,
        meta: {
            'body': meta
        }
    }
    service.publish(payload, (status, response) => console.log(status, response))
}

function removeStaleAddresses(time = Date.now()) {
    console.log(`\r\nRemoving stale addresses as of ${time}`)
    return monitoredAddresses.filter((timeout) => time < timeout.time)
}

function extractDictFromJSON(payload) {
    const dict = []
    const keyValuePairs = payload
        .split(',')
        .map((kvp) => kvp.split(':'))
        .map((kvp) => kvp.map((keyOrValue) => keyOrValue.replace(/{/g, '').replace(/}/g, '').replace(/"/g, '')))
    keyValuePairs.forEach((kvp) => dict[kvp[0]] = kvp[1])
    return dict
}

function printProgress(progress, msg) {
    spinner.stop()
    /* process.stdout.clearLine()
    process.stdout.cursorTo(0) */
    console.log(progress, msg || "")
    spinner.start()
}

// SETTERS, used in testing

function setTimeouts(num) {
    timeouts = num
}

function setMempool(pool) {
    memPool.length = 0
    pool.forEach((address) => memPool.push(address))
}

function setMonitoredAddresses(addresses) {
    monitoredAddresses.length = 0
    addresses.forEach((address) => monitoredAddresses.push(address))
}

function setRelayPeers(peers) {
    RelayPeers.length = 0
    peers.forEach((peer) => RelayPeers.push(peer))
}

/* Lets start this thing */

preInit()
init()
subscribe()

module.exports.extractDictFromJSON = extractDictFromJSON
module.exports.addToMemPool = addToMemPool
module.exports.colorInt = colorInt
module.exports.addPeerToPeerList = addPeerToPeerList
module.exports.connectedPeers = connectedPeers
module.exports.removePeerFromPeerList = removePeerFromPeerList
module.exports.timeouts = timeouts
module.exports.addPeerToRelayList = addPeerToRelayList
module.exports.RelayPeers = RelayPeers
module.exports.subscribe = subscribe
module.exports.publish = publish
module.exports.PubNub = PubNub
module.exports.getHistory = getHistory
module.exports.removeStaleAddresses = removeStaleAddresses
module.exports.monitoredAddresses = monitoredAddresses
module.exports.Params = Params
module.exports.subscribeStatus = subscribeStatus
module.exports.subscribeMessage = subscribeMessage
module.exports.subscribePresence = subscribePresence
module.exports.peerOnInv = peerOnInv
module.exports.peerOnPeer = peerOnPeer
module.exports.memPool = memPool
module.exports.Blocks = Blocks
module.exports.Inv = Inv
module.exports.setTimeouts = setTimeouts
module.exports.setMempool = setMempool
module.exports.setMonitoredAddresses = setMonitoredAddresses
module.exports.setRelayPeers = setRelayPeers