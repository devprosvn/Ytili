// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title YtiliToken
 * @dev ERC-20 token for the Ytili platform with governance and rewards features
 * @notice This token represents points and rewards in the Ytili ecosystem
 */
contract YtiliToken is ERC20, ERC20Burnable, ERC20Pausable, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REDEEMER_ROLE = keccak256("REDEEMER_ROLE");
    
    // Token configuration
    uint256 public constant MAX_SUPPLY = 1000000000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100000000 * 10**18; // 100 million tokens
    
    // Reward rates (tokens per action)
    uint256 public donationRewardRate = 100 * 10**18; // 100 tokens per donation
    uint256 public verificationRewardRate = 50 * 10**18; // 50 tokens per verification
    uint256 public referralRewardRate = 25 * 10**18; // 25 tokens per referral
    
    // Redemption rates (tokens required)
    mapping(string => uint256) public redemptionRates;
    
    // User balances and rewards
    mapping(address => uint256) public earnedRewards;
    mapping(address => uint256) public redeemedTokens;
    mapping(string => uint256) public userIdToTokens; // Supabase user ID to tokens
    
    // Governance features
    mapping(address => uint256) public votingPower;
    mapping(bytes32 => uint256) public proposalVotes;
    
    // Events
    event RewardEarned(address indexed user, string userId, uint256 amount, string reason);
    event TokensRedeemed(address indexed user, string userId, uint256 amount, string item);
    event RewardRateUpdated(string rewardType, uint256 oldRate, uint256 newRate);
    event RedemptionRateUpdated(string item, uint256 oldRate, uint256 newRate);
    event VoteCast(address indexed voter, bytes32 indexed proposalId, uint256 votes);
    
    constructor() ERC20("Ytili Token", "YTILI") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(REDEEMER_ROLE, msg.sender);
        
        // Mint initial supply to deployer
        _mint(msg.sender, INITIAL_SUPPLY);
        
        // Set initial redemption rates
        _setInitialRedemptionRates();
    }
    
    /**
     * @dev Mint tokens as rewards for platform activities
     * @param to Address to mint tokens to
     * @param userId Supabase user ID
     * @param amount Amount of tokens to mint
     * @param reason Reason for the reward
     */
    function mintReward(
        address to,
        string memory userId,
        uint256 amount,
        string memory reason
    ) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
        
        _mint(to, amount);
        earnedRewards[to] += amount;
        userIdToTokens[userId] += amount;
        
        // Update voting power
        votingPower[to] = balanceOf(to);
        
        emit RewardEarned(to, userId, amount, reason);
    }
    
    /**
     * @dev Mint tokens for donation rewards
     * @param to Address to mint tokens to
     * @param userId Supabase user ID
     * @param donationValue Value of the donation (for calculating bonus)
     */
    function mintDonationReward(
        address to,
        string memory userId,
        uint256 donationValue
    ) external onlyRole(MINTER_ROLE) {
        uint256 baseReward = donationRewardRate;
        uint256 bonusReward = 0;
        
        // Bonus rewards for larger donations
        if (donationValue >= 10000000) { // 10M VND
            bonusReward = baseReward / 2; // 50% bonus
        } else if (donationValue >= 5000000) { // 5M VND
            bonusReward = baseReward / 4; // 25% bonus
        } else if (donationValue >= 1000000) { // 1M VND
            bonusReward = baseReward / 10; // 10% bonus
        }
        
        uint256 totalReward = baseReward + bonusReward;

        require(to != address(0), "Cannot mint to zero address");
        require(totalReward > 0, "Amount must be greater than 0");
        require(totalSupply() + totalReward <= MAX_SUPPLY, "Would exceed max supply");

        _mint(to, totalReward);
        earnedRewards[to] += totalReward;
        userIdToTokens[userId] += totalReward;

        // Update voting power
        votingPower[to] = balanceOf(to);

        emit RewardEarned(to, userId, totalReward, "donation_reward");
    }
    
    /**
     * @dev Redeem tokens for platform benefits
     * @param from Address to burn tokens from
     * @param userId Supabase user ID
     * @param amount Amount of tokens to redeem
     * @param item Item being redeemed
     */
    function redeemTokens(
        address from,
        string memory userId,
        uint256 amount,
        string memory item
    ) external onlyRole(REDEEMER_ROLE) nonReentrant {
        require(from != address(0), "Cannot redeem from zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(from) >= amount, "Insufficient balance");
        
        uint256 requiredTokens = redemptionRates[item];
        require(requiredTokens > 0, "Item not available for redemption");
        require(amount >= requiredTokens, "Insufficient tokens for redemption");
        
        _burn(from, amount);
        redeemedTokens[from] += amount;
        
        // Update voting power
        votingPower[from] = balanceOf(from);
        
        emit TokensRedeemed(from, userId, amount, item);
    }
    
    /**
     * @dev Transfer tokens and update voting power
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        bool result = super.transfer(to, amount);
        if (result) {
            votingPower[msg.sender] = balanceOf(msg.sender);
            votingPower[to] = balanceOf(to);
        }
        return result;
    }
    
    /**
     * @dev Transfer tokens from and update voting power
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool result = super.transferFrom(from, to, amount);
        if (result) {
            votingPower[from] = balanceOf(from);
            votingPower[to] = balanceOf(to);
        }
        return result;
    }
    
    /**
     * @dev Cast vote on a proposal
     * @param proposalId Proposal ID
     * @param votes Number of votes to cast
     */
    function castVote(bytes32 proposalId, uint256 votes) external {
        require(votes <= votingPower[msg.sender], "Insufficient voting power");
        require(votes > 0, "Must cast at least one vote");
        
        proposalVotes[proposalId] += votes;
        votingPower[msg.sender] -= votes; // Temporary reduction during voting period
        
        emit VoteCast(msg.sender, proposalId, votes);
    }
    
    /**
     * @dev Get user's token information
     * @param user User address
     * @return earned Total earned tokens
     * @return redeemed Total redeemed tokens
     * @return balance Current balance
     * @return voting Current voting power
     */
    function getUserTokenInfo(address user) external view returns (
        uint256 earned,
        uint256 redeemed,
        uint256 balance,
        uint256 voting
    ) {
        return (
            earnedRewards[user],
            redeemedTokens[user],
            balanceOf(user),
            votingPower[user]
        );
    }
    
    /**
     * @dev Get tokens for Supabase user ID
     * @param userId Supabase user ID
     * @return uint256 Total tokens earned
     */
    function getTokensByUserId(string memory userId) external view returns (uint256) {
        return userIdToTokens[userId];
    }
    
    /**
     * @dev Get redemption rate for an item
     * @param item Item name
     * @return uint256 Required tokens
     */
    function getRedemptionRate(string memory item) external view returns (uint256) {
        return redemptionRates[item];
    }
    
    /**
     * @dev Get proposal vote count
     * @param proposalId Proposal ID
     * @return uint256 Total votes
     */
    function getProposalVotes(bytes32 proposalId) external view returns (uint256) {
        return proposalVotes[proposalId];
    }
    
    // Admin functions
    
    /**
     * @dev Update reward rate
     * @param rewardType Type of reward (donation, verification, referral)
     * @param newRate New rate in tokens
     */
    function updateRewardRate(string memory rewardType, uint256 newRate) external onlyRole(ADMIN_ROLE) {
        uint256 oldRate;
        
        if (keccak256(bytes(rewardType)) == keccak256(bytes("donation"))) {
            oldRate = donationRewardRate;
            donationRewardRate = newRate;
        } else if (keccak256(bytes(rewardType)) == keccak256(bytes("verification"))) {
            oldRate = verificationRewardRate;
            verificationRewardRate = newRate;
        } else if (keccak256(bytes(rewardType)) == keccak256(bytes("referral"))) {
            oldRate = referralRewardRate;
            referralRewardRate = newRate;
        } else {
            revert("Invalid reward type");
        }
        
        emit RewardRateUpdated(rewardType, oldRate, newRate);
    }
    
    /**
     * @dev Update redemption rate
     * @param item Item name
     * @param newRate New rate in tokens
     */
    function updateRedemptionRate(string memory item, uint256 newRate) external onlyRole(ADMIN_ROLE) {
        uint256 oldRate = redemptionRates[item];
        redemptionRates[item] = newRate;
        
        emit RedemptionRateUpdated(item, oldRate, newRate);
    }
    
    /**
     * @dev Set initial redemption rates
     */
    function _setInitialRedemptionRates() internal {
        redemptionRates["medication_discount_10"] = 50 * 10**18; // 50 tokens for 10% discount
        redemptionRates["medication_discount_20"] = 100 * 10**18; // 100 tokens for 20% discount
        redemptionRates["free_consultation"] = 200 * 10**18; // 200 tokens for free consultation
        redemptionRates["priority_support"] = 150 * 10**18; // 150 tokens for priority support
        redemptionRates["premium_features"] = 300 * 10**18; // 300 tokens for premium features
        redemptionRates["donation_match"] = 500 * 10**18; // 500 tokens for donation matching
    }
    
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    function grantMinterRole(address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }
    
    function revokeMinterRole(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, account);
    }
    
    function grantRedeemerRole(address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(REDEEMER_ROLE, account);
    }
    
    function revokeRedeemerRole(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(REDEEMER_ROLE, account);
    }
    
    // Required overrides
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}
