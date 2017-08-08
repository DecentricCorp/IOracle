var btcProof = require('bitcoin-proof')
var BLOCK_100K_TRANSACTIONS = [
  '8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87',
  'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
  '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4',
  'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d'
];
 
var proofOfFirstTx = btcProof.getProof(BLOCK_100K_TRANSACTIONS, 0);
// { 
//   txId: '8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87', 
//   txIndex: 0, 
//   sibling: [ 
//     'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4', 
//     '8e30899078ca1813be036a073bbf80b86cdddde1c96e9e9c99e9e3782df4ae49' 
//   ] 
// } 
 
var proofOfLastTx = btcProof.getProof(BLOCK_100K_TRANSACTIONS, 3);
// { 
//   txId: 'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d', 
//   txIndex: 0, 
//   sibling: [ 
//     '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4', 
//     'ccdafb73d8dcd0173d5d5c3c9a0770d0b3953db889dab99ef05b1907518cb815' 
//   ] 
// } 
console.log("proof", proofOfFirstTx, proofOfLastTx)
