# IOracle

Incomplete prototype oracle.

* Connect to bitcoin p2p network (no need to maintain full node)
  * Uses [webcoin-bitcoin](https://www.npmjs.com/package/bitcoin-net) 
* Deseralize transactions, looking at inputs and outputs
  * Looking for interesting transactions to or from a list of addresses
