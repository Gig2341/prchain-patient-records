import hashlib
import time
import json

# ─────────────────────────────────────────────────────────────────
#  PRChain Solutions Ltd.
#  Client : HealthCare Innovations Ltd.
#  Module : Custom Blockchain Prototype
#  Purpose: Demonstrates block structure, proof-of-work mining,
#            chain validation, tamper detection, and Nakamoto
#            consensus on a simulated patient-record ledger.
# ─────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────
#  BLOCK
# ─────────────────────────────────────────────

class Block:
    """
    Represents a single block in the PRChain blockchain.

    Fields
    ------
    index         : int   — Position of the block in the chain (0 = genesis).
    previous_hash : str   — SHA-256 hash of the preceding block.
                            Linking blocks creates the immutable chain.
    timestamp     : float — Unix timestamp of block creation (seconds).
    data          : any   — Payload stored in the block. For PRChain this
                            is a dict representing a patient record event.
    nonce         : int   — Counter incremented during proof-of-work mining
                            until the hash meets the difficulty target.
    hash          : str   — SHA-256 fingerprint of all the above fields.
                            Recomputed on every nonce increment.
    """

    def __init__(self, index, previous_hash, timestamp, data, nonce=0):
        self.index         = index
        self.previous_hash = previous_hash
        self.timestamp     = timestamp
        self.data          = data
        self.nonce         = nonce
        self.hash          = self.calculate_hash()

    # ── Hashing ───────────────────────────────

    def calculate_hash(self):
        """
        Compute SHA-256 hash of the block's contents.

        All fields are serialised to JSON with sorted keys to guarantee
        a deterministic string regardless of insertion order.
        Changing any single field — including the nonce — produces an
        entirely different 256-bit hash output.
        """
        block_string = json.dumps({
            "index":         self.index,
            "previous_hash": self.previous_hash,
            "timestamp":     self.timestamp,
            "data":          self.data,
            "nonce":         self.nonce
        }, sort_keys=True)
        return hashlib.sha256(block_string.encode()).hexdigest()

    # ── Proof-of-Work ─────────────────────────

    def mine_block(self, difficulty):
        """
        Proof-of-Work mining loop.

        Increments the nonce until the block hash starts with
        `difficulty` leading zeros (the difficulty target).

        Parameters
        ----------
        difficulty : int — Number of leading zeros required.
                           Higher values exponentially increase work.

        Why this matters
        ----------------
        Rewriting a historical block requires re-mining it AND every
        block that follows it, because each block's previous_hash
        links to the preceding block's hash. This makes tampering
        computationally infeasible on a live network.
        """
        target = "0" * difficulty
        attempts = 0
        while not self.hash.startswith(target):
            self.nonce += 1
            attempts   += 1
            self.hash   = self.calculate_hash()
        print(
            f"  ⛏  Block {self.index} mined  |  "
            f"nonce = {self.nonce:,}  |  "
            f"attempts = {attempts:,}  |  "
            f"hash = {self.hash[:24]}..."
        )

    # ── Pretty print ──────────────────────────

    def __repr__(self):
        data_str = (
            json.dumps(self.data, indent=6)
            if isinstance(self.data, dict)
            else str(self.data)
        )
        return (
            f"\n{'─' * 64}\n"
            f"  Block #      : {self.index}\n"
            f"  Timestamp    : {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(self.timestamp))}\n"
            f"  Nonce        : {self.nonce:,}\n"
            f"  Data         : {data_str}\n"
            f"  Prev Hash    : {self.previous_hash[:32]}...\n"
            f"  Hash         : {self.hash[:32]}...\n"
            f"{'─' * 64}"
        )


# ─────────────────────────────────────────────
#  BLOCKCHAIN
# ─────────────────────────────────────────────

class Blockchain:
    """
    A singly-linked chain of Block objects secured by proof-of-work.

    Design choices
    --------------
    - SHA-256  : Collision-resistant; industry standard (Bitcoin, TLS).
    - Difficulty 4 : Requires hash starting with '0000'. Averages ~65,536
                     attempts (~100 ms). Balances demo speed vs. meaningful work.
    - JSON serialisation : Human-readable, deterministic with sort_keys=True,
                           and language-agnostic for future interoperability.
    - Longest-chain consensus : Mirrors Nakamoto consensus (Bitcoin). The chain
                                representing the most cumulative proof-of-work wins.
    """

    DIFFICULTY = 4   # leading zeros required — change to 3 for faster demos

    def __init__(self):
        print("  Initialising blockchain...")
        self.chain = [self._create_genesis_block()]

    # ── Genesis block ──────────────────────────

    def _create_genesis_block(self):
        """
        Create Block #0 — the genesis block.

        Has no predecessor, so previous_hash is set to 64 zeros
        as a conventional placeholder. Like all blocks, it is
        mined through proof-of-work before being accepted.
        """
        genesis = Block(
            index=0,
            previous_hash="0" * 64,
            timestamp=time.time(),
            data="Genesis Block — HealthCare Innovations Ltd."
        )
        genesis.mine_block(self.DIFFICULTY)
        return genesis

    # ── Chain helpers ──────────────────────────

    @property
    def latest_block(self):
        """Return the most recently added block."""
        return self.chain[-1]

    # ── Add new block ──────────────────────────

    def add_block(self, data):
        """
        Create, mine, and append a new block to the chain.

        Parameters
        ----------
        data : dict — Patient record event (action, patient ID, etc.)

        The new block's previous_hash is set to the current chain tip's
        hash, cryptographically linking it to the existing chain.
        """
        new_block = Block(
            index=len(self.chain),
            previous_hash=self.latest_block.hash,
            timestamp=time.time(),
            data=data
        )
        new_block.mine_block(self.DIFFICULTY)
        self.chain.append(new_block)
        return new_block

    # ── Validation ─────────────────────────────

    def is_valid(self):
        """
        Validate the full chain with two checks per block:

        1. Integrity check  — recompute the block's hash and compare
                              to the stored value. Any field change
                              produces a different hash and fails here.

        2. Linkage check    — confirm current.previous_hash matches
                              the actual hash of the preceding block.
                              Tampering severs this link.

        Returns True only if every block passes both checks.
        """
        for i in range(1, len(self.chain)):
            current  = self.chain[i]
            previous = self.chain[i - 1]

            # 1. Integrity
            if current.hash != current.calculate_hash():
                print(f"  ✗ INVALID — Block #{i} hash mismatch (data tampered).")
                return False

            # 2. Linkage
            if current.previous_hash != previous.hash:
                print(f"  ✗ INVALID — Block #{i} not linked to Block #{i-1} (chain broken).")
                return False

        return True

    # ── Consensus: longest valid chain ────────

    @classmethod
    def resolve_conflict(cls, local_chain, candidate_chain):
        """
        Nakamoto Consensus — longest valid chain rule.

        If a peer presents a chain that is:
          (a) longer than the local chain, AND
          (b) fully valid (every block passes integrity + linkage checks)
        then the local node replaces its chain with the peer's chain.

        This mirrors Bitcoin's consensus mechanism. The longest chain
        represents the most cumulative proof-of-work, making it the
        authoritative version of the ledger.

        Parameters
        ----------
        local_chain     : list[Block] — This node's current chain.
        candidate_chain : list[Block] — Chain received from a peer node.

        Returns
        -------
        list[Block] — The winning chain (local or candidate).
        """
        temp       = cls.__new__(cls)
        temp.chain = candidate_chain

        if len(candidate_chain) > len(local_chain) and temp.is_valid():
            print(
                f"  ✓ Candidate chain accepted — length {len(candidate_chain)} "
                f"> local length {len(local_chain)}. Switching."
            )
            return candidate_chain
        else:
            print(
                f"  ✗ Candidate chain rejected — local chain "
                f"(length {len(local_chain)}) retained."
            )
            return local_chain

    def __repr__(self):
        return "\n".join(str(block) for block in self.chain)


# ─────────────────────────────────────────────
#  DEMO — HealthCare Innovations Ltd.
# ─────────────────────────────────────────────

if __name__ == "__main__":

    DIVIDER = "\n" + "=" * 64

    print(DIVIDER)
    print("  PRChain — HealthCare Innovations Blockchain Demo")
    print("  PRChain Solutions Ltd.")
    print("=" * 64)

    # ── 1. Initialise blockchain ───────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 1 — Initialising Blockchain (Genesis Block)")
    print("=" * 64 + "\n")

    bc = Blockchain()
    print(f"\n  Genesis block hash   : {bc.chain[0].hash[:32]}...")
    print(f"  Genesis block nonce  : {bc.chain[0].nonce:,}")

    # ── 2. Add patient record blocks ──────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 2 — Adding Patient Record Blocks")
    print("=" * 64 + "\n")

    records = [
        {
            "patient_id":   "P001",
            "action":       "REGISTER",
            "name":         "Amelia Clarke",
            "dob":          "1992-06-15",
            "doctor":       "Dr. Smith",
            "provider":     "0x4497585B8fca71FE25a8f65b8DB30Bbc30fD9427"
        },
        {
            "patient_id":   "P001",
            "action":       "DIAGNOSIS",
            "condition":    "Hypertension",
            "prescription": "Lisinopril 10mg daily",
            "doctor":       "Dr. Smith",
            "provider":     "0x4497585B8fca71FE25a8f65b8DB30Bbc30fD9427"
        },
        {
            "patient_id":   "P002",
            "action":       "REGISTER",
            "name":         "Bob Carter",
            "dob":          "1985-11-03",
            "doctor":       "Dr. Lee",
            "provider":     "0x4497585B8fca71FE25a8f65b8DB30Bbc30fD9427"
        },
        {
            "patient_id":   "P001",
            "action":       "TRANSFER",
            "from_provider":"0x4497585B8fca71FE25a8f65b8DB30Bbc30fD9427",
            "to_provider":  "0x80eecB6dE059BB7F4539d52E505c0c0ED676DEae",
            "authorised_by":"Admin 0x8bE4CaC36D4721002FFd24FFd04f7501b9AcCD36"
        },
    ]

    for record in records:
        bc.add_block(record)

    # ── 3. Print the full chain ────────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 3 — Full Blockchain State")
    print("=" * 64)
    print(bc)
    print(f"\n  Total blocks in chain : {len(bc.chain)}")
    print(f"  Chain tip hash        : {bc.latest_block.hash[:32]}...")

    # ── 4. Validate integrity ──────────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 4 — Chain Integrity Validation")
    print("=" * 64 + "\n")

    result = bc.is_valid()
    print(f"  Chain valid : {result}")
    assert result is True, "Chain should be valid at this point"

    # ── 5. Tamper simulation ──────────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 5 — Tamper Detection Demonstration")
    print("=" * 64 + "\n")

    print("  Altering Block #1 data without re-mining...")
    original_data = bc.chain[1].data.copy()
    bc.chain[1].data = {
        "patient_id": "P001",
        "action":     "TAMPERED — unauthorised record alteration"
    }
    print(f"  Block #1 data changed to: {bc.chain[1].data}")

    result_after_tamper = bc.is_valid()
    print(f"\n  Chain valid after tampering : {result_after_tamper}")
    assert result_after_tamper is False, "Tampered chain should be invalid"

    # Restore for consensus demo
    bc.chain[1].data = original_data

    # ── 6. Consensus mechanism ────────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  STEP 6 — Nakamoto Consensus (Longest Valid Chain)")
    print("=" * 64 + "\n")

    print("  Building honest peer node chain (longer)...")
    honest_chain = Blockchain()
    honest_chain.add_block({
        "patient_id": "P003",
        "action":     "REGISTER",
        "name":       "Carol White",
        "provider":   "0x80eecB6dE059BB7F4539d52E505c0c0ED676DEae"
    })
    honest_chain.add_block({
        "patient_id": "P003",
        "action":     "DIAGNOSIS",
        "condition":  "Type 2 Diabetes",
        "prescription":"Metformin 500mg twice daily"
    })

    short_chain = Blockchain()   # only genesis block — shorter

    print(f"\n  Local chain length     : {len(short_chain.chain)} block(s)")
    print(f"  Candidate chain length : {len(honest_chain.chain)} block(s)")
    print()

    winner = Blockchain.resolve_conflict(short_chain.chain, honest_chain.chain)
    print(f"\n  Winning chain length   : {len(winner)} block(s)")

    # ── 7. Summary ────────────────────────────────────────────────
    print(f"\n{DIVIDER}")
    print("  DEMO COMPLETE — Summary")
    print("=" * 64)
    print(f"  Difficulty target      : {'0' * Blockchain.DIFFICULTY}... ({Blockchain.DIFFICULTY} leading zeros)")
    print(f"  Genesis nonce          : {bc.chain[0].nonce:,}")
    print(f"  Block #1 nonce         : {bc.chain[1].nonce:,}")
    print(f"  Block #2 nonce         : {bc.chain[2].nonce:,}")
    print(f"  Block #3 nonce         : {bc.chain[3].nonce:,}")
    print(f"  Block #4 nonce         : {bc.chain[4].nonce:,}")
    print(f"  Total blocks mined     : {len(bc.chain)}")
    print(f"  Tamper detected        : YES — is_valid() returned False")
    print(f"  Consensus outcome      : Longest valid chain accepted")
    print("=" * 64 + "\n")
