pragma solidity ^0.5.10;

import "@openzeppelin/upgrades/contracts/Initializable.sol";

contract MemberManager is Initializable {
  function isMember(address _addr) public pure returns (bool) {
    return _addr != address(0);
  }
}