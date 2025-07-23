import { expect } from "chai";
import { ethers } from "hardhat";
import { YtiliGovernance, YtiliToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YtiliGovernance", function () {
  let governance: YtiliGovernance;
  let ytiliToken: YtiliToken;
  let owner: SignerWithAddress;
  let proposer: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let voter3: SignerWithAddress;

  const MIN_PROPOSAL_THRESHOLD = ethers.parseEther("1000"); // 1000 YTILI
  const VOTING_PERIOD = 7 * 24 * 60 * 60; // 7 days in seconds

  beforeEach(async function () {
    [owner, proposer, voter1, voter2, voter3] = await ethers.getSigners();

    // Deploy YtiliToken first
    const YtiliToken = await ethers.getContractFactory("YtiliToken");
    ytiliToken = await YtiliToken.deploy();
    await ytiliToken.waitForDeployment();

    // Deploy YtiliGovernance
    const YtiliGovernance = await ethers.getContractFactory("YtiliGovernance");
    governance = await YtiliGovernance.deploy(await ytiliToken.getAddress());
    await ytiliToken.waitForDeployment();

    // Mint tokens for testing
    await ytiliToken.mintReward(proposer.address, "proposer", MIN_PROPOSAL_THRESHOLD, "test");
    await ytiliToken.mintReward(voter1.address, "voter1", ethers.parseEther("5000"), "test");
    await ytiliToken.mintReward(voter2.address, "voter2", ethers.parseEther("3000"), "test");
    await ytiliToken.mintReward(voter3.address, "voter3", ethers.parseEther("2000"), "test");
  });

  describe("Deployment", function () {
    it("Should set the correct YTILI token address", async function () {
      expect(await governance.ytiliToken()).to.equal(await ytiliToken.getAddress());
    });

    it("Should set correct governance parameters", async function () {
      expect(await governance.MIN_PROPOSAL_THRESHOLD()).to.equal(MIN_PROPOSAL_THRESHOLD);
      expect(await governance.VOTING_PERIOD()).to.equal(VOTING_PERIOD);
      expect(await governance.QUORUM_PERCENTAGE()).to.equal(10);
      expect(await governance.MAJORITY_PERCENTAGE()).to.equal(51);
    });

    it("Should grant admin role to deployer", async function () {
      const ADMIN_ROLE = await governance.ADMIN_ROLE();
      expect(await governance.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Proposal Creation", function () {
    it("Should create a proposal with sufficient tokens", async function () {
      const title = "Test Proposal";
      const description = "This is a test proposal";
      const category = "platform";

      await expect(
        governance.connect(proposer).createProposal(title, description, category)
      ).to.emit(governance, "ProposalCreated");

      const proposal = await governance.getProposal(1);
      expect(proposal[2]).to.equal(title); // title
      expect(proposal[3]).to.equal(description); // description
      expect(proposal[4]).to.equal(category); // category
      expect(proposal[1]).to.equal(proposer.address); // proposer
    });

    it("Should fail to create proposal without sufficient tokens", async function () {
      await expect(
        governance.connect(voter3).createProposal("Test", "Description", "platform")
      ).to.be.revertedWith("Insufficient tokens to create proposal");
    });

    it("Should fail to create proposal with empty title", async function () {
      await expect(
        governance.connect(proposer).createProposal("", "Description", "platform")
      ).to.be.revertedWith("Title cannot be empty");
    });

    it("Should fail to create proposal with empty description", async function () {
      await expect(
        governance.connect(proposer).createProposal("Title", "", "platform")
      ).to.be.revertedWith("Description cannot be empty");
    });

    it("Should increment proposal count", async function () {
      expect(await governance.proposalCount()).to.equal(0);
      
      await governance.connect(proposer).createProposal("Test 1", "Description 1", "platform");
      expect(await governance.proposalCount()).to.equal(1);
      
      await governance.connect(proposer).createProposal("Test 2", "Description 2", "donation");
      expect(await governance.proposalCount()).to.equal(2);
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      // Create a test proposal
      await governance.connect(proposer).createProposal(
        "Test Proposal",
        "This is a test proposal for voting",
        "platform"
      );
    });

    it("Should allow voting with valid tokens", async function () {
      const proposalId = 1;
      const voteType = 0; // VoteType.For

      await expect(
        governance.connect(voter1).castVote(proposalId, voteType)
      ).to.emit(governance, "VoteCast");

      const userVote = await governance.getUserVote(proposalId, voter1.address);
      expect(userVote[0]).to.equal(voteType); // voteType
      expect(userVote[3]).to.be.true; // hasVoted
    });

    it("Should prevent double voting", async function () {
      const proposalId = 1;
      const voteType = 0; // VoteType.For

      await governance.connect(voter1).castVote(proposalId, voteType);
      
      await expect(
        governance.connect(voter1).castVote(proposalId, voteType)
      ).to.be.revertedWith("Already voted");
    });

    it("Should fail voting on non-existent proposal", async function () {
      await expect(
        governance.connect(voter1).castVote(999, 0)
      ).to.be.revertedWith("Invalid proposal ID");
    });

    it("Should fail voting without tokens", async function () {
      const [, , , , noTokensUser] = await ethers.getSigners();
      
      await expect(
        governance.connect(noTokensUser).castVote(1, 0)
      ).to.be.revertedWith("No voting power");
    });

    it("Should correctly count votes", async function () {
      const proposalId = 1;
      
      // Vote For
      await governance.connect(voter1).castVote(proposalId, 0); // 5000 tokens
      await governance.connect(voter2).castVote(proposalId, 0); // 3000 tokens
      
      // Vote Against
      await governance.connect(voter3).castVote(proposalId, 1); // 2000 tokens
      
      const proposal = await governance.getProposal(proposalId);
      expect(proposal[7]).to.equal(ethers.parseEther("8000")); // votesFor
      expect(proposal[8]).to.equal(ethers.parseEther("2000")); // votesAgainst
      expect(proposal[10]).to.equal(ethers.parseEther("10000")); // totalVotes
    });
  });

  describe("Proposal Execution", function () {
    beforeEach(async function () {
      // Create a test proposal
      await governance.connect(proposer).createProposal(
        "Test Proposal",
        "This is a test proposal for execution",
        "platform"
      );
    });

    it("Should execute successful proposal after voting period", async function () {
      const proposalId = 1;
      
      // Cast enough votes to meet quorum and majority
      await governance.connect(voter1).castVote(proposalId, 0); // For
      await governance.connect(voter2).castVote(proposalId, 0); // For
      await governance.connect(voter3).castVote(proposalId, 0); // For
      
      // Fast forward time past voting period
      await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD + 1]);
      await ethers.provider.send("evm_mine", []);
      
      await expect(
        governance.executeProposal(proposalId)
      ).to.emit(governance, "ProposalExecuted");
      
      const proposal = await governance.getProposal(proposalId);
      expect(proposal[11]).to.be.true; // executed
    });

    it("Should fail to execute proposal before voting period ends", async function () {
      const proposalId = 1;
      
      await governance.connect(voter1).castVote(proposalId, 0);
      
      await expect(
        governance.executeProposal(proposalId)
      ).to.be.revertedWith("Voting still active");
    });
  });

  describe("Proposal Cancellation", function () {
    beforeEach(async function () {
      await governance.connect(proposer).createProposal(
        "Test Proposal",
        "This is a test proposal for cancellation",
        "platform"
      );
    });

    it("Should allow proposer to cancel their proposal", async function () {
      const proposalId = 1;
      
      await expect(
        governance.connect(proposer).cancelProposal(proposalId)
      ).to.emit(governance, "ProposalCancelled");
      
      const proposal = await governance.getProposal(proposalId);
      expect(proposal[12]).to.be.true; // cancelled
    });

    it("Should allow admin to cancel any proposal", async function () {
      const proposalId = 1;
      
      await expect(
        governance.connect(owner).cancelProposal(proposalId)
      ).to.emit(governance, "ProposalCancelled");
    });

    it("Should fail to cancel proposal by unauthorized user", async function () {
      const proposalId = 1;
      
      await expect(
        governance.connect(voter1).cancelProposal(proposalId)
      ).to.be.revertedWith("Not authorized to cancel");
    });
  });

  describe("Governance Statistics", function () {
    it("Should return correct governance stats", async function () {
      // Create some proposals
      await governance.connect(proposer).createProposal("Proposal 1", "Description 1", "platform");
      await governance.connect(proposer).createProposal("Proposal 2", "Description 2", "donation");
      
      const stats = await governance.getGovernanceStats();
      
      expect(stats[0]).to.equal(2); // totalProposals
      expect(stats[1]).to.equal(2); // activeProposals
      expect(stats[2]).to.equal(0); // executedProposals
      expect(stats[4]).to.equal(MIN_PROPOSAL_THRESHOLD); // minProposalThreshold
      expect(stats[5]).to.equal(10); // quorumPercentage
    });
  });

  describe("Access Control", function () {
    it("Should allow admin to pause contract", async function () {
      await governance.connect(owner).pause();
      expect(await governance.paused()).to.be.true;
    });

    it("Should prevent non-admin from pausing", async function () {
      await expect(
        governance.connect(voter1).pause()
      ).to.be.reverted;
    });

    it("Should prevent actions when paused", async function () {
      await governance.connect(owner).pause();
      
      await expect(
        governance.connect(proposer).createProposal("Test", "Description", "platform")
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});
