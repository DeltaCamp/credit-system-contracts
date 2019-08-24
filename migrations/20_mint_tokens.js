// 1_initial_migration.js
const Token = artifacts.require('Token.sol')

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    t = await Token.deployed()
    
    for (let i = 0; i < accounts.length; i++) {
      let account = accounts[i]
      await t.mint(account, web3.utils.toWei('10000', 'ether'))
      console.log(`Minted 10000 ether to ${account}`)
    }
  })
};
