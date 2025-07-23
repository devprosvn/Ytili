const { ethers } = require("hardhat");

async function main() {
  console.log("🗳️  Deploying Ytili Governance Contract...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Get account balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  // YTILI Token address (already deployed)
  const YTILI_TOKEN_ADDRESS = "0x66C06efE9B8B44940379F5c53328a35a3Abc3Fe7";
  
  try {
    // Deploy YtiliGovernance contract
    console.log("\n📋 Deploying YtiliGovernance contract...");
    const YtiliGovernance = await ethers.getContractFactory("YtiliGovernance");
    
    const governance = await YtiliGovernance.deploy(YTILI_TOKEN_ADDRESS, {
      gasLimit: 3000000,
      gasPrice: ethers.parseUnits("20", "gwei")
    });
    
    await governance.waitForDeployment();
    const governanceAddress = await governance.getAddress();
    
    console.log("✅ YtiliGovernance deployed to:", governanceAddress);
    
    // Wait for a few block confirmations
    console.log("⏳ Waiting for block confirmations...");
    await governance.deploymentTransaction().wait(3);
    
    // Verify deployment by calling a view function
    console.log("\n🔍 Verifying deployment...");
    
    try {
      const proposalCount = await governance.proposalCount();
      const minThreshold = await governance.MIN_PROPOSAL_THRESHOLD();
      const votingPeriod = await governance.VOTING_PERIOD();
      const quorumPercentage = await governance.QUORUM_PERCENTAGE();
      
      console.log("📊 Contract verification successful:");
      console.log("  - Proposal count:", proposalCount.toString());
      console.log("  - Min proposal threshold:", ethers.formatEther(minThreshold), "YTILI");
      console.log("  - Voting period:", (Number(votingPeriod) / 86400).toString(), "days");
      console.log("  - Quorum percentage:", quorumPercentage.toString() + "%");
      
      // Get governance stats
      const stats = await governance.getGovernanceStats();
      console.log("📈 Governance stats:");
      console.log("  - Total proposals:", stats[0].toString());
      console.log("  - Active proposals:", stats[1].toString());
      console.log("  - Executed proposals:", stats[2].toString());
      
    } catch (error) {
      console.error("❌ Contract verification failed:", error.message);
    }
    
    // Test contract interaction
    console.log("\n🧪 Testing contract interaction...");
    
    try {
      // Create a test proposal
      const tx = await governance.createProposal(
        "Test Proposal",
        "This is a test proposal to verify the governance system is working correctly.",
        "platform",
        {
          gasLimit: 500000
        }
      );
      
      const receipt = await tx.wait();
      console.log("✅ Test proposal created successfully");
      console.log("  - Transaction hash:", receipt.hash);
      console.log("  - Gas used:", receipt.gasUsed.toString());
      
      // Get the created proposal
      const proposal = await governance.getProposal(1);
      console.log("📋 Test proposal details:");
      console.log("  - ID:", proposal[0].toString());
      console.log("  - Title:", proposal[2]);
      console.log("  - Category:", proposal[4]);
      console.log("  - Status:", proposal[13].toString());
      
    } catch (error) {
      console.log("⚠️  Test proposal creation failed (this is expected if deployer doesn't have enough YTILI tokens)");
      console.log("   Error:", error.message);
    }
    
    // Summary
    console.log("\n🎉 Deployment Summary");
    console.log("=" * 50);
    console.log("YtiliGovernance Contract:", governanceAddress);
    console.log("YTILI Token Address:", YTILI_TOKEN_ADDRESS);
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
    console.log("Deployer:", deployer.address);
    console.log("Gas Used: ~3,000,000");
    
    // Save deployment info
    const deploymentInfo = {
      network: (await ethers.provider.getNetwork()).name,
      chainId: (await ethers.provider.getNetwork()).chainId.toString(),
      contracts: {
        YtiliGovernance: {
          address: governanceAddress,
          deployer: deployer.address,
          deploymentTime: new Date().toISOString(),
          ytiliTokenAddress: YTILI_TOKEN_ADDRESS
        }
      },
      parameters: {
        minProposalThreshold: ethers.formatEther(await governance.MIN_PROPOSAL_THRESHOLD()),
        votingPeriod: (Number(await governance.VOTING_PERIOD()) / 86400).toString() + " days",
        quorumPercentage: (await governance.QUORUM_PERCENTAGE()).toString() + "%",
        majorityPercentage: "51%"
      }
    };
    
    // Write deployment info to file
    const fs = require('fs');
    const path = require('path');
    
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, 'governance-deployment.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n📄 Deployment info saved to:", deploymentFile);
    
    console.log("\n🔗 Next Steps:");
    console.log("1. Update backend configuration with new governance contract address");
    console.log("2. Grant MINTER_ROLE to governance contract on YTILI token (if needed)");
    console.log("3. Test governance functionality with real YTILI token holders");
    console.log("4. Deploy frontend governance UI");
    
    return {
      governanceAddress,
      ytiliTokenAddress: YTILI_TOKEN_ADDRESS,
      deploymentInfo
    };
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

// Handle script execution
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
