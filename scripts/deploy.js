// scripts/deploy.js
// Deploy PatientRecordContract to Sepolia testnet
// Run: npx hardhat run scripts/deploy.js --network sepolia

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n========================================");
  console.log("  PRChain — Contract Deployment Script");
  console.log("========================================\n");

  // ── 1. Get deployer account ──────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer address :", deployer.address);
  console.log("Account balance  :", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Fund it at https://sepoliafaucet.com");
  }

  // ── 2. Compile & deploy ──────────────────────────────────────
  console.log("\nDeploying PatientRecordContract...");
  const Factory  = await ethers.getContractFactory("PatientRecordContract");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✓ Contract deployed to:", address);

  // ── 3. Verify initial state ──────────────────────────────────
  const total = await contract.totalRecords();
  const admin = await contract.admin();
  console.log("\nInitial state:");
  console.log("  totalRecords :", total.toString());
  console.log("  admin        :", admin);

  // ── 4. Save deployment info ──────────────────────────────────
  const info = {
    network:        "sepolia",
    contractAddress: address,
    deployer:       deployer.address,
    deployedAt:     new Date().toISOString(),
    totalRecords:   total.toString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(info, null, 2)
  );
  console.log("\n✓ Deployment info saved to deployment.json");
  console.log("\nView on Etherscan:");
  console.log(`  https://sepolia.etherscan.io/address/${address}`);
  console.log("\n========================================\n");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
