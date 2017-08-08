var bitcoin_rpc = require('node-bitcoin-rpc')

module.exports.rpcCheck = function(host, port, rpc_username, rpc_pass){
    
    var host = host || process.argv[2] || "127.0.0.1"
    var port = port || process.argv[3] || 8332
    var rpc_username = rpc_username || process.argv[4] || "rpcuser"
    var rpc_pass = rpc_pass || process.argv[5] || "somesecretpassword"
    try {
        bitcoin_rpc.init(host, port, rpc_username, rpc_pass)
        bitcoin_rpc.call('getinfo', [], function (err, res) {
            if (err !== null) {/* Errored! */} else {
                if (res.result) {
                    console.log('Yay! Found open RPC @' + host + ':' + port)
                }
            }
        })
    } catch(err){
        /* Uncaught Error */
    }
}