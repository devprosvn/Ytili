import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("Ytili Smart Contracts", function () {
  let ytiliToken: Contract;
  let donationRegistry: Contract;
  let transparencyVerifier: Contract;
  let owner: Signer;
  let donor: Signer;
  let hospital: Signer;
  let admin: Signer;

  beforeEach(async function () {
    // Get signers
    [owner, donor, hospital, admin] = await ethers.getSigners();

    // Deploy YtiliToken
    const YtiliToken = await ethers.getContractFactory("YtiliToken");
    ytiliToken = await YtiliToken.deploy();
    await ytiliToken.waitForDeployment();

    // Deploy DonationRegistry
    const DonationRegistry = await ethers.getContractFactory("DonationRegistry");
    donationRegistry = await DonationRegistry.deploy();
    await donationRegistry.waitForDeployment();

    // Deploy TransparencyVerifier
    const TransparencyVerifier = await ethers.getContractFactory("TransparencyVerifier");
    transparencyVerifier = await TransparencyVerifier.deploy(await donationRegistry.getAddress());
    await transparencyVerifier.waitForDeployment();

    // Grant necessary roles
    const RECORDER_ROLE = await donationRegistry.RECORDER_ROLE();
    const VERIFIER_ROLE = await transparencyVerifier.VERIFIER_ROLE();
    const MINTER_ROLE = await ytiliToken.MINTER_ROLE();
    const REDEEMER_ROLE = await ytiliToken.REDEEMER_ROLE();

    await donationRegistry.grantRole(RECORDER_ROLE, owner.address);
    await transparencyVerifier.grantRole(VERIFIER_ROLE, owner.address);
    await ytiliToken.grantRole(MINTER_ROLE, owner.address);
    await ytiliToken.grantRole(REDEEMER_ROLE, owner.address);
  });

  describe("YtiliToken", function () {
    it("Should have correct initial values", async function () {
      expect(await ytiliToken.name()).to.equal("Ytili Token");
      expect(await ytiliToken.symbol()).to.equal("YTILI");
      expect(await ytiliToken.totalSupply()).to.equal(ethers.parseEther("100000000"));
    });

    it("Should mint reward tokens", async function () {
      const amount = ethers.parseEther("100");
      const userId = "user123";
      const reason = "donation_reward";

      await ytiliToken.mintReward(donor.address, userId, amount, reason);

      expect(await ytiliToken.balanceOf(donor.address)).to.equal(amount);
      expect(await ytiliToken.earnedRewards(donor.address)).to.equal(amount);
      expect(await ytiliToken.getTokensByUserId(userId)).to.equal(amount);
    });

    it("Should redeem tokens", async function () {
      const mintAmount = ethers.parseEther("200");
      const redeemAmount = ethers.parseEther("50");
      const userId = "user123";
      const item = "medication_discount_10";

      // First mint some tokens
      await ytiliToken.mintReward(donor.address, userId, mintAmount, "test");

      // Then redeem
      await ytiliToken.redeemTokens(donor.address, userId, redeemAmount, item);

      expect(await ytiliToken.balanceOf(donor.address)).to.equal(mintAmount - redeemAmount);
      expect(await ytiliToken.redeemedTokens(donor.address)).to.equal(redeemAmount);
    });

    it("Should update voting power on transfers", async function () {
      const amount = ethers.parseEther("100");
      
      // Mint tokens to donor
      await ytiliToken.mintReward(donor.address, "user123", amount, "test");
      expect(await ytiliToken.votingPower(donor.address)).to.equal(amount);

      // Transfer to hospital
      await ytiliToken.connect(donor).transfer(hospital.address, amount / 2n);
      
      expect(await ytiliToken.votingPower(donor.address)).to.equal(amount / 2n);
      expect(await ytiliToken.votingPower(hospital.address)).to.equal(amount / 2n);
    });
  });

  describe("DonationRegistry", function () {
    it("Should record a donation", async function () {
      const donationId = "donation123";
      const donorId = "donor456";
      const title = "Medical Supplies";
      const description = "Emergency medical supplies";
      const amount = 0;
      const itemName = "Bandages";
      const quantity = 100;
      const unit = "pieces";
      const metadataHash = "QmHash123";

      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        title,
        description,
        amount,
        itemName,
        quantity,
        unit,
        metadataHash
      );

      const donation = await donationRegistry.getDonation(donationId);
      expect(donation.donationId).to.equal(donationId);
      expect(donation.donorId).to.equal(donorId);
      expect(donation.title).to.equal(title);
      expect(donation.itemName).to.equal(itemName);
      expect(donation.quantity).to.equal(quantity);
      expect(donation.exists).to.be.true;

      expect(await donationRegistry.totalDonations()).to.equal(1);
    });

    it("Should update donation status", async function () {
      const donationId = "donation123";
      const donorId = "donor456";

      // First record a donation
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Test Donation",
        "Test Description",
        0,
        "Test Item",
        1,
        "piece",
        "QmHash"
      );

      // Update status to VERIFIED
      await donationRegistry.updateDonationStatus(
        donationId,
        1, // VERIFIED
        "admin123",
        "admin",
        "Donation verified by admin"
      );

      const donation = await donationRegistry.getDonation(donationId);
      expect(donation.status).to.equal(1); // VERIFIED
    });

    it("Should match donation with recipient", async function () {
      const donationId = "donation123";
      const donorId = "donor456";
      const recipientId = "hospital789";

      // Record and verify donation
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Test Donation",
        "Test Description",
        0,
        "Test Item",
        1,
        "piece",
        "QmHash"
      );

      await donationRegistry.updateDonationStatus(
        donationId,
        1, // VERIFIED
        "admin123",
        "admin",
        "Verified"
      );

      // Match with recipient
      await donationRegistry.matchDonation(donationId, recipientId, "hospital789");

      const donation = await donationRegistry.getDonation(donationId);
      expect(donation.recipientId).to.equal(recipientId);
      expect(donation.status).to.equal(2); // MATCHED
    });

    it("Should get donation history", async function () {
      const donationId = "donation123";
      const donorId = "donor456";

      // Record donation
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Test Donation",
        "Test Description",
        0,
        "Test Item",
        1,
        "piece",
        "QmHash"
      );

      // Update status
      await donationRegistry.updateDonationStatus(
        donationId,
        1, // VERIFIED
        "admin123",
        "admin",
        "Verified"
      );

      const history = await donationRegistry.getDonationHistory(donationId);
      expect(history.length).to.equal(2); // Creation + status update
      expect(history[0].transactionType).to.equal("donation_created");
      expect(history[1].transactionType).to.equal("status_changed_to_verified");
    });
  });

  describe("TransparencyVerifier", function () {
    it("Should verify transaction chain", async function () {
      const donationId = "donation123";
      const donorId = "donor456";

      // Record donation with some transactions
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Test Donation",
        "Test Description",
        0,
        "Test Item",
        1,
        "piece",
        "QmHash"
      );

      await donationRegistry.updateDonationStatus(
        donationId,
        1, // VERIFIED
        "admin123",
        "admin",
        "Verified"
      );

      // Verify the chain
      const result = await transparencyVerifier.verifyTransactionChain(donationId);

      expect(result.totalTransactions).to.equal(2);
      expect(result.isValid).to.be.true;
      expect(result.brokenLinks).to.equal(0);
      expect(result.invalidHashes).to.equal(0);
    });

    it("Should calculate transparency score", async function () {
      const donationId = "donation123";
      const donorId = "donor456";

      // Record donation
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Test Donation",
        "Test Description",
        0,
        "Test Item",
        1,
        "piece",
        "QmHash"
      );

      // Verify chain
      await transparencyVerifier.verifyTransactionChain(donationId);

      const score = await transparencyVerifier.getTransparencyScore(donationId);
      expect(score).to.be.greaterThan(0);
      expect(score).to.be.lessThanOrEqual(100);
    });

    it("Should perform batch verification", async function () {
      const donationIds = ["donation1", "donation2"];
      const donorId = "donor456";

      // Record multiple donations
      for (let i = 0; i < donationIds.length; i++) {
        await donationRegistry.recordDonation(
          donationIds[i],
          donorId,
          0, // MEDICATION
          `Test Donation ${i + 1}`,
          "Test Description",
          0,
          "Test Item",
          1,
          "piece",
          "QmHash"
        );
      }

      // Batch verify (simplified - no actual Merkle proofs in this test)
      const merkleProofs = [[], []]; // Empty proofs for test
      const merkleRoot = await transparencyVerifier.batchVerifyDonations(donationIds, merkleProofs);

      expect(merkleRoot).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");

      const batchVerification = await transparencyVerifier.getBatchVerification(merkleRoot);
      expect(batchVerification.donationIds.length).to.equal(2);
      expect(batchVerification.isValid).to.be.true;
    });
  });

  describe("Integration Tests", function () {
    it("Should complete full donation flow with blockchain recording", async function () {
      const donationId = "donation123";
      const donorId = "donor456";
      const recipientId = "hospital789";
      const userId = "user123";

      // 1. Record donation
      await donationRegistry.recordDonation(
        donationId,
        donorId,
        0, // MEDICATION
        "Medical Supplies",
        "Emergency medical supplies",
        1000000, // 1M VND equivalent
        "Bandages",
        100,
        "pieces",
        "QmHash123"
      );

      // 2. Mint reward tokens for donor
      await ytiliToken.mintDonationReward(donor.address, userId, 1000000);

      // 3. Verify donation
      await donationRegistry.updateDonationStatus(
        donationId,
        1, // VERIFIED
        "admin123",
        "admin",
        "Donation verified"
      );

      // 4. Match with hospital
      await donationRegistry.matchDonation(donationId, recipientId, recipientId);

      // 5. Complete donation
      await donationRegistry.updateDonationStatus(
        donationId,
        5, // COMPLETED
        recipientId,
        "hospital",
        "Donation completed"
      );

      // 6. Verify transparency
      const verificationResult = await transparencyVerifier.verifyTransactionChain(donationId);

      // Verify final state
      const donation = await donationRegistry.getDonation(donationId);
      expect(donation.status).to.equal(5); // COMPLETED
      expect(donation.recipientId).to.equal(recipientId);

      const donorBalance = await ytiliToken.balanceOf(donor.address);
      expect(donorBalance).to.be.greaterThan(0);

      expect(verificationResult.isValid).to.be.true;
      expect(verificationResult.totalTransactions).to.equal(4); // Create, verify, match, complete

      const transparencyScore = await transparencyVerifier.getTransparencyScore(donationId);
      expect(transparencyScore).to.be.greaterThan(50); // Should have good transparency
    });
  });
});
