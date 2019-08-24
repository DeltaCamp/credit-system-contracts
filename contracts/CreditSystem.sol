pragma solidity ^0.5.10;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "fixidity/contracts/FixidityLib.sol";

import "./MemberManager.sol";

contract CreditSystem is Initializable {
  using SafeMath for uint256;

  event Charged(address indexed from, address indexed to, uint256 amount, bytes32 txId);

  IERC20 public token;
  MemberManager public memberManager;
  uint256 unstakeDelay;
  mapping(address => uint256) public stakes;
  mapping(address => uint256) public unstakedAt;
  mapping(bytes32 => bool) transactionUsed;
  mapping(address => uint256) creditScores;
  mapping(address => bool) existingUsers;

  function initialize (
    address _token,
    address _memberManager,
    uint256 _unstakeDelay
  ) public initializer {
    require(_token != address(0), "token is not defined");
    token = IERC20(_token);
    memberManager = MemberManager(_memberManager);
    unstakeDelay = _unstakeDelay;
  }

  function stake(uint256 _amount) public {
    stakes[msg.sender] = stakes[msg.sender].add(_amount);
    // If they are a new user
    if (!existingUsers[msg.sender]) {
      creditScores[msg.sender] = 400 * 10 ** 18;
      existingUsers[msg.sender] = true;
    }
    unstakedAt[msg.sender] = 0;
    require(token.transferFrom(msg.sender, address(this), _amount), "could not transfer tokens");
  }

  function unstake() public {
    require(unstakedAt[msg.sender] == 0, "unstake was already requested");
    unstakedAt[msg.sender] = block.number;
  }

  function withdraw() public {
    require(stakeCanBeWithdrawn(msg.sender), "stake cannot be withdrawn");
    uint256 balance = stakes[msg.sender];
    stakes[msg.sender] = 0;
    require(token.transfer(msg.sender, balance), "could not transfer tokens");
  }

  function stakeCanBeWithdrawn(address _addr) public view returns (bool) {
    return unstakedAt[_addr] + unstakeDelay <= block.number;
  }

  function isValid(bytes memory data, bytes memory signature) public view returns (bool) {
    (
      address from,
      address to,
      uint amount,
      bytes32 txId
    ) = abi.decode(data, (address, address, uint, bytes32));

    (
      uint8 v,
      bytes32 r,
      bytes32 s
    ) = abi.decode(signature, (uint8, bytes32, bytes32));

    bool signatoryValid = recover(keccak256(data), v, r, s) == from;
    bool sufficientFunds = availableBalanceOf(from) > amount;
    bool transactionNew = !transactionUsed[txId];

    return signatoryValid && sufficientFunds && transactionNew;
  }

  function charge(bytes memory data, bytes32 r, bytes32 s, uint8 v) public {
    (
      address from,
      address to,
      uint amount,
      bytes32 txId
    ) = abi.decode(data, (address, address, uint, bytes32));

    require(recover(keccak256(data), v, r, s) == from, "signature of signer is invalid");
    require(!transactionUsed[txId], "transaction has already been used");
    transactionUsed[txId] = true;

    uint256 availableBalance = availableBalanceOf(from);
    uint256 remainder;
    if (availableBalance < amount) {
      remainder = amount.sub(availableBalance);
    }

    require(token.transferFrom(from, to, amount.sub(remainder)), "could not transfer from sender");

    if (remainder > 0) {
      // demerit their credit score
      creditScores[from] = calculateCreditInfraction(creditScores[from], stakes[from], remainder);

      if (remainder > stakes[from]) {
        require(token.transfer(to, stakes[from]), "could not transfer stake");
        stakes[from] = 0;
      } else {
        require(token.transfer(to, remainder), "could not transfer remainder from stake");
        stakes[from] = stakes[from].sub(remainder);
      }
    } else {
      // boost their credit score
    }

    emit Charged(from, to, amount, txId);
  }

  function calculateCreditInfraction(uint256 _credit, uint256 _stake, uint256 _remainder) public pure returns (uint256) {
    // max infraction is 20% of their credit score.
    int256 remainderFixed = FixidityLib.newFixed(int256(_remainder));
    int256 stakeFixed = FixidityLib.newFixed(int256(_stake));
    int256 fractionFixed = FixidityLib.divide(remainderFixed, stakeFixed);

    // 0.8 + 0.2 ( fraction )
    int256 creditFractionFixed = FixidityLib.add(
      FixidityLib.newFixed(8, uint8(1)),
      FixidityLib.multiply(
        FixidityLib.newFixed(2, uint8(1)),
        fractionFixed
      )
    );

    return uint256(FixidityLib.fromFixed(FixidityLib.multiply(creditFractionFixed, FixidityLib.newFixed(int256(_credit)))));
  }

  function availableBalanceOf(address _addr) public view returns (uint256) {
    uint256 allowance = token.allowance(_addr, address(this));
    uint256 balance = token.balanceOf(_addr);
    if (allowance < balance) {
      return allowance;
    } else {
      return balance;
    }
  }

  function recoverHashed(bytes memory data, uint8 v, bytes32 r, bytes32 s) public pure returns (address) {
    return recover(keccak256(data), v, r, s);
  }

  function recover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) public pure returns (address) {
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, hash));
    return ecrecover(prefixedHash, v, r, s);
  }

  function creditScore(address _addr) public view returns (uint256) {
    if (!memberManager.isMember(_addr)) {
      return 0;
    }
    if (unstakedAt[_addr] > 0) {
      return 0;
    }
    return creditScores[_addr];
  }
}