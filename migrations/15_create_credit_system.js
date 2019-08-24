// 1_initial_migration.js
const shell = require('shelljs')
const MemberManager = artifacts.require('MemberManager.sol')
const Token = artifacts.require('Token.sol')

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    const mm = await MemberManager.deployed()
    const token = await Token.deployed()
    const stakeDelay = '10'

    if (shell.exec(`oz create CreditSystem --init initialize --args ${token.address},${mm.address},${stakeDelay}  --network ${networkName} --from ${process.env.ADMIN_ADDRESS}`).code !== 0) {
      throw new Error('Migration failed')
    }
  })
};
