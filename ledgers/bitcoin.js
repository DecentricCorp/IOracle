const Name = "bitcoin"
const UI = require('../ui.js')
const Verbose = process.argv[2] || false
const Inventory = require('bitcoin-inventory')
const Filter = require('bitcoin-filter')
const Reverse = require("buffer-reverse")
const DataDir = "./." + Name + "/"
const AllPeersFile = DataDir + "/all-peers.json"
const RelayersFile = DataDir + "/peers.json"
var connectedPeers = require(AllPeersFile).peers
const Relayers = require(RelayersFile).peers
const BlocksFile = DataDir + "/blocks.json"
const Blocks = require(BlocksFile).blocks
const InterestingTransactionsFile = DataDir + "/transactions.json"
const InterestingTransactions = require(InterestingTransactionsFile).transactions
const POIsFile = DataDir + "/pois.json"
const POIs = require(POIsFile).pois
const Params = require('webcoin-bitcoin').net
Params.numPeers = 50
Params.staticPeers = Relayers.reverse()
const FS = require('fs')
const Bitcoin = require('bitcoinjs-lib')
const Colors = require('colors')
const RPC = require('../rpc')
const PubnubChannel = 'emblem_cart'
const PubNub = require('pubnub')
const Timeout = 15
var timeouts = 0
var mempool = []
var receivingInventory = false
var filter, pubnub, spinner

// create peer group
const stuckTimer = getTimer(Timeout, resetPeerConnection)
const PeerGroup = require('bitcoin-net').PeerGroup
var peers, inv

function init() {
    peers = new PeerGroup(Params, ["wrtc"])
    filter = new Filter(peers)
    inv = Inventory(peers)
    spinner = UI.make_spinner("connecting to peers, looking for transactions")
    /* peers.once('connect', function(){
        console.log("connected?")     
    }) */

    peers.on('peer', (peer) => {
        timeouts = 0
        /* Add peer to list */
        addPeerToPeerList(peer)

        /* DIRTY HAx0R looking for open RPC
            try {
                rpc.rpcCheck(peer.socket.remoteAddress)
            } catch(err){} 
        */
        if (Verbose) { printProgress('Peer ' + connectedPeers.length + " " + peer.socket.remoteAddress) }

        peer.once('disconnect', function (err) {
            timeouts = 0
            removePeerFromPeerList(peer)
            if (Verbose) { printProgress("Disconnected from peer " + peer.socket.remoteAddress) }
        })

        peer.send('ping', {
            nonce: require('crypto').pseudoRandomBytes(8)
        }, true)
    })

    peers.on('inv', (inventory, peer) => {
        timeouts = 0
        if (inventory[0].type === 1) {
            addPeerToRelayingPeerList(peer)
            if (!receivingInventory) {
                printProgress("Receiving Transaction Inventory")
                receivingInventory = true
            }
            inventory.forEach(function (tx) {
                inv.get(tx.hash)
                const txid = Reverse(tx.hash).toString('hex')
                if (Verbose) { printProgress('Transaction Inventory', txid) } else {
                    spinner.message('Transaction Inventory: ' + txid)
                }
                addToMemPool(txid)
            }, this)
        } else {
            mempool = [] /* Reset mempool */
            const blockHash = Reverse(inventory[0].hash).toString('hex')

            const blockHashRecorded = Blocks.filter(function (block) { return block === blockHash })
            if (blockHashRecorded.length < 1) {
                Blocks[Blocks.length] = blockHash
                FS.writeFile(BlocksFile, JSON.stringify({ blocks: Blocks }, null, 4), 'utf8', function () {
                    printProgress('Block Found', blockHash)
                })
            }
        }
    })
    inv.on('merkleblock', (block) => {
        console.log(Colors.red('merkleblock'), block)
    })
    inv.on('tx', (tx) => {
        const txid = Reverse(tx.getHash()).toString('hex')
        const report = { txid: txid, addresses: { out: [] }, tracked: false }
        tx.outs.forEach(function (out, index) {
            try {
                const address = Bitcoin.address.fromOutputScript(out.script).toString()
                if (Verbose) { console.log("txid", txid, "address", address) } else {
                    spinner.message("txid: " + txid)
                }
                const tracked = POIs.filter(function (poi) { return poi === address })
                report.addresses.out[report.addresses.out.length] = { address: address, value: parseInt(out.value), tracked: tracked.length > 0 }
                if (tracked.length > 0) { /* Flag this report as being tracked */
                    filter.add(new Buffer(address, 'hex'))
                    report.tracked = true
                    report.reported = false
                    //console.log("---------  Tracked!!", tracked, JSON.stringify(report, null, 4))
                }
            } catch (e) { console.log(`Gracefully Failing on Error ${e.message}`) }
            if (index === tx.outs.length - 1) { /* Done looping over outputs, time to finish */
                if (report.tracked) {
                    InterestingTransactions[InterestingTransactions.length] = report
                    FS.writeFile(InterestingTransactionsFile, JSON.stringify({ transactions: InterestingTransactions }, null, 4), 'utf8', function () {
                        console.log('---------  Interesting Transaction Found!', JSON.stringify(report, null, 4))
                    })
                }
            }
        })
    })
    peers.connect()
}

function preInit(cb) {
    const reported = InterestingTransactions.filter(function (tx) { return tx.reported })
    console.log(Name, "Starting I/Oracle")
    console.log(Name, "Verbose?", Verbose)
    console.log(Name, "Loaded", colorInt(Relayers.length), "relaying peers")
    console.log(Name, "Loaded", colorInt(connectedPeers.length), "general peers")
    console.log(Name, "Loaded", colorInt(POIs.length), "addresses of interest")
    console.log(Name, "Loaded", colorInt(InterestingTransactions.length), "interesting Transactions")
    console.log(Name, "          -", colorInt(reported.length), "Transactions have been reported")
    console.log(Name, "          -", colorInt(InterestingTransactions.length - reported.length), "Transactions have not been reported")
    console.log(Name, "Loaded", colorInt(Blocks.length), "blocks")
    return cb()
}

function colorInt(count) {
    return count > 0 ? Colors.green(count) : Colors.red(count)
}

function addToMemPool(txid) {
    const found = mempool.filter(function (id) { return id === txid })
    if (found.length > 0) {
        // console.log("====> Duplicate TXN ID: ", txid)
        return false
    } else {
        console.log("Adding to mempool", txid)
        mempool.push(txid)
        return true
    }
}

function addPeerToPeerList(peer) {
    const found = connectedPeers.filter(function (p) { return p === peer.socket.remoteAddress })
    if (found.length === 0) {
        connectedPeers[connectedPeers.length] = peer.socket.remoteAddress
        //fs.writeFile(AllPeersFile, JSON.stringify({peers: connectedPeers},null,4), 'utf8', function(){})
    }
}

function addPeerToRelayingPeerList(peer) {
    const peerAddress = peer.socket.remoteAddress
    const found = Relayers.filter(function (p) { return p === peerAddress })
    if (found.length === 0) {
        Relayers[Relayers.length] = peerAddress
        FS.writeFile(RelayersFile, JSON.stringify({ peers: Relayers }, null, 4), 'utf8', function () {
            if (Verbose) { printProgress("Found peer " + peerAddress + " that relays transactions, Added peer to", RelayersFile) }
        })
    }
}

function removePeerFromPeerList(peer) {
    connectedPeers = connectedPeers.filter(function (p) { return p !== peer.socket.remoteAddress })
}

function resetPeerConnection() {
    if (connectedPeers.length < Params.numPeers) {
        printProgress("Connected to " + connectedPeers.length + " non-relaying peers. Trying to connect to more. ")
        peers.removeListener('peer', function (err) { console.log("err", err) })
        peers.removeListener('inv', function (err) { console.log("err", err) })
        spinner.stop()
        init()
    }
}

function getTimer(max, cb) {
    return setInterval(function () {
        timeouts += 1
        if (timeouts >= max) {
            timeouts = 0
            return cb()
        }
    }, 1000)
}

function getHistory() {
    pubnub.history(
        {
            channel: PubnubChannel,
            count: 100, // how many items to fetch
            stringifiedTimeToken: true, // false is the default
        },
        function (status, response) {
            console.log(status, response)
        }
    )
}

function subscribe() {
    pubnub = new PubNub({
        publishKey: 'pub-c-2ff3735b-93b6-4913-893c-eea3fe2411c0',
        subscribeKey: 'sub-c-e3f20f58-7bb1-11e8-a4a6-464114960942',
        secretKey: 'sec-c-YTI3ZTA1NjUtOGFlYi00MjQ3LWFlODUtNzU0YWFlYmRhYTdm',
        ssl: true
    })
    pubnub.addListener({
        status: function (status) {
            if (status.category === "PNConnectedCategory") {
                publish()
            }
            const affectedChannelGroups = status.affectedChannelGroups
            const affectedChannels = status.affectedChannels
            const category = status.category
            const operation = status.operation
            console.log("New Status!!", status)
        },
        message: function (message) {
            const channelName = message.channel
            const channelGroup = message.subscription // ...or wildcard subscription match (if exists)
            const publishTimeToken = message.timetoken
            const publisher = message.publisher
            const payload = JSON.stringify(message.message)
            const payloadDict = extractDictFromJSON(payload)
            if (payloadDict['txn_type'] == 'purchase') {
                console.log("\r\nNew Message!!", payload)
                const address = payloadDict["address"];
                POIs.push(address)
                console.log("\r\nUpdated Monitored Addresses:\t", POIs)
                publish('Purchase Detected', `Monitoring Address ${address}`)
            }
            // console.log("\r\nNew Message!!")
            // console.log(`\tChannel Name:\t${channelName}`)
            // console.log(`\tChannel Group:\t${channelGroup}`)
            // console.log(`\tPublished:\t${publishTimeToken}`)
            // console.log(`\tPublisher:\t${publisher}`)
            // console.log('\tPayload:\t', JSON.stringify(payload))
        },
        presence: function (presence) {
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
    })
    console.log("Subscribing...")
    pubnub.subscribe({
        channels: [PubnubChannel]
    })
}

function extractDictFromJSON(payload) {
    const dict = []
    const keyValuePairs = payload.split(',').map(function (kvp) {
        return kvp.split(':')
    }).map(function (kvp) {
        return kvp.map(function (keyOrValue) {
            return keyOrValue.replace(/{/g, '').replace(/}/g, '').replace(/"/g, '')
        })
    })
    keyValuePairs.forEach(function (kvp) {
        dict[kvp[0]] = kvp[1]
    })
    return dict
}

function flatten(arr) {
    return arr.reduce(function (flat, toFlatten) {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

function publish(message, meta) {
    pubnub.publish({
            message: {
                'body' : message
            },
            channel: PubnubChannel,
            sendByPost: false, // true to send via post
            storeInHistory: false, // override default storage options
            meta: {
                'body' : meta
            }
        },
        function (status, response) {
            console.log(status, response)
        }
    )
}

function printProgress(progress, msg) {
    spinner.stop()
    /* process.stdout.clearLine()
    process.stdout.cursorTo(0) */
    console.log(progress, msg || "")
    spinner.start()
}

/* Lets start this thing */
preInit(init)
subscribe()

module.exports.extractDictFromJSON = extractDictFromJSON
module.exports.addToMemPool = addToMemPool
module.exports.colorInt = colorInt