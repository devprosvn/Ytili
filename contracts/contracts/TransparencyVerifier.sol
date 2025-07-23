// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./DonationRegistry.sol";

/**
 * @title TransparencyVerifier
 * @dev Smart contract for verifying transaction integrity and transparency
 * @notice This contract provides verification mechanisms for the Ytili platform
 */
contract TransparencyVerifier is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    DonationRegistry public donationRegistry;
    
    // Verification result struct
    struct VerificationResult {
        bool isValid;
        uint256 totalTransactions;
        uint256 brokenLinks;
        uint256 invalidHashes;
        string[] issues;
        uint256 verifiedAt;
    }
    
    // Merkle tree for batch verification
    struct MerkleVerification {
        bytes32 merkleRoot;
        string[] donationIds;
        uint256 createdAt;
        address verifier;
        bool isValid;
    }
    
    // Storage
    mapping(string => VerificationResult) public verificationResults;
    mapping(bytes32 => MerkleVerification) public merkleVerifications;
    mapping(string => uint256) public transparencyScores;
    
    uint256 public totalVerifications;
    bytes32[] public allMerkleRoots;
    
    // Events
    event ChainVerified(
        string indexed donationId,
        bool isValid,
        uint256 totalTransactions,
        uint256 issues,
        uint256 timestamp
    );
    
    event BatchVerified(
        bytes32 indexed merkleRoot,
        uint256 donationCount,
        bool isValid,
        address verifier,
        uint256 timestamp
    );
    
    event TransparencyScoreUpdated(
        string indexed donationId,
        uint256 oldScore,
        uint256 newScore,
        uint256 timestamp
    );
    
    constructor(address _donationRegistry) {
        require(_donationRegistry != address(0), "Invalid registry address");
        
        donationRegistry = DonationRegistry(_donationRegistry);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }
    
    /**
     * @dev Verify transaction chain integrity for a donation
     * @param donationId Donation ID to verify
     * @return VerificationResult struct with verification details
     */
    function verifyTransactionChain(string memory donationId) 
        external 
        onlyRole(VERIFIER_ROLE) 
        returns (VerificationResult memory) 
    {
        require(bytes(donationId).length > 0, "Invalid donation ID");
        
        // Get donation transactions from registry
        DonationRegistry.DonationTransaction[] memory transactions = 
            donationRegistry.getDonationHistory(donationId);
        
        uint256 totalTx = transactions.length;
        uint256 brokenLinks = 0;
        uint256 invalidHashes = 0;
        string[] memory issues = new string[](totalTx * 2); // Max possible issues
        uint256 issueCount = 0;
        
        // Verify chain integrity
        for (uint256 i = 1; i < totalTx; i++) {
            // Check if previous hash matches
            if (keccak256(bytes(transactions[i].previousHash)) != 
                keccak256(bytes(transactions[i-1].transactionHash))) {
                brokenLinks++;
                issues[issueCount] = string(abi.encodePacked("Broken link at transaction ", _uintToString(i)));
                issueCount++;
            }
            
            // Verify transaction hash integrity
            string memory expectedHash = _generateExpectedHash(transactions[i]);
            if (keccak256(bytes(transactions[i].transactionHash)) != keccak256(bytes(expectedHash))) {
                invalidHashes++;
                issues[issueCount] = string(abi.encodePacked("Invalid hash at transaction ", _uintToString(i)));
                issueCount++;
            }
        }
        
        // Resize issues array to actual size
        string[] memory finalIssues = new string[](issueCount);
        for (uint256 i = 0; i < issueCount; i++) {
            finalIssues[i] = issues[i];
        }
        
        bool isValid = (brokenLinks == 0 && invalidHashes == 0);
        
        VerificationResult memory result = VerificationResult({
            isValid: isValid,
            totalTransactions: totalTx,
            brokenLinks: brokenLinks,
            invalidHashes: invalidHashes,
            issues: finalIssues,
            verifiedAt: block.timestamp
        });
        
        verificationResults[donationId] = result;
        totalVerifications++;
        
        // Update transparency score
        uint256 newScore = _calculateTransparencyScore(donationId, result);
        uint256 oldScore = transparencyScores[donationId];
        transparencyScores[donationId] = newScore;
        
        emit ChainVerified(donationId, isValid, totalTx, issueCount, block.timestamp);
        emit TransparencyScoreUpdated(donationId, oldScore, newScore, block.timestamp);
        
        return result;
    }
    
    /**
     * @dev Batch verify multiple donations using Merkle tree
     * @param donationIds Array of donation IDs to verify
     * @param merkleProofs Array of Merkle proofs for each donation
     * @return merkleRoot The Merkle root for this batch
     */
    function batchVerifyDonations(
        string[] memory donationIds,
        bytes32[][] memory merkleProofs
    ) external onlyRole(VERIFIER_ROLE) returns (bytes32) {
        require(donationIds.length > 0, "No donations to verify");
        require(donationIds.length == merkleProofs.length, "Mismatched arrays");
        
        bytes32[] memory leaves = new bytes32[](donationIds.length);
        bool allValid = true;
        
        // Generate leaves for Merkle tree
        for (uint256 i = 0; i < donationIds.length; i++) {
            VerificationResult memory result = verificationResults[donationIds[i]];
            
            // If not verified yet, verify now
            if (result.verifiedAt == 0) {
                result = this.verifyTransactionChain(donationIds[i]);
            }
            
            leaves[i] = keccak256(abi.encodePacked(
                donationIds[i],
                result.isValid,
                result.totalTransactions,
                result.verifiedAt
            ));
            
            if (!result.isValid) {
                allValid = false;
            }
        }
        
        // Calculate Merkle root
        bytes32 merkleRoot = _calculateMerkleRoot(leaves);
        
        // Store batch verification
        MerkleVerification memory batchVerification = MerkleVerification({
            merkleRoot: merkleRoot,
            donationIds: donationIds,
            createdAt: block.timestamp,
            verifier: msg.sender,
            isValid: allValid
        });
        
        merkleVerifications[merkleRoot] = batchVerification;
        allMerkleRoots.push(merkleRoot);
        
        emit BatchVerified(merkleRoot, donationIds.length, allValid, msg.sender, block.timestamp);
        
        return merkleRoot;
    }
    
    /**
     * @dev Verify a single donation against a Merkle root
     * @param donationId Donation ID to verify
     * @param merkleRoot Merkle root to verify against
     * @param proof Merkle proof for the donation
     * @return bool True if verification passes
     */
    function verifyAgainstMerkleRoot(
        string memory donationId,
        bytes32 merkleRoot,
        bytes32[] memory proof
    ) external view returns (bool) {
        require(merkleVerifications[merkleRoot].createdAt > 0, "Merkle root not found");
        
        VerificationResult memory result = verificationResults[donationId];
        require(result.verifiedAt > 0, "Donation not verified");
        
        bytes32 leaf = keccak256(abi.encodePacked(
            donationId,
            result.isValid,
            result.totalTransactions,
            result.verifiedAt
        ));
        
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }
    
    /**
     * @dev Get verification result for a donation
     * @param donationId Donation ID
     * @return VerificationResult struct
     */
    function getVerificationResult(string memory donationId) 
        external 
        view 
        returns (VerificationResult memory) 
    {
        return verificationResults[donationId];
    }
    
    /**
     * @dev Get transparency score for a donation
     * @param donationId Donation ID
     * @return uint256 Transparency score (0-100)
     */
    function getTransparencyScore(string memory donationId) external view returns (uint256) {
        return transparencyScores[donationId];
    }
    
    /**
     * @dev Get batch verification details
     * @param merkleRoot Merkle root
     * @return MerkleVerification struct
     */
    function getBatchVerification(bytes32 merkleRoot) 
        external 
        view 
        returns (MerkleVerification memory) 
    {
        return merkleVerifications[merkleRoot];
    }
    
    /**
     * @dev Calculate transparency score based on verification result
     * @param donationId Donation ID
     * @param result Verification result
     * @return uint256 Score (0-100)
     */
    function _calculateTransparencyScore(
        string memory donationId,
        VerificationResult memory result
    ) internal view returns (uint256) {
        uint256 score = 0;
        
        // Base score for having transactions
        if (result.totalTransactions > 0) {
            score += 20;
        }
        
        // Score for chain integrity
        if (result.isValid) {
            score += 30;
        }
        
        // Score for number of transactions
        if (result.totalTransactions >= 5) {
            score += 25;
        } else if (result.totalTransactions >= 3) {
            score += 15;
        } else if (result.totalTransactions >= 1) {
            score += 10;
        }
        
        // Score for verification recency
        if (block.timestamp - result.verifiedAt < 86400) { // 24 hours
            score += 15;
        } else if (block.timestamp - result.verifiedAt < 604800) { // 7 days
            score += 10;
        }
        
        // Penalty for issues
        if (result.brokenLinks > 0) {
            score = score > 20 ? score - 20 : 0;
        }
        if (result.invalidHashes > 0) {
            score = score > 15 ? score - 15 : 0;
        }
        
        return score > 100 ? 100 : score;
    }
    
    /**
     * @dev Generate expected hash for verification
     */
    function _generateExpectedHash(
        DonationRegistry.DonationTransaction memory transaction
    ) internal pure returns (string memory) {
        bytes32 hash = keccak256(abi.encodePacked(
            transaction.donationId,
            transaction.transactionType,
            transaction.actorId,
            transaction.timestamp,
            transaction.previousHash
        ));
        return _bytes32ToHexString(hash);
    }
    
    /**
     * @dev Calculate Merkle root from leaves
     */
    function _calculateMerkleRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "No leaves provided");
        
        if (leaves.length == 1) {
            return leaves[0];
        }
        
        bytes32[] memory currentLevel = leaves;
        
        while (currentLevel.length > 1) {
            bytes32[] memory nextLevel = new bytes32[]((currentLevel.length + 1) / 2);
            
            for (uint256 i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    nextLevel[i / 2] = keccak256(abi.encodePacked(currentLevel[i], currentLevel[i + 1]));
                } else {
                    nextLevel[i / 2] = currentLevel[i];
                }
            }
            
            currentLevel = nextLevel;
        }
        
        return currentLevel[0];
    }
    
    /**
     * @dev Convert bytes32 to hex string
     */
    function _bytes32ToHexString(bytes32 _bytes32) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            str[i*2] = alphabet[uint8(_bytes32[i] >> 4)];
            str[1+i*2] = alphabet[uint8(_bytes32[i] & 0x0f)];
        }
        return string(str);
    }
    
    /**
     * @dev Convert uint to string
     */
    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
    // Admin functions
    function updateDonationRegistry(address _newRegistry) external onlyRole(ADMIN_ROLE) {
        require(_newRegistry != address(0), "Invalid registry address");
        donationRegistry = DonationRegistry(_newRegistry);
    }
    
    function grantVerifierRole(address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(VERIFIER_ROLE, account);
    }
    
    function revokeVerifierRole(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(VERIFIER_ROLE, account);
    }
}
