// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DonationRegistry
 * @dev Smart contract for recording and tracking donations on Saga blockchain
 * @notice This contract maintains transparency for all donations in the Ytili platform
 */
contract DonationRegistry is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    
    // Donation status enum
    enum DonationStatus {
        PENDING,
        VERIFIED,
        MATCHED,
        SHIPPED,
        DELIVERED,
        COMPLETED,
        CANCELLED
    }
    
    // Donation type enum
    enum DonationType {
        MEDICATION,
        MEDICAL_SUPPLY,
        FOOD,
        CASH
    }
    
    // Donation struct
    struct Donation {
        string donationId;          // UUID from Supabase
        address donor;              // Donor's wallet address (optional)
        string donorId;             // Donor's ID from Supabase
        string recipientId;         // Recipient's ID from Supabase
        DonationType donationType;
        string title;
        string description;
        uint256 amount;             // For cash donations (in wei equivalent)
        string itemName;            // For physical donations
        uint256 quantity;
        string unit;
        DonationStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        string metadataHash;        // IPFS hash for additional data
        bool exists;
    }
    
    // Transaction struct for audit trail
    struct DonationTransaction {
        string donationId;
        string transactionType;
        string description;
        string actorId;
        string actorType;
        uint256 timestamp;
        string metadataHash;
        string previousHash;
        string transactionHash;
    }
    
    // Storage
    mapping(string => Donation) public donations;
    mapping(string => DonationTransaction[]) public donationTransactions;
    mapping(string => uint256) public donationCounts;
    
    string[] public allDonationIds;
    uint256 public totalDonations;
    
    // Events
    event DonationRecorded(
        string indexed donationId,
        string indexed donorId,
        DonationType donationType,
        string title,
        uint256 amount,
        uint256 timestamp
    );
    
    event StatusUpdated(
        string indexed donationId,
        DonationStatus oldStatus,
        DonationStatus newStatus,
        string actorId,
        uint256 timestamp
    );
    
    event TransactionRecorded(
        string indexed donationId,
        string transactionType,
        string actorId,
        string transactionHash,
        uint256 timestamp
    );
    
    event DonationMatched(
        string indexed donationId,
        string donorId,
        string recipientId,
        uint256 timestamp
    );
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(RECORDER_ROLE, msg.sender);
    }
    
    /**
     * @dev Record a new donation on the blockchain
     * @param donationId UUID from Supabase
     * @param donorId Donor's ID from Supabase
     * @param donationType Type of donation
     * @param title Donation title
     * @param description Donation description
     * @param amount Amount for cash donations
     * @param itemName Item name for physical donations
     * @param quantity Quantity of items
     * @param unit Unit of measurement
     * @param metadataHash IPFS hash for additional metadata
     */
    function recordDonation(
        string memory donationId,
        string memory donorId,
        DonationType donationType,
        string memory title,
        string memory description,
        uint256 amount,
        string memory itemName,
        uint256 quantity,
        string memory unit,
        string memory metadataHash
    ) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(!donations[donationId].exists, "Donation already exists");
        require(bytes(donationId).length > 0, "Invalid donation ID");
        require(bytes(donorId).length > 0, "Invalid donor ID");
        
        Donation memory newDonation = Donation({
            donationId: donationId,
            donor: address(0), // Will be set if donor connects wallet
            donorId: donorId,
            recipientId: "",
            donationType: donationType,
            title: title,
            description: description,
            amount: amount,
            itemName: itemName,
            quantity: quantity,
            unit: unit,
            status: DonationStatus.PENDING,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            metadataHash: metadataHash,
            exists: true
        });
        
        donations[donationId] = newDonation;
        allDonationIds.push(donationId);
        totalDonations++;
        
        // Record initial transaction
        _recordTransaction(
            donationId,
            "donation_created",
            "Donation recorded on blockchain",
            donorId,
            "donor",
            metadataHash
        );
        
        emit DonationRecorded(
            donationId,
            donorId,
            donationType,
            title,
            amount,
            block.timestamp
        );
    }
    
    /**
     * @dev Update donation status
     * @param donationId Donation ID
     * @param newStatus New status
     * @param actorId Actor performing the update
     * @param actorType Type of actor (donor, hospital, admin)
     * @param description Description of the status change
     */
    function updateDonationStatus(
        string memory donationId,
        DonationStatus newStatus,
        string memory actorId,
        string memory actorType,
        string memory description
    ) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(donations[donationId].exists, "Donation does not exist");
        
        DonationStatus oldStatus = donations[donationId].status;
        donations[donationId].status = newStatus;
        donations[donationId].updatedAt = block.timestamp;
        
        // Record transaction
        _recordTransaction(
            donationId,
            string(abi.encodePacked("status_changed_to_", _statusToString(newStatus))),
            description,
            actorId,
            actorType,
            ""
        );
        
        emit StatusUpdated(donationId, oldStatus, newStatus, actorId, block.timestamp);
    }
    
    /**
     * @dev Match donation with recipient
     * @param donationId Donation ID
     * @param recipientId Recipient ID from Supabase
     * @param actorId Actor performing the matching
     */
    function matchDonation(
        string memory donationId,
        string memory recipientId,
        string memory actorId
    ) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(donations[donationId].exists, "Donation does not exist");
        require(donations[donationId].status == DonationStatus.VERIFIED, "Donation must be verified");
        require(bytes(recipientId).length > 0, "Invalid recipient ID");
        
        donations[donationId].recipientId = recipientId;
        donations[donationId].status = DonationStatus.MATCHED;
        donations[donationId].updatedAt = block.timestamp;
        
        // Record transaction
        _recordTransaction(
            donationId,
            "donation_matched",
            string(abi.encodePacked("Donation matched with recipient: ", recipientId)),
            actorId,
            "hospital",
            ""
        );
        
        emit DonationMatched(donationId, donations[donationId].donorId, recipientId, block.timestamp);
    }
    
    /**
     * @dev Get donation details
     * @param donationId Donation ID
     * @return Donation struct
     */
    function getDonation(string memory donationId) external view returns (Donation memory) {
        require(donations[donationId].exists, "Donation does not exist");
        return donations[donationId];
    }
    
    /**
     * @dev Get donation transaction history
     * @param donationId Donation ID
     * @return Array of transactions
     */
    function getDonationHistory(string memory donationId) external view returns (DonationTransaction[] memory) {
        return donationTransactions[donationId];
    }
    
    /**
     * @dev Get all donation IDs (paginated)
     * @param offset Starting index
     * @param limit Number of items to return
     * @return Array of donation IDs
     */
    function getAllDonations(uint256 offset, uint256 limit) external view returns (string[] memory) {
        require(offset < allDonationIds.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > allDonationIds.length) {
            end = allDonationIds.length;
        }
        
        string[] memory result = new string[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allDonationIds[i];
        }
        
        return result;
    }
    
    /**
     * @dev Internal function to record transactions
     */
    function _recordTransaction(
        string memory donationId,
        string memory transactionType,
        string memory description,
        string memory actorId,
        string memory actorType,
        string memory metadataHash
    ) internal {
        DonationTransaction[] storage transactions = donationTransactions[donationId];
        
        string memory previousHash = "";
        if (transactions.length > 0) {
            previousHash = transactions[transactions.length - 1].transactionHash;
        }
        
        // Generate transaction hash (simplified)
        string memory transactionHash = _generateTransactionHash(
            donationId,
            transactionType,
            actorId,
            block.timestamp,
            previousHash
        );
        
        DonationTransaction memory newTransaction = DonationTransaction({
            donationId: donationId,
            transactionType: transactionType,
            description: description,
            actorId: actorId,
            actorType: actorType,
            timestamp: block.timestamp,
            metadataHash: metadataHash,
            previousHash: previousHash,
            transactionHash: transactionHash
        });
        
        transactions.push(newTransaction);
        
        emit TransactionRecorded(donationId, transactionType, actorId, transactionHash, block.timestamp);
    }
    
    /**
     * @dev Generate transaction hash
     */
    function _generateTransactionHash(
        string memory donationId,
        string memory transactionType,
        string memory actorId,
        uint256 timestamp,
        string memory previousHash
    ) internal pure returns (string memory) {
        bytes32 hash = keccak256(abi.encodePacked(
            donationId,
            transactionType,
            actorId,
            timestamp,
            previousHash
        ));
        return _bytes32ToString(hash);
    }
    
    /**
     * @dev Convert bytes32 to string
     */
    function _bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }
    
    /**
     * @dev Convert status enum to string
     */
    function _statusToString(DonationStatus status) internal pure returns (string memory) {
        if (status == DonationStatus.PENDING) return "pending";
        if (status == DonationStatus.VERIFIED) return "verified";
        if (status == DonationStatus.MATCHED) return "matched";
        if (status == DonationStatus.SHIPPED) return "shipped";
        if (status == DonationStatus.DELIVERED) return "delivered";
        if (status == DonationStatus.COMPLETED) return "completed";
        if (status == DonationStatus.CANCELLED) return "cancelled";
        return "unknown";
    }
    
    // Admin functions
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    function grantRecorderRole(address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(RECORDER_ROLE, account);
    }
    
    function revokeRecorderRole(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(RECORDER_ROLE, account);
    }
}
