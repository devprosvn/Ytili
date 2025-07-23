// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./YtiliToken.sol";

/**
 * @title YtiliGovernance
 * @dev Governance contract for Ytili platform with token-based voting
 * @notice Allows YTILI token holders to create and vote on proposals
 */
contract YtiliGovernance is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    
    YtiliToken public immutable ytiliToken;
    
    // Proposal structure
    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        string category; // "platform", "donation", "token", "emergency"
        uint256 startTime;
        uint256 endTime;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        uint256 totalVotes;
        bool executed;
        bool cancelled;
        ProposalStatus status;
        mapping(address => Vote) votes;
        address[] voters;
    }
    
    struct Vote {
        VoteType voteType;
        uint256 weight;
        uint256 timestamp;
        bool hasVoted;
    }
    
    enum VoteType { For, Against, Abstain }
    enum ProposalStatus { Pending, Active, Succeeded, Failed, Cancelled, Executed }
    
    // Governance parameters
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant MIN_PROPOSAL_THRESHOLD = 1000 * 10**18; // 1000 YTILI tokens
    uint256 public constant QUORUM_PERCENTAGE = 10; // 10% of total supply
    uint256 public constant MAJORITY_PERCENTAGE = 51; // 51% majority required
    
    // State variables
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256[]) public userProposals;
    mapping(address => uint256[]) public userVotes;
    
    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        string category,
        uint256 startTime,
        uint256 endTime
    );
    
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        VoteType voteType,
        uint256 weight
    );
    
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    
    constructor(address _ytiliToken) {
        require(_ytiliToken != address(0), "Invalid token address");
        
        ytiliToken = YtiliToken(_ytiliToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);
    }
    
    /**
     * @dev Create a new governance proposal
     * @param title Proposal title
     * @param description Detailed proposal description
     * @param category Proposal category
     */
    function createProposal(
        string memory title,
        string memory description,
        string memory category
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(bytes(title).length > 0, "Title cannot be empty");
        require(bytes(description).length > 0, "Description cannot be empty");
        require(
            ytiliToken.balanceOf(msg.sender) >= MIN_PROPOSAL_THRESHOLD,
            "Insufficient tokens to create proposal"
        );
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        Proposal storage newProposal = proposals[proposalId];
        newProposal.id = proposalId;
        newProposal.proposer = msg.sender;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.category = category;
        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp + VOTING_PERIOD;
        newProposal.status = ProposalStatus.Active;
        
        userProposals[msg.sender].push(proposalId);
        
        emit ProposalCreated(
            proposalId,
            msg.sender,
            title,
            category,
            newProposal.startTime,
            newProposal.endTime
        );
        
        return proposalId;
    }
    
    /**
     * @dev Cast a vote on a proposal
     * @param proposalId The proposal to vote on
     * @param voteType The type of vote (For, Against, Abstain)
     */
    function castVote(
        uint256 proposalId,
        VoteType voteType
    ) external whenNotPaused nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active, "Proposal not active");
        require(block.timestamp <= proposal.endTime, "Voting period ended");
        require(!proposal.votes[msg.sender].hasVoted, "Already voted");
        
        uint256 voterWeight = ytiliToken.balanceOf(msg.sender);
        require(voterWeight > 0, "No voting power");
        
        // Record the vote
        proposal.votes[msg.sender] = Vote({
            voteType: voteType,
            weight: voterWeight,
            timestamp: block.timestamp,
            hasVoted: true
        });
        
        proposal.voters.push(msg.sender);
        userVotes[msg.sender].push(proposalId);
        
        // Update vote counts
        if (voteType == VoteType.For) {
            proposal.votesFor += voterWeight;
        } else if (voteType == VoteType.Against) {
            proposal.votesAgainst += voterWeight;
        } else {
            proposal.votesAbstain += voterWeight;
        }
        
        proposal.totalVotes += voterWeight;
        
        emit VoteCast(proposalId, msg.sender, voteType, voterWeight);
        
        // Check if proposal should be finalized
        _checkProposalStatus(proposalId);
    }
    
    /**
     * @dev Execute a successful proposal
     * @param proposalId The proposal to execute
     */
    function executeProposal(uint256 proposalId) external whenNotPaused {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Succeeded, "Proposal not succeeded");
        require(!proposal.executed, "Already executed");
        require(block.timestamp > proposal.endTime, "Voting still active");
        
        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;
        
        emit ProposalExecuted(proposalId);
    }
    
    /**
     * @dev Cancel a proposal (only by admin or proposer)
     * @param proposalId The proposal to cancel
     */
    function cancelProposal(uint256 proposalId) external {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to cancel"
        );
        require(proposal.status == ProposalStatus.Active, "Proposal not active");
        
        proposal.cancelled = true;
        proposal.status = ProposalStatus.Cancelled;
        
        emit ProposalCancelled(proposalId);
    }
    
    /**
     * @dev Check and update proposal status based on votes
     * @param proposalId The proposal to check
     */
    function _checkProposalStatus(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        
        if (block.timestamp > proposal.endTime) {
            uint256 totalSupply = ytiliToken.totalSupply();
            uint256 quorumRequired = (totalSupply * QUORUM_PERCENTAGE) / 100;
            
            if (proposal.totalVotes >= quorumRequired) {
                uint256 majorityRequired = (proposal.totalVotes * MAJORITY_PERCENTAGE) / 100;
                
                if (proposal.votesFor > majorityRequired) {
                    proposal.status = ProposalStatus.Succeeded;
                } else {
                    proposal.status = ProposalStatus.Failed;
                }
            } else {
                proposal.status = ProposalStatus.Failed;
            }
        }
    }
    
    /**
     * @dev Get proposal details
     * @param proposalId The proposal ID
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        string memory title,
        string memory description,
        string memory category,
        uint256 startTime,
        uint256 endTime,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 votesAbstain,
        uint256 totalVotes,
        bool executed,
        bool cancelled,
        ProposalStatus status
    ) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        
        return (
            proposal.id,
            proposal.proposer,
            proposal.title,
            proposal.description,
            proposal.category,
            proposal.startTime,
            proposal.endTime,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.votesAbstain,
            proposal.totalVotes,
            proposal.executed,
            proposal.cancelled,
            proposal.status
        );
    }
    
    /**
     * @dev Get user's vote on a proposal
     * @param proposalId The proposal ID
     * @param voter The voter address
     */
    function getUserVote(uint256 proposalId, address voter) external view returns (
        VoteType voteType,
        uint256 weight,
        uint256 timestamp,
        bool hasVoted
    ) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        Vote storage vote = proposals[proposalId].votes[voter];
        
        return (vote.voteType, vote.weight, vote.timestamp, vote.hasVoted);
    }
    
    /**
     * @dev Get all proposals by a user
     * @param user The user address
     */
    function getUserProposals(address user) external view returns (uint256[] memory) {
        return userProposals[user];
    }
    
    /**
     * @dev Get all votes by a user
     * @param user The user address
     */
    function getUserVotes(address user) external view returns (uint256[] memory) {
        return userVotes[user];
    }
    
    /**
     * @dev Get governance statistics
     */
    function getGovernanceStats() external view returns (
        uint256 totalProposals,
        uint256 activeProposals,
        uint256 executedProposals,
        uint256 totalVoters,
        uint256 minProposalThreshold,
        uint256 quorumPercentage
    ) {
        uint256 active = 0;
        uint256 executed = 0;
        
        for (uint256 i = 1; i <= proposalCount; i++) {
            if (proposals[i].status == ProposalStatus.Active) {
                active++;
            } else if (proposals[i].status == ProposalStatus.Executed) {
                executed++;
            }
        }
        
        return (
            proposalCount,
            active,
            executed,
            ytiliToken.totalSupply() / 10**18, // Approximate number of token holders
            MIN_PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE
        );
    }
    
    /**
     * @dev Emergency pause (admin only)
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause (admin only)
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
