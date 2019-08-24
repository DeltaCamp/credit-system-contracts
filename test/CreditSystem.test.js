const CreditSystem = artifacts.require('CreditSystem.sol')
const Token = artifacts.require('Token.sol')
const MemberManager = artifacts.require('MemberManager.sol')
const FixidityLib = artifacts.require('FixidityLib.sol')
const BN = require('bn.js')
const ethers = require('ethers')

const toWei = require('./helpers/toWei')
const mineBlocks = require('./helpers/mineBlocks')

contract('CreditSystem', (accounts) => {

  let creditSystem;

  let memberManager, token;

  const [owner, admin, user1, user2, user3] = accounts

  const stakeAmount = toWei('100')
  const unstakeDelay = 2

  beforeEach(async () => {
    memberManager = await MemberManager.new()
    token = await Token.new()
    fixidityLib = await FixidityLib.new()
    await token.initialize(owner)
    CreditSystem.link("FixidityLib", fixidityLib.address)

    await token.mint(user1, toWei('10000'))
    await token.mint(user2, toWei('10000'))

    await createCreditSystem()
  })

  async function createCreditSystem() {
    creditSystem = await CreditSystem.new()
    await creditSystem.initialize(token.address, memberManager.address, unstakeDelay)

    return creditSystem
  }

  async function stake(stakeAmount, user) {
    await token.approve(creditSystem.address, toWei('1000000000000'), { from: user })
    return await creditSystem.stake(stakeAmount, { from: user })
  }

  function encodeCharge({
    from, to, amount, txId
  }) {
    if (!txId) {
      txId = web3.utils.randomHex(32)
    }

    return ethers.utils.defaultAbiCoder.encode(
      [
        'address',
        'address',
        'uint',
        'bytes32'
      ],
      [
        from,
        to,
        amount,
        txId
      ]
    )
  }

  describe('constructor()', () => {
    it('should set the token and member', async () => {
      assert.equal(await creditSystem.token(), token.address)
      assert.equal(await creditSystem.memberManager(), memberManager.address)
    })
  })

  describe('stake()', () => {
    it('should initialize a new user with credit', async () => {
      await stake(stakeAmount, user1)

      assert.equal(await creditSystem.creditScore(user1), toWei('400'))
      assert.equal(await creditSystem.stakes(user1), toWei('100'))
    })
  })

  describe('unstake()', () => {
    beforeEach(async () => {
      await stake(stakeAmount, user1)
    })

    it('should start the unstake delay', async () => {
      const { receipt } = await creditSystem.unstake({ from: user1 })
      
      // delay should be set and credit zero
      assert.equal(await creditSystem.unstakedAt(user1), receipt.blockNumber)
      assert.equal(await creditSystem.creditScore(user1), '0')
    })
  })

  describe('withdraw()', () => {
    beforeEach(async () => {
      await stake(stakeAmount, user1)
    })

    it('should not allow a withdraw before unstaking', async () => {
      let failed = true
      try {
        await creditSystem.withdraw({ from: user1 })
        failed = false
      } catch (e) {}
      assert.ok(failed)
    })

    it('should not allow a withdraw before the unstake delay is over', async () => {
      await creditSystem.unstake({ from: user1 })
      let failed = true
      try {
        await creditSystem.withdraw({ from: user1 })
        failed = false
      } catch (e) {}
      assert.ok(failed)
    })

    it('should allow a withdraw after the unstake delay is over', async () => {
      await creditSystem.unstake({ from: user1 })
      await mineBlocks(unstakeDelay)
      const oldBalance = await token.balanceOf(user1)
      await creditSystem.withdraw({ from: user1 })

      assert.equal(await creditSystem.stakes(user1), '0')
      assert.equal(await token.balanceOf(user1), oldBalance.add(new BN(stakeAmount)).toString())
    })
  })

  describe('charge()', () => {
    beforeEach(async () => {
      // await stake(stakeAmount, user1)
    })
    
    it('should transfer funds to the recipient', async () => {
      const amount = toWei('10')
      const data = encodeCharge({ from: user1, to: user2, amount })
      
      const dataHash = web3.utils.soliditySha3(data)
      const signature = await web3.eth.sign(dataHash, user1)

      const r = signature.substr(0, 66)
      const s = '0x' + signature.substr(66, 64)
      const v = '0x' + signature.substr(130, 2)
      
      assert.equal(await creditSystem.recover(dataHash, v, r, s), user1)
    })
  })
})