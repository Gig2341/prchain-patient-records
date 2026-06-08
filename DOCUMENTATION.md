# PRChain — HealthCare Innovations Blockchain System
### Technical Documentation · PRChain Solutions Ltd.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Design Choices](#2-design-choices)
3. [Proof-of-Work Explained](#3-proof-of-work-explained)
4. [Consensus Mechanism Explained](#4-consensus-mechanism-explained)
5. [Project Structure](#5-project-structure)
6. [Setup & Installation](#6-setup--installation)
7. [Compiling the Contract](#7-compiling-the-contract)
8. [Deploying to Sepolia](#8-deploying-to-sepolia)
9. [Running the Interaction Script](#9-running-the-interaction-script)
10. [Running the Test Suite](#10-running-the-test-suite)
11. [Test Case Reference](#11-test-case-reference)
12. [Smart Contract Reference](#12-smart-contract-reference)

---

## 1. Project Overview

This system has two independent layers:

| Layer | Technology | Purpose |
|---|---|---|
| Custom blockchain | Python | Demonstrates block structure, PoW, consensus |
| Smart contract | Solidity + Hardhat | Production-grade patient record management on Ethereum |

Both layers address the same healthcare problem: immutable, auditable, access-controlled patient records.

---

## 2. Design Choices

### Python Blockchain

| Decision | Rationale |
|---|---|
| SHA-256 hashing | Industry standard; produces a deterministic 64-char hex fingerprint |
| Difficulty = 4 leading zeros | Balances mine time (~seconds) vs. security for demonstration |
| Nonce-based PoW | Simple, understandable implementation matching Bitcoin's original design |
| Longest-chain consensus | Mirrors Bitcoin's Nakamoto consensus; easy to simulate with two chain objects |
| `dataclasses`-style Block | Keeps all block fields together; easy to serialise to JSON for hashing |

### Solidity Smart Contract

| Decision | Rationale |
|---|---|
| `mapping(uint256 => PatientRecord)` | O(1) lookup by record ID; no iteration required |
| `uint256 totalRecords` as ID generator | Auto-increments; records can never be confused or overwritten |
| Separate `currentProvider` + `originalProvider` | Full audit trail even after multiple transfers |
| `onlyAuthorized` modifier on reads AND writes | Prevents any unauthorized address from seeing patient data |
| `recordExists` modifier | Guards every record-specific function; eliminates duplicate checks |
| Events on every state change | Creates an immutable, queryable audit log on-chain |
| Case-insensitive patient name index | Prevents duplicate entries for "Alice" vs "alice" |
| `isActive` soft-delete flag | Records can be deactivated without erasing history |
| Solidity 0.8.x | Built-in overflow protection; no SafeMath library needed |

---

## 3. Proof-of-Work Explained

Proof-of-Work (PoW) is the mechanism that makes the blockchain tamper-resistant.

### How it works (step by step)

```
Block data (index + prev_hash + timestamp + data) is fixed.
                        │
                        ▼
        We try nonce = 0  →  hash = "a7f3c9..."  ✗ (no leading zeros)
        We try nonce = 1  →  hash = "2b81d4..."  ✗
        We try nonce = 2  →  hash = "0041e2..."  ✗ (only 1 zero)
        ...
        We try nonce = 47823  →  hash = "00008f..."  ✓ (4 zeros — DONE!)
```

### Why it matters

- Changing ANY data in a past block changes its hash
- The new hash no longer starts with 4 zeros
- The miner must redo all the work to find a valid nonce again
- AND every subsequent block's `previous_hash` also breaks — cascading work
- This makes rewriting history computationally infeasible

### Difficulty setting

```python
DIFFICULTY = 4   # requires hash to start with "0000..."
```

Each extra zero increases the average work by a factor of 16
(because each hex character has 16 possible values).

| Difficulty | Average attempts | Approx time |
|---|---|---|
| 2 | ~256 | < 1 ms |
| 3 | ~4,096 | ~10 ms |
| 4 | ~65,536 | ~100 ms |
| 5 | ~1,048,576 | ~1–2 sec |

---

## 4. Consensus Mechanism Explained

The consensus mechanism resolves disagreements between nodes that have
different versions of the blockchain (e.g. due to network splits).

### The Rule: Longest Valid Chain Wins

```
Node A chain:  [Genesis] → [Block 1] → [Block 2]              (length: 3)
Node B chain:  [Genesis] → [Block 1] → [Block 2] → [Block 3]  (length: 4)

Result: Node A adopts Node B's chain.
```

### Implementation logic

```python
@classmethod
def resolve_conflict(cls, local_chain, candidate_chain):
    temp = cls.__new__(cls)
    temp.chain = candidate_chain

    if len(candidate_chain) > len(local_chain) and temp.is_valid():
        return candidate_chain   # switch to longer chain
    return local_chain           # keep current chain
```

### Why longest chain?

- The longest chain represents the most cumulative computational work
- An attacker would need >50% of the network's total hash power
  to consistently produce a longer chain than honest nodes
- This is Bitcoin's Nakamoto Consensus, the most battle-tested approach

---

## 5. Project Structure

```
prchain/
├── contracts/
│   └── PatientRecordContract.sol   # Smart contract
├── scripts/
│   ├── deploy.js                   # Deployment script
│   └── interact.js                 # Interaction demo
├── test/
│   └── PatientRecordContract.test.js
├── blockchain.py                   # Python blockchain demo
├── hardhat.config.js
├── .env.example                    # Copy to .env and fill in
├── deployment.json                 # Auto-generated after deploy
└── DOCUMENTATION.md
```

---

## 6. Setup & Installation

### Prerequisites
- Node.js v18+
- npm v8+
- Python 3.8+
- A MetaMask wallet (test account only)
- Sepolia ETH (free from faucet)

### Install dependencies

```bash
# Initialise Hardhat project
mkdir prchain && cd prchain
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv

# Copy config files into project root
# (place hardhat.config.js, .env.example here)

cp .env.example .env
# Edit .env with your real values (see section below)
```

### Configure .env

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
```

**Get Sepolia ETH:**
Visit https://sepoliafaucet.com and paste your wallet address.
You receive 0.5 ETH — enough for many deployments.

---

## 7. Compiling the Contract

```bash
npx hardhat compile
```

Expected output:
```
Compiled 1 Solidity file successfully (evm target: paris).
```

The ABI and bytecode are saved to:
```
artifacts/contracts/PatientRecordContract.sol/PatientRecordContract.json
```

---

## 8. Deploying to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Expected output:
```
========================================
  PRChain — Contract Deployment Script
========================================

Deployer address : 0xYourAddress...
Account balance  : 0.5 ETH

Deploying PatientRecordContract...
✓ Contract deployed to: 0xContractAddress...

Initial state:
  totalRecords : 0
  admin        : 0xYourAddress...

✓ Deployment info saved to deployment.json

View on Etherscan:
  https://sepolia.etherscan.io/address/0xContractAddress...
```

### Optional: Verify on Etherscan

```bash
npx hardhat verify --network sepolia 0xContractAddress
```

This makes the contract source code publicly visible and readable
on Sepolia Etherscan.

---

## 9. Running the Interaction Script

```bash
npx hardhat run scripts/interact.js --network sepolia
```

This script will:
1. Authorize Provider A and Provider B
2. Add 3 patient records via Provider A
3. Read back Record #1
4. Transfer Record #1 from Provider A to Provider B
5. Verify the transfer succeeded
6. Lookup all records for "Alice Johnson"

---

## 10. Running the Test Suite

```bash
# All tests (local Hardhat network — no ETH needed)
npx hardhat test

# With gas report
REPORT_GAS=true npx hardhat test

# Single test file
npx hardhat test test/PatientRecordContract.test.js

# Run Python blockchain tests
python -m pytest test_blockchain.py -v
```

Expected output:
```
  1. Deployment & Initial State
    ✓ TC-01: totalRecords starts at 0
    ✓ TC-02: deployer is set as admin
    ✓ TC-03: admin is automatically an authorized provider
    ✓ TC-04: a random address is NOT authorized by default

  2. Provider Authorization
    ✓ TC-05: admin can authorize a new provider
    ...

  27 passing (4s)
```

---

## 11. Test Case Reference

| ID | Suite | Description | Expected |
|---|---|---|---|
| TC-01 | Deployment | totalRecords starts at 0 | Pass |
| TC-02 | Deployment | Deployer is admin | Pass |
| TC-03 | Deployment | Admin auto-authorized | Pass |
| TC-04 | Deployment | Stranger not authorized | Pass |
| TC-05 | Authorization | Admin can authorize provider | Pass |
| TC-06 | Authorization | Admin can revoke provider | Pass |
| TC-07 | Authorization | Emits event on authorization | Pass |
| TC-08 | Authorization | Non-admin cannot authorize | Revert |
| TC-09 | Authorization | Zero address rejected | Revert |
| TC-10 | Add Record | Authorized provider adds record | Pass |
| TC-11 | Add Record | totalRecords increments correctly | Pass |
| TC-12 | Add Record | RecordAdded event emitted | Pass |
| TC-13 | Add Record | All fields stored correctly | Pass |
| TC-14 | Add Record | Unauthorized cannot add | Revert |
| TC-15 | Add Record | Empty name rejected | Revert |
| TC-16 | Add Record | Zero DOB rejected | Revert |
| TC-17 | Transfer | Holder can transfer to authorized | Pass |
| TC-18 | Transfer | originalProvider unchanged | Pass |
| TC-19 | Transfer | RecordTransferred event emitted | Pass |
| TC-20 | Transfer | Non-holder cannot transfer | Revert |
| TC-21 | Transfer | Cannot transfer to unauthorized | Revert |
| TC-22 | Transfer | Cannot transfer to self | Revert |
| TC-23 | Transfer | Cannot transfer non-existent ID | Revert |
| TC-24 | Read | Authorized provider can read | Pass |
| TC-25 | Read | Unauthorized cannot read | Revert |
| TC-26 | Lookup | getRecordIdsByPatient case-insensitive | Pass |
| TC-27 | Lookup | Returns empty for unknown patient | Pass |

---

## 12. Smart Contract Reference

### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `totalRecords` | uint256 | public | Count of all records ever created |
| `admin` | address | public | Contract deployer / hospital admin |
| `records` | mapping | private | recordId → PatientRecord struct |
| `authorizedProviders` | mapping | public | address → bool access control |

### PatientRecord Struct Fields

| Field | Type | Description |
|---|---|---|
| `recordId` | uint256 | Unique auto-incremented ID |
| `patientName` | string | Full patient name |
| `dateOfBirth` | uint256 | Unix timestamp |
| `diagnosis` | string | Medical diagnosis |
| `prescription` | string | Prescription details |
| `currentProvider` | address | Current record holder |
| `originalProvider` | address | Provider who created the record |
| `createdAt` | uint256 | Block timestamp of creation |
| `updatedAt` | uint256 | Block timestamp of last update |
| `isActive` | bool | Soft-delete flag |

### Functions

| Function | Modifier(s) | Description |
|---|---|---|
| `setProviderAuthorization` | onlyAdmin | Grant or revoke a provider |
| `addPatientRecord` | onlyAuthorized | Register a new patient record |
| `transferRecord` | onlyAuthorized, recordExists | Transfer record to another provider |
| `getRecord` | onlyAuthorized, recordExists | Read a full record by ID |
| `getRecordIdsByPatient` | onlyAuthorized | Lookup record IDs by patient name |
| `isAuthorizedProvider` | — | Public authorization check |

### Events

| Event | Parameters | Emitted When |
|---|---|---|
| `RecordAdded` | recordId, patientName, provider, timestamp | New record created |
| `RecordTransferred` | recordId, from, to, timestamp | Record transferred |
| `ProviderAuthorizationChanged` | provider, authorized | Provider status updated |

---

*Documentation prepared by PRChain Solutions Ltd. for HealthCare Innovations Ltd.*
