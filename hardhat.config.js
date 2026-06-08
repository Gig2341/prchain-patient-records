// hardhat.config.js
// Place this in the root of your Hardhat project.
// Install deps: npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // Local Hardhat node (for development)
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Sepolia testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,        // Alchemy / Infura endpoint
      accounts: [process.env.PRIVATE_KEY],      // Deployer wallet private key
      chainId: 11155111,
    },
  },

  // Etherscan verification (optional)
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
    },
  },

  // Gas reporter (optional — shows gas cost per function)
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
