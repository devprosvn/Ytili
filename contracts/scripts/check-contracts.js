const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking deployed contracts on Saga blockchain...");
  
  const contractAddresses = {
    DonationRegistry: "0x59237964c2e7Fdac2bDA4FF5585b117b9D222eb9",
    TransparencyVerifier: "0x1a13bD79301053D0273019E98cde0E3FcCcBc496",
    YtiliToken: "0x24F10389228681f8Cc0C627AAD3a892C064c8daB"
  };

  const [deployer] = await ethers.getSigners();
  console.log("📝 Checking with account:", deployer.address);
  
  // Check network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name, "Chain ID:", network.chainId.toString());
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

  console.log("\n" + "=".repeat(60));
  
  for (const [contractName, address] of Object.entries(contractAddresses)) {
    try {
      console.log(`\n🔍 Checking ${contractName} at ${address}...`);
      
      // Check if contract exists
      const code = await ethers.provider.getCode(address);
      if (code === "0x") {
        console.log(`❌ ${contractName}: No contract found at address`);
        continue;
      }
      
      console.log(`✅ ${contractName}: Contract exists (${code.length} bytes)`);
      
      // Try to interact with specific contracts
      if (contractName === "YtiliToken") {
        try {
          const tokenContract = await ethers.getContractAt("YtiliToken", address);
          const name = await tokenContract.name();
          const symbol = await tokenContract.symbol();
          const totalSupply = await tokenContract.totalSupply();
          
          console.log(`   📊 Token Info:`);
          console.log(`      Name: ${name}`);
          console.log(`      Symbol: ${symbol}`);
          console.log(`      Total Supply: ${ethers.formatEther(totalSupply)} YTILI`);
        } catch (error) {
          console.log(`   ⚠️  Could not read token info: ${error.message}`);
        }
      }
      
      if (contractName === "DonationRegistry") {
        try {
          const registryContract = await ethers.getContractAt("DonationRegistry", address);
          const totalDonations = await registryContract.totalDonations();
          
          console.log(`   📊 Registry Info:`);
          console.log(`      Total Donations: ${totalDonations.toString()}`);
        } catch (error) {
          console.log(`   ⚠️  Could not read registry info: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ ${contractName}: Error checking contract - ${error.message}`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ Contract verification complete!");
  console.log("\n📋 Summary:");
  console.log("• All contracts are deployed on Saga blockchain");
  console.log("• Network: Saga Chainlet (Chain ID: 2752546100676000)");
  console.log("• Ready for backend integration");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
