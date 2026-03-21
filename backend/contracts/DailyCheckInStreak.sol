// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DailyCheckInStreak
/// @notice Stores onchain daily check-in streaks, written by an authorized backend signer.
contract DailyCheckInStreak {
    error NotOwner();
    error NotWriter();
    error ZeroAddress();
    error InvalidDay();
    error AlreadyCheckedInForDay();

    address public owner;
    address public writer;

    struct StreakState {
        uint32 streak;
        uint32 lastCheckInDay;
    }

    mapping(address => StreakState) private streaks;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WriterUpdated(address indexed previousWriter, address indexed newWriter);
    event DailyCheckInRecorded(
        address indexed wallet,
        uint32 indexed dayKey,
        uint32 newStreak
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

    function _assertCheckInCaller(address wallet) private view {
        if (msg.sender == writer) {
            return;
        }
        if (msg.sender == wallet) {
            return;
        }
        revert NotWriter();
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

    /// @notice Records a daily check-in for a wallet.
    /// @param wallet Wallet address that owns the streak.
    /// @param dayKey Day number since Unix epoch in UTC.
    function checkIn(address wallet, uint32 dayKey) external returns (uint32) {
        _assertCheckInCaller(wallet);
        if (wallet == address(0)) revert ZeroAddress();

        StreakState storage state = streaks[wallet];
        uint32 lastDay = state.lastCheckInDay;

        if (lastDay == dayKey) revert AlreadyCheckedInForDay();
        if (lastDay > dayKey) revert InvalidDay();

        uint32 newStreak;
        if (lastDay + 1 == dayKey) {
            newStreak = state.streak + 1;
        } else {
            newStreak = 1;
        }

        state.streak = newStreak;
        state.lastCheckInDay = dayKey;

        emit DailyCheckInRecorded(wallet, dayKey, newStreak);
        return newStreak;
    }

    function getStreakState(address wallet) external view returns (uint32 streak, uint32 lastCheckInDay) {
        StreakState memory state = streaks[wallet];
        return (state.streak, state.lastCheckInDay);
    }
}
