const name = "bitcoin"
var ui = require('../ui.js')
var spinner
var verbose = process.argv[2] || false
var Inventory = require('bitcoin-inventory')
var Filter = require('bitcoin-filter')
var reverse = require("buffer-reverse")
const data_dir = "./."+name+"/"
var allPeersFile = data_dir+"/all-peers.json"
var relayersFile = data_dir+"/peers.json"
var connectedPeers = require(allPeersFile).peers
var relayers = require(relayersFile).peers
var blocksFile = data_dir+"/blocks.json"
var blocks = require(blocksFile).blocks
var interestingTransactionsFile = data_dir+"/transactions.json"
var interestingTransactions = require(interestingTransactionsFile).transactions
var poisFile = data_dir+"/pois.json"
var pois = require(poisFile).pois
var params = require('webcoin-bitcoin').net
    params.numPeers = 50
    params.staticPeers = relayers.reverse()
var fs = require('fs')
var bitcoin = require('bitcoinjs-lib')
var colors = require('colors')
var rpc = require('../rpc')
var PubNub = require('pubnub')
var stuckTimer
var timeout = 15
var timeouts = 0
var mempool = []
var receivingInventory = false
var filter, pubnub

// create peer group
var PeerGroup = require('bitcoin-net').PeerGroup
var peers, inv
stuckTimer = getTimer(timeout, resetPeerConnection)

function init(){
    
    peers = new PeerGroup(params, ["wrtc"])
    filter = new Filter(peers)
    inv = Inventory(peers)
    spinner = ui.make_spinner("connecting to peers, looking for transactions")
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
        if (verbose) { printProgress('Peer ' + connectedPeers.length + " " +peer.socket.remoteAddress) }
        
        peer.once('disconnect', function(err){
            timeouts = 0
            removePeerFromPeerList(peer)
            if (verbose) { printProgress("Disconnected from peer " + peer.socket.remoteAddress) }
        })
        
        peer.send('ping', {
            nonce: require('crypto').pseudoRandomBytes(8)
        }, true)
    })

    peers.on('inv', (inventory, peer)=> {        
        timeouts = 0
        if (inventory[0].type === 1) {
            addPeerToRelayingPeerList(peer)
            if (!receivingInventory) {
                printProgress("Receiving Transaction Inventory")
                receivingInventory = true
            }
            inventory.forEach(function(tx) {
                inv.get(tx.hash)
                var txid = reverse(tx.hash).toString('hex')                
                if (verbose) { printProgress('Transaction Inventory', txid) } else {
                    spinner.message('Transaction Inventory: ' + txid)
                }
                addToMemPool(txid)
            }, this)
        } else {
            mempool = [] /* Reset mempool */
            var blockHash = reverse(inventory[0].hash).toString('hex')
            
            var blockHashRecorded = blocks.filter(function(block){return block === blockHash})
            if (blockHashRecorded.length < 1) {
                blocks[blocks.length] = blockHash                
                fs.writeFile(blocksFile, JSON.stringify({blocks: blocks}, null, 4), 'utf8', function(){
                    printProgress('Block Found', blockHash)
                })
            }
        }
    })
    inv.on('merkleblock', (block)=>{
        console.log(colors.red('merkleblock'), block)
    })
    inv.on('tx', (tx) => { 
        var txid = reverse(tx.getHash()).toString('hex')
        var report = { txid: txid, addresses: {out: []}, tracked: false}
        var tracked
        tx.outs.forEach(function(out, index){
            tracked = []
            try {
                var address = bitcoin.address.fromOutputScript(out.script).toString()
                if (verbose) { console.log("txid", txid, "address", address) } else {
                    spinner.message("txid: "+ txid)
                }
                tracked = pois.filter(function(poi){return poi === address})            
                report.addresses.out[report.addresses.out.length] = {address: address, value: parseInt(out.value), tracked: tracked.length > 0}
                if (tracked.length > 0) { /* Flag this report as being tracked */
                    filter.add(new Buffer(address, 'hex'))
                    report.tracked = true
                    report.reported = false
                    //console.log("---------  Tracked!!", tracked, JSON.stringify(report, null, 4))
                }
            } catch(e){ }
            if (index === tx.outs.length - 1) { /* Done looping over outputs, time to finish */
                if (report.tracked) {
                    interestingTransactions[interestingTransactions.length] = report
                    fs.writeFile(interestingTransactionsFile, JSON.stringify({transactions: interestingTransactions}, null, 4), 'utf8', function(){
                         console.log('---------  Interesting Transaction Found!', JSON.stringify(report, null, 4))
                    })
                }
            }
        })
    })
    peers.connect()
}

function preInit(cb){
    var reported = interestingTransactions.filter(function(tx){return tx.reported})
    console.log(name, "Starting I/Oracle")
    console.log(name, "Verbose?", verbose)
    console.log(name, "Loaded", colorInt(relayers.length), "relaying peers")
    console.log(name, "Loaded", colorInt(connectedPeers.length), "general peers")
    console.log(name, "Loaded", colorInt(pois.length), "addresses of interest")
    console.log(name, "Loaded", colorInt(interestingTransactions.length), "interesting Transactions")
    console.log(name, "          -", colorInt(reported.length), "Transactions have been reported")
    console.log(name, "          -", colorInt(interestingTransactions.length - reported.length), "Transactions have not been reported")
    console.log(name, "Loaded", colorInt(blocks.length), "blocks")
    return cb()
}

function colorInt(count) {
    if (count > 0) {
        return colors.green(count)
    }
    return colors.red(count)
}

function addToMemPool(txid) {
    var found = mempool.filter(function(tx){return tx === txid})
    if (found.length > 0) {
        console.log("====> Duplicate", txid)
    } else {
        //console.log("Adding to mempool", txid)
    }
}

function addPeerToPeerList(peer) {
    var found = connectedPeers.filter(function(p){return p === peer.socket.remoteAddress })
    if (found.length === 0) {
        connectedPeers[connectedPeers.length] = peer.socket.remoteAddress
        //fs.writeFile(allPeersFile, JSON.stringify({peers: connectedPeers},null,4), 'utf8', function(){})
    }
}

function addPeerToRelayingPeerList(peer) {
    var peerAddress = peer.socket.remoteAddress
    var found = relayers.filter(function(p){return p === peerAddress })
    if (found.length === 0) {
        relayers[relayers.length] = peerAddress
        fs.writeFile(relayersFile, JSON.stringify({peers: relayers},null,4), 'utf8', function(){
            if (verbose) { printProgress("Found peer " + peerAddress +" that relays transactions, Added peer to", relayersFile) }
        })
    }
}

function removePeerFromPeerList(peer) {
    connectedPeers = connectedPeers.filter(function(p){return p !== peer.socket.remoteAddress })    
}

function resetPeerConnection(){
    if (connectedPeers.length < params.numPeers) {
        printProgress("Connected to "+ connectedPeers.length+" non-relaying peers. Trying to connect to more. ")
        peers.removeListener('peer', function(err){console.log("err", err)})
        peers.removeListener('inv', function(err){console.log("err", err)})
        spinner.stop()
        init()
    }
}

function getTimer(max, cb){
    return setInterval(function(){
        timeouts += 1
        if (timeouts >= max) {
            timeouts = 0
            return cb()
        } 
    },1000)
}

function publish() {
    pubnub = new PubNub({
        publishKey : 'demo',
        subscribeKey : 'demo'
    })
       
    function publishSampleMessage() {
        console.log("Since we're publishing on subscribe connectEvent, we're sure we'll receive the following publish.");
        var publishConfig = {
            channel : "hello_world",
            message : "Hello from PubNub Docs!"
        }
        pubnub.publish(publishConfig, function(status, response) {
            console.log(status, response);
        })
    }
       
    pubnub.addListener({
        status: function(statusEvent) {
            if (statusEvent.category === "PNConnectedCategory") {
                publishSampleMessage();
            }
        },
        message: function(message) {
            console.log("New Message!!", message);
        },
        presence: function(presenceEvent) {
            // handle presence
        }
    })      
    console.log("Subscribing..");
    pubnub.subscribe({
        channels: ['hello_world'] 
    });
}
function printProgress(progress, msg){
    spinner.stop()
    /* process.stdout.clearLine();
    process.stdout.cursorTo(0); */
    console.log(progress, msg || "");
    spinner.start()
}
/* Lets start this thing */
preInit(init)
