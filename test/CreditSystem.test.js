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
  const unstakeDelay = 4

  const wallet = ethers.Wallet.createRandom().connect(new ethers.providers.JsonRpcProvider('http://localhost:8545'))

  let cs, t

  beforeEach(async () => {
    memberManager = await MemberManager.new()
    token = await Token.new()
    fixidityLib = await FixidityLib.new()
    await token.initialize(owner)
    CreditSystem.link("FixidityLib", fixidityLib.address)

    await token.mint(user1, toWei('10000'))
    await token.mint(user2, toWei('10000'))

    await web3.eth.sendTransaction({ from: owner, to: wallet.address, value: toWei('100') })

    await createCreditSystem()
  })

  function ethersCreditSystem(w) {
    return new ethers.Contract(creditSystem.address, creditSystem.abi, w || wallet)
  }

  function ethersToken(w) {
    return new ethers.Contract(token.address, token.abi, w || wallet)
  }

  async function ethersStake() {
    cs = ethersCreditSystem()
    t = ethersToken()

    await t.approve(cs.address, ethers.utils.bigNumberify(toWei('1000000')))
    await cs.stake(ethers.utils.bigNumberify(toWei('100')))
  }

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
      txId = ethers.utils.randomBytes(32)
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

  async function sign(data) {
    const dataHash = ethers.utils.keccak256(data)
    const bin = ethers.utils.arrayify(dataHash)
    const signature = await wallet.signMessage(bin)
    return ethers.utils.splitSignature(signature)
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

  describe('calculateCreditInfraction()', () => {
    let credit, overdraft, overage

    it('should do nothing when there is no remainder', async () => {
      credit = toWei('400')
      overdraft = toWei('100')
      overage = toWei('0')
      const newCredit = await creditSystem.calculateCreditInfraction(credit, overdraft, overage)
      assert.equal(newCredit.toString(), toWei('400'))
    })

    it('should slash the credit when the stake is entirely used', async () => {
      credit = toWei('400')
      overdraft = toWei('100')
      overage = toWei('100')
      // => 1 - (300 / 500) = 0.4
      const newCredit = await creditSystem.calculateCreditInfraction(credit, overdraft, overage)
      assert.equal(newCredit.toString(), toWei('160'))

      overdraft = toWei('0')
      overage = toWei('40')
      let nextCredit = await creditSystem.calculateCreditInfraction(toWei('160'), overdraft, overage)
      // => 1 - (120 / 160) = 
      assert.equal(nextCredit.toString(), toWei('40'))
    })

    it('should ruin the credit when the stake is blown past', async () => {
      credit = toWei('400')
      overdraft = toWei('100')
      overage = toWei('200')
      const newCredit = await creditSystem.calculateCreditInfraction(credit, overdraft, overage)
      assert.equal(newCredit.toString(), toWei('0'))
    })

    it('should ruin the credit when the stake is blown past', async () => {
      credit = toWei('400')
      overdraft = toWei('100')
      overage = toWei('150')

      // 150 * 3 / 400 + 100
      // 450 / 500 = 0.9
      // 0.9 * 400 = slash 90%
      // => 10% left or 40
      const newCredit = await creditSystem.calculateCreditInfraction(credit, overdraft, overage)
      assert.equal(newCredit.toString(), toWei('40'))
    })

    it('should gracefully handle zero credit situation', async () => {
      credit = toWei('0')
      overdraft = toWei('0')
      overage = toWei('200')
      const newCredit = await creditSystem.calculateCreditInfraction(credit, overdraft, overage)
      assert.equal(newCredit.toString(), toWei('0'))
    })
  })

  describe('charge()', () => {
    let amount, data, sig

    describe('when the sender has excess balance', () => {
      beforeEach(async () => {
        await token.mint(wallet.address, toWei('10000'))
        await ethersStake()    
        amount = toWei('10')
        data = encodeCharge({ from: wallet.address, to: user2, amount })
        sig = await sign(data)
      })
      
      it('should transfer funds to the recipient', async () => {
        const balanceBefore = await token.balanceOf(user2)
        
        await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })
  
        assert.equal(await token.balanceOf(user2), balanceBefore.add(new BN(amount)).toString())
      })
  
      it('should reject tx when replayed', async () => {
        await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })
        let failed = true
        try {
          await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })
          failed = false
        } catch (e) {}
        assert.ok(failed)
      })
    })

    describe('when the sender has zero balance', () => {
      beforeEach(async () => {
        await token.mint(wallet.address, toWei('100'))
        await ethersStake()
      })

      it('should ruin their credit when they blow past their stake', async () => {
        amount = toWei('150')

        assert.equal((await creditSystem.availableBalanceOf(wallet.address)).toString(), toWei('0'))
        assert.equal((await creditSystem.creditScore(wallet.address)).toString(), toWei('400'))
        assert.equal((await creditSystem.stakes(wallet.address)).toString(), toWei('100'))

        data = encodeCharge({ from: wallet.address, to: user2, amount })
        sig = await sign(data)

        await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })

        assert.equal((await creditSystem.creditScore(wallet.address)).toString(), toWei('40'))
      })

      it('should partially slash the senders credit when they drain part of their stake', async () => {
        amount = toWei('50')

        data = encodeCharge({ from: wallet.address, to: user2, amount })
        sig = await sign(data)

        await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })

        assert.equal((await creditSystem.creditScore(wallet.address)).toString(), toWei('280'))
      })

      it('should slash the senders credit when they drain their stake', async () => {
        amount = toWei('100')

        data = encodeCharge({ from: wallet.address, to: user2, amount })
        sig = await sign(data)

        await creditSystem.charge(data, sig.r, sig.s, sig.v, { from: user2 })

        assert.equal((await creditSystem.creditScore(wallet.address)).toString(), toWei('160'))
      })
    })
  })
})