import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
  console.log("🚀 Starting Ytili Smart Contracts Deployment to Saga Blockchain...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  
  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.error("❌ Deployer account has no balance. Please fund the account first.");
    process.exit(1);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📋 DEPLOYMENT PLAN");
  console.log("=".repeat(60));
  console.log("1. Deploy YtiliToken (ERC-20)");
  console.log("2. Deploy DonationRegistry");
  console.log("3. Deploy TransparencyVerifier");
  console.log("4. Configure contracts");
  console.log("5. Verify deployment");
  console.log("=".repeat(60) + "\n");
  
  let deployedContracts: { [key: string]: Contract } = {};
  
  try {
    // 1. Deploy YtiliToken
    console.log("🪙 Deploying YtiliToken...");
    const YtiliToken = await ethers.getContractFactory("YtiliToken");
    const ytiliToken = await YtiliToken.deploy();
    await ytiliToken.waitForDeployment();
    const ytiliTokenAddress = await ytiliToken.getAddress();
    deployedContracts["YtiliToken"] = ytiliToken;
    
    console.log("✅ YtiliToken deployed to:", ytiliTokenAddress);
    console.log("   - Name:", await ytiliToken.name());
    console.log("   - Symbol:", await ytiliToken.symbol());
    console.log("   - Total Supply:", ethers.formatEther(await ytiliToken.totalSupply()), "YTILI");
    
    // 2. Deploy DonationRegistry
    console.log("\n📋 Deploying DonationRegistry...");
    const DonationRegistry = await ethers.getContractFactory("DonationRegistry");
    const donationRegistry = await DonationRegistry.deploy();
    await donationRegistry.waitForDeployment();
    const donationRegistryAddress = await donationRegistry.getAddress();
    deployedContracts["DonationRegistry"] = donationRegistry;
    
    console.log("✅ DonationRegistry deployed to:", donationRegistryAddress);
    console.log("   - Total Donations:", await donationRegistry.totalDonations());
    
    // 3. Deploy TransparencyVerifier
    console.log("\n🔍 Deploying TransparencyVerifier...");
    const TransparencyVerifier = await ethers.getContractFactory("TransparencyVerifier");
    const transparencyVerifier = await TransparencyVerifier.deploy(donationRegistryAddress);
    await transparencyVerifier.waitForDeployment();
    const transparencyVerifierAddress = await transparencyVerifier.getAddress();
    deployedContracts["TransparencyVerifier"] = transparencyVerifier;
    
    console.log("✅ TransparencyVerifier deployed to:", transparencyVerifierAddress);
    console.log("   - Connected to DonationRegistry:", await transparencyVerifier.donationRegistry());
    console.log("   - Total Verifications:", await transparencyVerifier.totalVerifications());
    
    // 4. Configure contracts
    console.log("\n⚙️  Configuring contracts...");
    
    // Grant roles to DonationRegistry for integration
    console.log("   - Granting RECORDER_ROLE to deployer...");
    const RECORDER_ROLE = await donationRegistry.RECORDER_ROLE();
    await donationRegistry.grantRole(RECORDER_ROLE, deployer.address);
    
    // Grant roles to TransparencyVerifier
    console.log("   - Granting VERIFIER_ROLE to deployer...");
    const VERIFIER_ROLE = await transparencyVerifier.VERIFIER_ROLE();
    await transparencyVerifier.grantRole(VERIFIER_ROLE, deployer.address);
    
    // Grant roles to YtiliToken
    console.log("   - Granting MINTER_ROLE to deployer...");
    const MINTER_ROLE = await ytiliToken.MINTER_ROLE();
    await ytiliToken.grantRole(MINTER_ROLE, deployer.address);
    
    console.log("   - Granting REDEEMER_ROLE to deployer...");
    const REDEEMER_ROLE = await ytiliToken.REDEEMER_ROLE();
    await ytiliToken.grantRole(REDEEMER_ROLE, deployer.address);
    
    console.log("✅ Contract configuration completed!");
    
    // 5. Verify deployment
    console.log("\n🔍 Verifying deployment...");
    
    // Test YtiliToken
    const tokenBalance = await ytiliToken.balanceOf(deployer.address);
    console.log("   - Deployer token balance:", ethers.formatEther(tokenBalance), "YTILI");
    
    // Test DonationRegistry
    const hasRecorderRole = await donationRegistry.hasRole(RECORDER_ROLE, deployer.address);
    console.log("   - Deployer has RECORDER_ROLE:", hasRecorderRole);
    
    // Test TransparencyVerifier
    const hasVerifierRole = await transparencyVerifier.hasRole(VERIFIER_ROLE, deployer.address);
    console.log("   - Deployer has VERIFIER_ROLE:", hasVerifierRole);
    
    console.log("✅ Deployment verification completed!");
    
    // 6. Display summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
    console.log("Deployer:", deployer.address);
    console.log("Gas Used: [Will be calculated by Hardhat]");
    console.log("");
    console.log("📋 CONTRACT ADDRESSES:");
    console.log("├── YtiliToken:", ytiliTokenAddress);
    console.log("├── DonationRegistry:", donationRegistryAddress);
    console.log("└── TransparencyVerifier:", transparencyVerifierAddress);
    console.log("");
    console.log("🔧 INTEGRATION NOTES:");
    console.log("├── Add these addresses to backend/.env:");
    console.log("│   YTILI_TOKEN_ADDRESS=" + ytiliTokenAddress);
    console.log("│   DONATION_REGISTRY_ADDRESS=" + donationRegistryAddress);
    console.log("│   TRANSPARENCY_VERIFIER_ADDRESS=" + transparencyVerifierAddress);
    console.log("│");
    console.log("├── Backend integration points:");
    console.log("│   - Record donations in DonationRegistry");
    console.log("│   - Verify chains with TransparencyVerifier");
    console.log("│   - Mint/redeem tokens with YtiliToken");
    console.log("│");
    console.log("└── Frontend integration:");
    console.log("    - Display contract addresses in transparency dashboard");
    console.log("    - Show blockchain transaction hashes");
    console.log("    - Enable wallet connection for token features");
    console.log("=".repeat(60));
    
    // 7. Save deployment info
    const deploymentInfo = {
      network: (await ethers.provider.getNetwork()).name,
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: {
        YtiliToken: {
          address: ytiliTokenAddress,
          name: await ytiliToken.name(),
          symbol: await ytiliToken.symbol(),
          totalSupply: ethers.formatEther(await ytiliToken.totalSupply())
        },
        DonationRegistry: {
          address: donationRegistryAddress,
          totalDonations: Number(await donationRegistry.totalDonations())
        },
        TransparencyVerifier: {
          address: transparencyVerifierAddress,
          donationRegistry: await transparencyVerifier.donationRegistry(),
          totalVerifications: Number(await transparencyVerifier.totalVerifications())
        }
      }
    };
    
    // Write deployment info to file
    const fs = require('fs');
    const path = require('path');
    
    const deploymentDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `deployment-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("💾 Deployment info saved to:", deploymentFile);
    console.log("\n🚀 Deployment completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment script failed:");
    console.error(error);
    process.exit(1);
  });
