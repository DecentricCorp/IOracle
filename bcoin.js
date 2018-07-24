'use strict';
const Name = "bitcoin"
const UI = require('./ui.js')
const Verbose = process.argv[2] || true
const bcoin = require('bcoin')
const Colors = require('colors')
const ServiceChannel = 'emblem_cart_bcoin'
const TimeoutMillis = 5000 // 60 * 60 * 1000
const PubNubService = require('pubnub')
const PubNub = new PubNubService({
    publishKey: 'pub-c-2ff3735b-93b6-4913-893c-eea3fe2411c0',
    subscribeKey: 'sub-c-e3f20f58-7bb1-11e8-a4a6-464114960942',
    secretKey: 'sec-c-YTI3ZTA1NjUtOGFlYi00MjQ3LWFlODUtNzU0YWFlYmRhYTdm',
    ssl: true,
    // logVerbosity: true,
    uuid: "cv1",
})
const POIs = []
var spinner

// SPV chains only store the chain headers.

const assert = require('assert');
const SPVNode = bcoin.SPVNode
const Outpoint = bcoin.Outpoint
const node = new SPVNode({
    config: true,
    argv: true,
    env: true,
    logFile: true,
    logConsole: true,
    logLevel: 'debug',
    db: 'leveldb',
    memory: false,
    persistent: true,
    workers: true,
    listen: true,
    loader: require
  })
console.log('--------- Node config', node.config.bool('main'))
if (!node.has('walletdb')) {
    const plugin = require('bcoin/lib/wallet/plugin');
    node.use(plugin);
  }
  process.on('unhandledRejection', (err, promise) => {
    throw err;
  });
init()
async function init() {
    console.log(Name, "Starting I/Oracle")
    console.log(Name, "Verbose?", Verbose)
    
    //pub(PubNub, function(){
        getMessages(
            {
                channel: ServiceChannel,
                max: 50,
                pagesize: 5,
                reverse: true
            },
            function(results) {
                console.log("results: \n" + JSON.stringify(results));       
            }
        )
    //})
    
    await startLedger()
    
}
function pub(service, cb) {
    var i = 1;
    var total = 32
    var channel = ServiceChannel
    var _service = service || PubNub
    var looper = setInterval(
        function() {
            _service.publish({
                channel: channel,
                message: "message #" + i++
            });
  
            if (i > total) {
                clearInterval(looper);
                return cb()
            }
        }, 
    400);
}
function getMessages(args, callback) {
    PubNub.history(
        {
            // search starting from this timetoken
            start: args.startToken,
            channel: args.channel,
            // false - search forwards through the timeline
            // true - search backwards through the timeline
            reverse: args.reverse,
            // limit number of messages per request to this value; default/max=100
            count: args.pagesize,
            // include each returned message's publish timetoken
            includeTimetoken: true,
            // prevents JS from truncating 17 digit timetokens
            stringifiedTimeToken: true
        },
        function(status, response) {
            // holds the accumulation of resulting messages across all iterations
            var results = args.results;
            // the retrieved messages from history for this iteration only
            var msgs = response.messages;
            // timetoken of the first message in response
            var firstTT = response.startTimeToken;
            // timetoken of the last message in response
            var lastTT = response.endTimeToken;
            // if no max results specified, default to 500
            args.max = !args.max ? 500 : args.max;
  
            if (msgs != undefined && msgs.length > 0) {
                // display each of the returned messages in browser console
                for (var i in msgs) {
                    var msg = msgs[i];
                    console.log(msg.entry, msg.timetoken);
                }
  
                // first iteration, results is undefined, so initialize with first history results
                if (!results) results = msgs;
                // subsequent iterations, results has previous iterartions' results, so concat
                // but concat to end of results if reverse true, otherwise prepend to begining of results
                else args.reverse ? results = results.concat(msgs) : results = msgs.concat(results);
            }
  
            // show the total messages returned out of the max requested
            console.log('total    : ' + results.length + '/' + args.max);
  
            // we keep asking for more messages if # messages returned by last request is the
            // same at the pagesize AND we still have reached the total number of messages requested
            // same as the opposit of !(msgs.length < pagesize || total == max)
            if (msgs.length == args.pagesize && results.length < args.max) {
                getMessages(
                    {
                        channel:args.channel, max:args.max, reverse:args.reverse, 
                        pagesize:args.pagesize, startToken:args.reverse ? lastTT : firstTT, results:results
                    }, 
                    callback);
            }
            // we've reached the end of possible messages to retrieve or hit the 'max' we asked for
            // so invoke the callback to the original caller of getMessages providing the total message results
            else callback(results);
        }
    );
}
/* function getHistory() {
    PubNub.history(
        {
            channel: ServiceChannel,
            count: 100, // how many items to fetch
            stringifiedTimeToken: true, // false is the default
            reverse: true,
            startToken:"14774567814936359"
        },
        (status, response) => {
            console.log('got history', `${JSON.stringify(status)} ${JSON.stringify(response)}`)
        }
    )
}
function publish(service, message, meta) {
    const _service = service || PubNub
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
    _service.publish(payload, (status, response) => { if(Verbose) console.log(status, response) })
} */
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
/* function subscribe(service) {
    const _service = service || PubNub
    _service.addListener({
        status: function (status) {
            if (status.category === "PNConnectedCategory") {
                publish(_service)
            }
            const affectedChannelGroups = status.affectedChannelGroups
            const affectedChannels = status.affectedChannels
            const category = status.category
            const operation = status.operation
            if (Verbose) console.log("New Status!!", status)
        },
        message: function (message) {
            const channelName = message.channel
            const channelGroup = message.subscription // ...or wildcard subscription match (if exists)
            const publishTimeToken = message.timetoken
            const publisher = message.publisher
            const payload = JSON.stringify(message.message)
            const payloadDict = extractDictFromJSON(payload)
            const address = payloadDict["address"]
            if (POIs.indexOf(address) != -1) {
                // this is bad and shouldn't happen - throw an alarm
                publish(_service, 'WARNING', `Second Message from Address ${address}`)
            }
            else if (payloadDict['txn_type'] == 'purchase') {
                console.log('\r\nNew Message!!', payload)
                POIs.push(address)
                PoiTimeoutPairs.push(new AddressTimeoutPair(address, Date.now() + TimeoutMillis))
                // console.log(`\r\nMonitoring Address ${address}`)
                console.log('\r\nMonitored Addresses:\t', POIs)
                console.log('\r\nWaiting to Timeout:\t', PoiTimeoutPairs)
                publish(_service, 'Purchase Detected', `Monitoring Address ${address}`)
            }
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
    _service.subscribe({
        channels: [ServiceChannel]
    })
} */
function colorInt(count) {
    return count > 0 ? Colors.green(count) : Colors.red(count)
}
async function startLedger(){
    await node.ensure();
    await node.open();
    await node.connect();
    node.pool.watchAddress('1BKU18EDGGyBxgEwkBxf3i6wZuhNc4Q63i');
    node.pool.watchOutpoint(new Outpoint());
    node.on('block', (block) => {
    assert(block.txs.length >= 1);
    if (block.txs.length > 1)
        console.log(block.txs[1]);
    })
    node.on('tx', async (tx) => {
        console.log('received TX', tx);
    })
    node.startSync()

}
