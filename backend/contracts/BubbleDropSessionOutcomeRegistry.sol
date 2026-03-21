// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BubbleDropSessionOutcomeRegistry
/// @notice Stores compact end-of-session BubbleDrop outcomes written by an authorized backend signer.
contract BubbleDropSessionOutcomeRegistry {
    error NotOwner();
    error NotWriter();
    error ZeroAddress();
    error ZeroHash();
    error OutcomeAlreadyRecorded();

    address public owner;
    address public writer;

    struct SessionOutcome {
        bool exists;
        address wallet;
        uint32 xpGained;
        uint32 finalScore;
        uint16 bestCombo;
        uint16 activeSeconds;
        uint16 durationSeconds;
        uint32 rewardFlags;
        bytes32 integrityHash;
        uint64 recordedAt;
    }

    mapping(bytes32 => SessionOutcome) private outcomes;
    mapping(address => bytes32) private latestOutcomeIdByWallet;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WriterUpdated(address indexed previousWriter, address indexed newWriter);
    event SessionOutcomeRecorded(
        bytes32 indexed sessionIdHash,
        address indexed wallet,
        uint32 xpGained,
        uint32 finalScore,
        uint16 bestCombo,
        uint32 rewardFlags,
        bytes32 integrityHash
    );

    constructor(address initialOwner, address initialWriter) {
        if (initialOwner == address(0) || initialWriter == address(0)) {
            revert ZeroAddress();
        }

        owner = initialOwner;
        writer = initialWriter;

        emit OwnershipTransferred(address(0), initialOwner);
        emit WriterUpdated(address(0), initialWriter);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyWriter() {
        if (msg.sender != writer) revert NotWriter();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setWriter(address newWriter) external onlyOwner {
        if (newWriter == address(0)) revert ZeroAddress();
        address previousWriter = writer;
        writer = newWriter;
        emit WriterUpdated(previousWriter, newWriter);
    }

    function recordOutcome(
        bytes32 sessionIdHash,
        address wallet,
        uint32 xpGained,
        uint32 finalScore,
        uint16 bestCombo,
        uint16 activeSeconds,
        uint16 durationSeconds,
        uint32 rewardFlags,
        bytes32 integrityHash
    ) external onlyWriter {
        if (sessionIdHash == bytes32(0) || integrityHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (wallet == address(0)) revert ZeroAddress();
        if (outcomes[sessionIdHash].exists) revert OutcomeAlreadyRecorded();

        outcomes[sessionIdHash] = SessionOutcome({
            exists: true,
            wallet: wallet,
            xpGained: xpGained,
            finalScore: finalScore,
            bestCombo: bestCombo,
            activeSeconds: activeSeconds,
            durationSeconds: durationSeconds,
            rewardFlags: rewardFlags,
            integrityHash: integrityHash,
            recordedAt: uint64(block.timestamp)
        });
        latestOutcomeIdByWallet[wallet] = sessionIdHash;

        emit SessionOutcomeRecorded(
            sessionIdHash,
            wallet,
            xpGained,
            finalScore,
            bestCombo,
            rewardFlags,
            integrityHash
        );
    }

    function getOutcome(
        bytes32 sessionIdHash
    )
        external
        view
        returns (
            bool exists,
            address wallet,
            uint32 xpGained,
            uint32 finalScore,
            uint16 bestCombo,
            uint16 activeSeconds,
            uint16 durationSeconds,
            uint32 rewardFlags,
            bytes32 integrityHash,
            uint64 recordedAt
        )
    {
        SessionOutcome memory outcome = outcomes[sessionIdHash];
        return (
            outcome.exists,
            outcome.wallet,
            outcome.xpGained,
            outcome.finalScore,
            outcome.bestCombo,
            outcome.activeSeconds,
            outcome.durationSeconds,
            outcome.rewardFlags,
            outcome.integrityHash,
            outcome.recordedAt
        );
    }

    function getLatestOutcome(
        address wallet
    )
        external
        view
        returns (
            bool exists,
            bytes32 sessionIdHash,
            uint32 xpGained,
            uint32 finalScore,
            uint16 bestCombo,
            uint16 activeSeconds,
            uint16 durationSeconds,
            uint32 rewardFlags,
            bytes32 integrityHash,
            uint64 recordedAt
        )
    {
        sessionIdHash = latestOutcomeIdByWallet[wallet];
        if (sessionIdHash == bytes32(0)) {
            return (false, bytes32(0), 0, 0, 0, 0, 0, 0, bytes32(0), 0);
        }

        SessionOutcome memory outcome = outcomes[sessionIdHash];
        return (
            outcome.exists,
            sessionIdHash,
            outcome.xpGained,
            outcome.finalScore,
            outcome.bestCombo,
            outcome.activeSeconds,
            outcome.durationSeconds,
            outcome.rewardFlags,
            outcome.integrityHash,
            outcome.recordedAt
        );
    }
}
