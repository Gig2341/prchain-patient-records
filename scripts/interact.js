// scripts/interact.js
// Demonstrates adding patient records and transferring between providers.
// Run AFTER deploying: npx hardhat run scripts/interact.js --network sepolia

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ── Helpers ──────────────────────────────────────────────────────
function dateToUnix(dateStr) {
  // Convert "YYYY-MM-DD" to Unix timestamp
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("\n========================================");
  console.log("  PRChain — Contract Interaction Script");
  console.log("========================================\n");

  // ── 1. Load deployment info ──────────────────────────────────
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found. Run deploy.js first.");
  }
  const { contractAddress } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("Contract address:", contractAddress);

  // ── 2. Connect to deployed contract ─────────────────────────
  const [admin, providerA, providerB] = await ethers.getSigners();
  const Factory  = await ethers.getContractFactory("PatientRecordContract");
  const contract = Factory.attach(contractAddress);

  console.log("\nAccounts:");
  console.log("  Admin     :", admin.address);
  console.log("  Provider A:", providerA.address);
  console.log("  Provider B:", providerB.address);

  // ── 3. Authorize providers ───────────────────────────────────
  console.log("\n[Step 1] Authorizing Provider A and Provider B...");

  let tx = await contract.connect(admin).setProviderAuthorization(providerA.address, true);
  await tx.wait();
  console.log("  ✓ Provider A authorized. TX:", tx.hash);

  tx = await contract.connect(admin).setProviderAuthorization(providerB.address, true);
  await tx.wait();
  console.log("  ✓ Provider B authorized. TX:", tx.hash);

  // ── 4. Add patient records (Provider A) ─────────────────────
  console.log("\n[Step 2] Provider A adding patient records...");

  const patients = [
    {
      name:         "Alice Johnson",
      dob:          dateToUnix("1990-04-12"),
      diagnosis:    "Hypertension",
      prescription: "Lisinopril 10mg daily",
    },
    {
      name:         "Bob Carter",
      dob:          dateToUnix("1985-11-03"),
      diagnosis:    "Type 2 Diabetes",
      prescription: "Metformin 500mg twice daily",
    },
    {
      name:         "Carol White",
      dob:          dateToUnix("2000-07-22"),
      diagnosis:    "Asthma",
      prescription: "Salbutamol inhaler as needed",
    },
  ];

  const recordIds = [];
  for (const p of patients) {
    tx = await contract.connect(providerA).addPatientRecord(
      p.name, p.dob, p.diagnosis, p.prescription
    );
    const receipt = await tx.wait();

    // Pull recordId from the emitted RecordAdded event
    const event = receipt.logs
      .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find((e) => e && e.name === "RecordAdded");

    const id = event ? event.args.recordId.toString() : "?";
    recordIds.push(id);
    console.log(`  ✓ Record #${id} added for ${p.name}. TX: ${tx.hash}`);
  }

  // ── 5. Read total records ────────────────────────────────────
  const total = await contract.totalRecords();
  console.log(`\n  totalRecords = ${total}`);

  // ── 6. Read a record ─────────────────────────────────────────
  console.log("\n[Step 3] Reading Record #1 (Provider A)...");
  const record = await contract.connect(providerA).getRecord(1);
  console.log("  Patient name    :", record.patientName);
  console.log("  Diagnosis       :", record.diagnosis);
  console.log("  Prescription    :", record.prescription);
  console.log("  Current provider:", record.currentProvider);

  // ── 7. Transfer record #1 to Provider B ─────────────────────
  console.log("\n[Step 4] Provider A transferring Record #1 to Provider B...");
  tx = await contract.connect(providerA).transferRecord(1, providerB.address);
  await tx.wait();
  console.log("  ✓ Transfer complete. TX:", tx.hash);

  // ── 8. Verify transfer ───────────────────────────────────────
  console.log("\n[Step 5] Verifying transfer — Provider B reads Record #1...");
  const transferred = await contract.connect(providerB).getRecord(1);
  console.log("  Current provider:", transferred.currentProvider);
  console.log(
    "  Transfer success:",
    transferred.currentProvider.toLowerCase() === providerB.address.toLowerCase()
      ? "✓ YES"
      : "✗ NO"
  );

  // ── 9. Lookup by patient name ────────────────────────────────
  console.log("\n[Step 6] Lookup records for 'Alice Johnson'...");
  const ids = await contract.connect(providerA).getRecordIdsByPatient("Alice Johnson");
  console.log("  Record IDs:", ids.map((id) => id.toString()));

  // ── 10. Etherscan links ──────────────────────────────────────
  console.log("\n========================================");
  console.log("  View on Sepolia Etherscan:");
  console.log(`  https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Interaction failed:", err);
  process.exit(1);
});
