//SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/// @dev 2771 Context with configurable forwarders
/// _msgSender() and _msgData() are ERC2771Context from OpenZeppelin
abstract contract ContextStorage is Context {
    event TrustedForwardersLocked(address sender);
    event SetTrustedForwarder(address indexed forwarder, bool active, address sender);

    mapping(address => bool) private _trustedForwarders;
    bool public trustedForwardersLocked = false;

    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return _trustedForwarders[forwarder];
    }

    /// @dev use with care, check permissions
    function _lockTrustedForwarders() internal {
        require(!trustedForwardersLocked, "ContextStorage: locked");
        emit TrustedForwardersLocked(msg.sender);
        trustedForwardersLocked = true;
    }

    /// @dev use with care, check permissions
    function _setTrustedForwarder(address forwarder, bool active) internal {
        require(!trustedForwardersLocked, "ContextStorage: locked");
        emit SetTrustedForwarder(forwarder, active, msg.sender);
        _trustedForwarders[forwarder] = active;
    }

    function _msgSender() internal view virtual override returns (address) {
        if (isTrustedForwarder(msg.sender)) {
            address sender;
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            /// @solidity memory-safe-assembly
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
            return sender;
        } else {
            return super._msgSender();
        }
    }

    function _msgData() internal view virtual override returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return super._msgData();
        }
    }
}
