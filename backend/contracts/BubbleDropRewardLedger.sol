// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BubbleDropRewardLedger
/// @notice Records durable BubbleDrop reward settlement and ownership state.
contract BubbleDropRewardLedger {
    error NotOwner();
    error NotWriter();
    error ZeroAddress();
    error ZeroHash();
    error ClaimAlreadyRecorded();

    address public owner;
    address public writer;

    struct ClaimSettlement {
        bool recorded;
        address wallet;
        address tokenContract;
        bytes32 tokenSymbolHash;
        uint256 amount;
        bytes32 payoutTxHash;
        uint64 recordedAt;
    }

    struct OwnershipRecord {
        bool owned;
        uint8 rewardType;
        bytes32 sourceIdHash;
        uint64 grantedAt;
    }

    mapping(bytes32 => ClaimSettlement) private claimSettlements;
    mapping(address => mapping(bytes32 => OwnershipRecord)) private ownershipRecords;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WriterUpdated(address indexed previousWriter, address indexed newWriter);
    event ClaimSettlementRecorded(
        bytes32 indexed claimIdHash,
        address indexed wallet,
        address indexed tokenContract,
        bytes32 tokenSymbolHash,
        uint256 amount,
        bytes32 payoutTxHash
    );
    event OwnershipGranted(
        address indexed wallet,
        bytes32 indexed rewardKeyHash,
        uint8 rewardType,
        bytes32 sourceIdHash
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

    function recordClaimSettlement(
        bytes32 claimIdHash,
        address wallet,
        address tokenContract,
        bytes32 tokenSymbolHash,
        uint256 amount,
        bytes32 payoutTxHash
    ) external onlyWriter {
        if (claimIdHash == bytes32(0) || tokenSymbolHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (wallet == address(0) || tokenContract == address(0)) {
            revert ZeroAddress();
        }
        if (claimSettlements[claimIdHash].recorded) {
            revert ClaimAlreadyRecorded();
        }

        claimSettlements[claimIdHash] = ClaimSettlement({
            recorded: true,
            wallet: wallet,
            tokenContract: tokenContract,
            tokenSymbolHash: tokenSymbolHash,
            amount: amount,
            payoutTxHash: payoutTxHash,
            recordedAt: uint64(block.timestamp)
        });

        emit ClaimSettlementRecorded(
            claimIdHash,
            wallet,
            tokenContract,
            tokenSymbolHash,
            amount,
            payoutTxHash
        );
    }

    function grantOwnership(
        address wallet,
        bytes32 rewardKeyHash,
        uint8 rewardType,
        bytes32 sourceIdHash
    ) external onlyWriter {
        if (wallet == address(0)) revert ZeroAddress();
        if (rewardKeyHash == bytes32(0) || sourceIdHash == bytes32(0)) {
            revert ZeroHash();
        }

        OwnershipRecord storage existing = ownershipRecords[wallet][rewardKeyHash];
        if (existing.owned) {
            return;
        }

        ownershipRecords[wallet][rewardKeyHash] = OwnershipRecord({
            owned: true,
            rewardType: rewardType,
            sourceIdHash: sourceIdHash,
            grantedAt: uint64(block.timestamp)
        });

        emit OwnershipGranted(wallet, rewardKeyHash, rewardType, sourceIdHash);
    }

    function hasOwnership(address wallet, bytes32 rewardKeyHash) external view returns (bool) {
        return ownershipRecords[wallet][rewardKeyHash].owned;
    }

    function getOwnershipStates(
        address wallet,
        bytes32[] calldata rewardKeyHashes
    ) external view returns (bool[] memory ownedStates) {
        ownedStates = new bool[](rewardKeyHashes.length);
        for (uint256 i = 0; i < rewardKeyHashes.length; i++) {
            ownedStates[i] = ownershipRecords[wallet][rewardKeyHashes[i]].owned;
        }
    }

    function getClaimSettlement(
        bytes32 claimIdHash
    )
        external
        view
        returns (
            bool recorded,
            address wallet,
            address tokenContract,
            bytes32 tokenSymbolHash,
            uint256 amount,
            bytes32 payoutTxHash,
            uint64 recordedAt
        )
    {
        ClaimSettlement memory settlement = claimSettlements[claimIdHash];
        return (
            settlement.recorded,
            settlement.wallet,
            settlement.tokenContract,
            settlement.tokenSymbolHash,
            settlement.amount,
            settlement.payoutTxHash,
            settlement.recordedAt
        );
    }
}
