// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ContextStorage, Context} from "../metatx/ContextStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ContextStorageDev is ContextStorage, Ownable {
    event TestResult(address sender, bytes arg, bytes cdata);

    function test(bytes calldata arg) external {
        emit TestResult(_msgSender(), arg, _msgData());
    }

    function lockTrustedForwarders() external onlyOwner {
        _lockTrustedForwarders();
    }

    function setTrustedForwarder(address forwarder, bool active) external onlyOwner {
        _setTrustedForwarder(forwarder, active);
    }

    function _msgData() internal view virtual override(ContextStorage, Context) returns (bytes calldata) {
        return ContextStorage._msgData();
    }

    function _msgSender() internal view virtual override(ContextStorage, Context) returns (address) {
        return ContextStorage._msgSender();
    }
}
