// 1_initial_migration.js
const Token = artifacts.require('Token.sol')

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    t = await Token.deployed()

    const chuckAddresses = [
      '0xdb1e9b74e6c9040ea10e656738972e021aecb6c9',
      '0x8f7F92e0660DD92ecA1faD5F285C4Dca556E433e'
    ]

    const allAccounts = accounts.concat(chuckAddresses)

    for (let i = 0; i < allAccounts.length; i++) {
      let account = allAccounts[i]
      await t.mint(account, web3.utils.toWei('10000', 'ether'))
      console.log(`Minted 10000 ether to ${account}`)
    }
  })
};
