// 1_initial_migration.js
const shell = require('shelljs')

module.exports = function(deployer, networkName, accounts) {
  deployer.then(() => {
    if (shell.exec(`oz create Token --init initialize --args ${accounts[0]} --network ${networkName} --from ${process.env.ADMIN_ADDRESS}`).code !== 0) {
      throw new Error('Migration failed')
    }
  })
};
