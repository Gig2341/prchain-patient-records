// test/PatientRecordContract.test.js
// Run: npx hardhat test

const { expect }        = require("chai");
const { ethers }        = require("hardhat");
const { loadFixture }   = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─────────────────────────────────────────────────────────────────
//  FIXTURE — deploy once, snapshot, reuse across tests
// ─────────────────────────────────────────────────────────────────
async function deployFixture() {
  const [admin, providerA, providerB, unauthorized, stranger] =
    await ethers.getSigners();

  const Factory  = await ethers.getContractFactory("PatientRecordContract");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  // Helper: authorize a provider as admin
  async function authorize(addr) {
    await contract.connect(admin).setProviderAuthorization(addr, true);
  }

  // Helper: add a basic record as providerA (must be authorized first)
  async function addRecord(provider, overrides = {}) {
    return contract.connect(provider).addPatientRecord(
      overrides.name         ?? "Alice Johnson",
      overrides.dob          ?? 631152000,          // 1990-01-01
      overrides.diagnosis    ?? "Hypertension",
      overrides.prescription ?? "Lisinopril 10mg"
    );
  }

  return { contract, admin, providerA, providerB, unauthorized, stranger, authorize, addRecord };
}

// ─────────────────────────────────────────────────────────────────
//  TEST SUITE 1 — Deployment & Initial State
// ─────────────────────────────────────────────────────────────────
describe("1. Deployment & Initial State", () => {
  it("TC-01: totalRecords starts at 0", async () => {
    const { contract } = await loadFixture(deployFixture);
    expect(await contract.totalRecords()).to.equal(0);
  });

  it("TC-02: deployer is set as admin", async () => {
    const { contract, admin } = await loadFixture(deployFixture);
    expect(await contract.admin()).to.equal(admin.address);
  });

  it("TC-03: admin is automatically an authorized provider", async () => {
    const { contract, admin } = await loadFixture(deployFixture);
    expect(await contract.isAuthorizedProvider(admin.address)).to.be.true;
  });

  it("TC-04: a random address is NOT authorized by default", async () => {
    const { contract, stranger } = await loadFixture(deployFixture);
    expect(await contract.isAuthorizedProvider(stranger.address)).to.be.false;
  });
});

// ─────────────────────────────────────────────────────────────────
//  TEST SUITE 2 — Provider Authorization
// ─────────────────────────────────────────────────────────────────
describe("2. Provider Authorization", () => {
  it("TC-05: admin can authorize a new provider", async () => {
    const { contract, admin, providerA } = await loadFixture(deployFixture);
    await contract.connect(admin).setProviderAuthorization(providerA.address, true);
    expect(await contract.isAuthorizedProvider(providerA.address)).to.be.true;
  });

  it("TC-06: admin can revoke an authorized provider", async () => {
    const { contract, admin, providerA, authorize } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await contract.connect(admin).setProviderAuthorization(providerA.address, false);
    expect(await contract.isAuthorizedProvider(providerA.address)).to.be.false;
  });

  it("TC-07: emits ProviderAuthorizationChanged on authorization", async () => {
    const { contract, admin, providerA } = await loadFixture(deployFixture);
    await expect(
      contract.connect(admin).setProviderAuthorization(providerA.address, true)
    )
      .to.emit(contract, "ProviderAuthorizationChanged")
      .withArgs(providerA.address, true);
  });

  it("TC-08: non-admin cannot authorize a provider", async () => {
    const { contract, providerA, providerB } = await loadFixture(deployFixture);
    await expect(
      contract.connect(providerA).setProviderAuthorization(providerB.address, true)
    ).to.be.revertedWith("PatientRecordContract: caller is not admin");
  });

  it("TC-09: cannot authorize the zero address", async () => {
    const { contract, admin } = await loadFixture(deployFixture);
    await expect(
      contract.connect(admin).setProviderAuthorization(ethers.ZeroAddress, true)
    ).to.be.revertedWith("PatientRecordContract: zero address");
  });
});

// ─────────────────────────────────────────────────────────────────
//  TEST SUITE 3 — Adding Patient Records
// ─────────────────────────────────────────────────────────────────
describe("3. Adding Patient Records", () => {
  it("TC-10: authorized provider can add a record", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    expect(await contract.totalRecords()).to.equal(1);
  });

  it("TC-11: totalRecords increments with each new record", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    await addRecord(providerA, { name: "Bob Carter" });
    await addRecord(providerA, { name: "Carol White" });
    expect(await contract.totalRecords()).to.equal(3);
  });

  it("TC-12: emits RecordAdded event on successful add", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await expect(addRecord(providerA))
      .to.emit(contract, "RecordAdded")
      .withArgs(1, "Alice Johnson", providerA.address, await getBlockTimestamp());
  });

  it("TC-13: record fields are stored correctly", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    const rec = await contract.connect(providerA).getRecord(1);
    expect(rec.recordId).to.equal(1);
    expect(rec.patientName).to.equal("Alice Johnson");
    expect(rec.dateOfBirth).to.equal(631152000);
    expect(rec.diagnosis).to.equal("Hypertension");
    expect(rec.prescription).to.equal("Lisinopril 10mg");
    expect(rec.currentProvider).to.equal(providerA.address);
    expect(rec.originalProvider).to.equal(providerA.address);
    expect(rec.isActive).to.be.true;
  });

  it("TC-14: unauthorized address cannot add a record", async () => {
    const { contract, unauthorized, addRecord } = await loadFixture(deployFixture);
    await expect(addRecord(unauthorized)).to.be.revertedWith(
      "PatientRecordContract: caller is not an authorized provider"
    );
  });

  it("TC-15: empty patient name is rejected", async () => {
    const { contract, admin, addRecord } = await loadFixture(deployFixture);
    await expect(addRecord(admin, { name: "" })).to.be.revertedWith(
      "PatientRecordContract: name cannot be empty"
    );
  });

  it("TC-16: zero date of birth is rejected", async () => {
    const { contract, admin, addRecord } = await loadFixture(deployFixture);
    await expect(addRecord(admin, { dob: 0 })).to.be.revertedWith(
      "PatientRecordContract: invalid date of birth"
    );
  });
});

// ─────────────────────────────────────────────────────────────────
//  TEST SUITE 4 — Transferring Records
// ─────────────────────────────────────────────────────────────────
describe("4. Transferring Patient Records", () => {
  it("TC-17: current holder can transfer record to authorized provider", async () => {
    const { contract, providerA, providerB, authorize, addRecord } =
      await loadFixture(deployFixture);
    await authorize(providerA.address);
    await authorize(providerB.address);
    await addRecord(providerA);
    await contract.connect(providerA).transferRecord(1, providerB.address);
    const rec = await contract.connect(providerB).getRecord(1);
    expect(rec.currentProvider).to.equal(providerB.address);
  });

  it("TC-18: originalProvider remains unchanged after transfer", async () => {
    const { contract, providerA, providerB, authorize, addRecord } =
      await loadFixture(deployFixture);
    await authorize(providerA.address);
    await authorize(providerB.address);
    await addRecord(providerA);
    await contract.connect(providerA).transferRecord(1, providerB.address);
    const rec = await contract.connect(providerB).getRecord(1);
    expect(rec.originalProvider).to.equal(providerA.address);
  });

  it("TC-19: emits RecordTransferred event on transfer", async () => {
    const { contract, providerA, providerB, authorize, addRecord } =
      await loadFixture(deployFixture);
    await authorize(providerA.address);
    await authorize(providerB.address);
    await addRecord(providerA);
    await expect(contract.connect(providerA).transferRecord(1, providerB.address))
      .to.emit(contract, "RecordTransferred")
      .withArgs(1, providerA.address, providerB.address, await getBlockTimestamp());
  });

  it("TC-20: non-holder cannot transfer a record", async () => {
    const { contract, admin, providerA, providerB, authorize, addRecord } =
      await loadFixture(deployFixture);
    await authorize(providerA.address);
    await authorize(providerB.address);
    await addRecord(providerA);   // providerA holds record #1
    await expect(
      contract.connect(providerB).transferRecord(1, admin.address)
    ).to.be.revertedWith(
      "PatientRecordContract: only the current record holder can transfer"
    );
  });

  it("TC-21: cannot transfer to an unauthorized address", async () => {
    const { contract, providerA, stranger, authorize, addRecord } =
      await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    await expect(
      contract.connect(providerA).transferRecord(1, stranger.address)
    ).to.be.revertedWith(
      "PatientRecordContract: recipient is not an authorized provider"
    );
  });

  it("TC-22: cannot transfer a record to yourself", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    await expect(
      contract.connect(providerA).transferRecord(1, providerA.address)
    ).to.be.revertedWith("PatientRecordContract: cannot transfer to yourself");
  });

  it("TC-23: cannot transfer a non-existent record", async () => {
    const { contract, providerA, providerB, authorize } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await authorize(providerB.address);
    await expect(
      contract.connect(providerA).transferRecord(999, providerB.address)
    ).to.be.revertedWith("PatientRecordContract: record does not exist");
  });
});

// ─────────────────────────────────────────────────────────────────
//  TEST SUITE 5 — Read & Lookup Functions
// ─────────────────────────────────────────────────────────────────
describe("5. Reading and Lookup", () => {
  it("TC-24: authorized provider can read a record", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA);
    const rec = await contract.connect(providerA).getRecord(1);
    expect(rec.patientName).to.equal("Alice Johnson");
  });

  it("TC-25: unauthorized address cannot read a record", async () => {
    const { contract, admin, unauthorized, addRecord } = await loadFixture(deployFixture);
    await addRecord(admin);
    await expect(
      contract.connect(unauthorized).getRecord(1)
    ).to.be.revertedWith(
      "PatientRecordContract: caller is not an authorized provider"
    );
  });

  it("TC-26: getRecordIdsByPatient returns correct IDs (case-insensitive)", async () => {
    const { contract, providerA, authorize, addRecord } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    await addRecord(providerA, { name: "Alice Johnson" });
    await addRecord(providerA, { name: "Alice Johnson" });   // second visit
    const ids = await contract.connect(providerA).getRecordIdsByPatient("alice johnson");
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(1);
    expect(ids[1]).to.equal(2);
  });

  it("TC-27: getRecordIdsByPatient returns empty array for unknown patient", async () => {
    const { contract, providerA, authorize } = await loadFixture(deployFixture);
    await authorize(providerA.address);
    const ids = await contract.connect(providerA).getRecordIdsByPatient("Nobody Known");
    expect(ids.length).to.equal(0);
  });
});

// ─────────────────────────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────────────────────────
async function getBlockTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}
