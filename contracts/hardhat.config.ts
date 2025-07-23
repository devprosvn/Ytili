
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true,
    }
  },
  networks: {
    ytili: {
      url: "https://ytili-2752546100676000-1.jsonrpc.sagarpc.io",
      accounts: ["0x089508337775c666afba30ff3ea382b8db512952103958136f0170280e818068"],
      chainId: 2752546100676000,
      gasPrice: "auto",
      timeout: 60000
    },
    saga: {
      url: "https://ytili-2752546100676000-1.jsonrpc.sagarpc.io",
      accounts: ["0x089508337775c666afba30ff3ea382b8db512952103958136f0170280e818068"],
      chainId: 2752546100676000,
      gasPrice: "auto",
      timeout: 60000
    },
    hardhat: {
      chainId: 1337,
      accounts: {
        accountsBalance: "10000000000000000000000000"
      }
    }
  },
  etherscan: {
    apiKey: {
      devpros: "empty"
    },
    customChains: [
      {
        network: "devpros",
        chainId: 2749656616387000,
        urls: {
          apiURL: "https://api-ytili-2752546100676000-1.sagaexplorer.io/api",
          browserURL: "https://ytili-2752546100676000-1.sagaexplorer.io:443"
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  },
  paths: {
    sources: "./contracts",
    tests: "./test", 
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
