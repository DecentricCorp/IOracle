var bitcoin_rpc = require('node-bitcoin-rpc')

module.exports.rpcCheck = function(host, port, rpc_username, rpc_pass){
    
    var safeHost = host || process.argv[2] || "127.0.0.1"
    var safePort = port || process.argv[3] || 8332
    var safeRpc_username = rpc_username || process.argv[4] || "rpcuser"
    var safeRpc_pass = rpc_pass || process.argv[5] || "somesecretpassword"
    try {
        bitcoin_rpc.init(safeHost, safePort, safeRpc_username, safeRpc_pass)
        bitcoin_rpc.call('getinfo', [], function (err, res) {
            if (err !== null) {/* Errored! */} else {
                if (res.result) {
                    console.log('Yay! Found open RPC @' + safeHost + ':' + safeRpc_pass)
                }
            }
        })
    } catch(err){
        /* Uncaught Error */
    }
}