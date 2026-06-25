# GridPool Internode Protocol Specification

Status: Draft

Version: 0.2

Last updated: June 24, 2026

This document specifies the GridPool internode protocol at a draft level. It
describes the state machine, consensus rules, share proof validation, and peer
communication needed for independent GridPool node implementations to
interoperate with the first reference implementation.

This is not yet a frozen standard. Field names, encodings, and transport details
may change as the beta network matures. Implementers should treat the consensus
rules as the important part, and the current HTTP/WebSocket/UDP APIs as the
first reference wire format.

## 1. Scope

This specification covers:

- GridPool peer-to-peer state synchronization.
- Share proof relay between GridPool nodes.
- Consensus rules for ranking shares into the unpaid Work Set reserve.
- Consensus rules for Bitcoin-block payout snapshots and GridPool-block payment transitions.
- State identifiers, duplicate handling, and payout attribution.
- Transport-independent validation requirements.
- Reference HTTP, encrypted session, and UDP fast-relay transports.

This specification does not cover:

- DATUM, Stratum V1, Stratum V2, Hydrapool, or any other miner-facing protocol.
- ASIC work generation.
- Bitcoin Core RPC configuration.
- User interface behavior.
- Wallet custody, payout accounting outside coinbase transactions, or pool-side
  balances.
- Bitcoin consensus itself.

GridPool is a reward-sharing protocol. A node implementation may expose DATUM,
HTTP, Stratum V2, firmware-direct, or other client interfaces, but those are
client-facing choices. Internode consensus is based on verified Bitcoin-style
proof-of-work share proofs and deterministic payout-list state.

## 2. Goals

GridPool internode consensus is designed to provide:

- Direct coinbase payouts instead of a central pool wallet.
- Local block template sovereignty for miners.
- Trustless verification of submitted shares by peers.
- Payout weighting by proof-of-work rather than by node identity.
- Sybil resistance through work-ranked shares.
- Fast convergence around the strongest active payout snapshot and unpaid Work Set.
- Tolerance of latency-driven race conditions near Bitcoin-block snapshot boundaries.
- Privacy of transaction selection in ordinary share proofs.

## 3. Terminology

Node:

A GridPool participant that validates shares, maintains round state, and relays
state to peers.

Peer:

Another GridPool node reachable through one or more internode transports.

Network:

A GridPool compatibility domain. Mainnet and Testnet4 MUST be separate networks.
Different teams or incompatible parameter sets MUST use different network IDs.

Round:

The interval between GridPool payment events. In protocol V2, ordinary Bitcoin
blocks may create new payout snapshots inside a round without clearing the
unpaid Work Set.

Slot 0:

The first coinbase transaction output. Slot 0 belongs to the miner that actually
finds the Bitcoin block or share. Slot 0 is not part of the shared payout
snapshot.

Winners List:

The active post-slot-0 payout list that honest nodes expect to appear in
candidate block coinbase transactions. In protocol V2, this is the active
payout snapshot built from unpaid work.

On Deck List:

A UI and compatibility term for the highest-ranked unpaid share proofs. In
protocol V2 the authoritative structure is the unpaid Work Set; it is not
blindly cleared at every GridPool block.

Unpaid Work Set:

A bounded reserve of valid, unpaid share proofs ranked by difficulty. The
reference default reserve limit is `sharedWinnerSlotCount * 3`, currently
`299 * 3 = 897` proofs.

Active Payout Snapshot:

The snapshot of the top unpaid work currently used to build GridPool-compatible
block templates. Every new Bitcoin block creates a new active payout snapshot.
This does not remove proofs from the unpaid Work Set.

Paid Snapshot:

The active payout snapshot that was actually paid by a validated GridPool block.
Nodes record the paid snapshot ID and paid proof IDs for lineage and duplicate
payment prevention.

Share Proof:

A compact proof that a miner hashed a block header committing to a coinbase
transaction and a Merkle root. The proof contains enough information for peers
to verify the coinbase, the Merkle root, and the share difficulty without seeing
the full transaction list.

Current State:

The active payout snapshot for the current Bitcoin tip.

Candidate State:

The current unpaid Work Set and its strongest potential payout snapshot.

State Bundle:

A serialized snapshot of a current or candidate Work Set state, including the
state ID, network identifiers, payout list, share proofs when available, and
parent block context.

GridPool Block:

A Bitcoin block whose coinbase transaction pays slot 0 plus the active GridPool
payout snapshot, and whose header hash satisfies the Bitcoin network target. A
GridPool block is the production payment event.

## 4. Network Parameters

Each GridPool network is defined by at least:

- `boot_protocol_version`
- `boot_network_id`
- Bitcoin network, for example `mainnet` or `testnet4`
- shared winner slot count
- Work Set reserve multiplier
- support-fee status and canonical support-fee address
- snapshot and payment transition rules

The reference beta uses:

- protocol version `2`
- `mainnet-beta` for the mainnet public beta network
- `testnet4-beta` for the Testnet4 public beta network
- 299 shared winner slots, producing 300 total conceptual payout slots including
  slot 0
- a default Work Set reserve multiplier of `3`, for 897 retained unpaid proofs
- an optional canonical Grid Labs support slot enabled by default

`boot_network_id` SHOULD encode all parameters that would make two nodes
incompatible. At minimum, mainnet and Testnet4 MUST NOT share the same
`boot_network_id`.

Coinbase tags are non-consensus metadata. A default tag such as `Grid Pool` may
be useful for visibility, but peers MUST NOT reject otherwise valid shares
because a tag is missing, changed, or different.

## 5. Payout Model

Every valid GridPool candidate block template has a coinbase payout structure
with two logical parts:

1. Slot 0, controlled by the share finder or block finder.
2. The active payout snapshot, controlled by GridPool snapshot state.

The reference beta uses 300 conceptual payout slots. Each slot payout value is
`blockSubsidy / 300`, rounded down to whole satoshis. Slot 0 receives the
unassigned coinbase value, which includes one conceptual slot, any subsidy
remainder, and all transaction fees.

If the support fee is enabled, the post-slot-0 output order is:

1. the canonical Grid Labs support output;
2. up to 298 shared proof payouts sorted by proof difficulty.

If the support fee is disabled, the post-slot-0 output order is up to 299 shared
proof payouts sorted by proof difficulty.

The support fee address is canonical. A node MAY enable or disable the canonical
support slot, but MUST NOT replace it with a custom support address and still
claim compatibility with the reference support-fee variant.

If the same script appears multiple times in the payout snapshot, an
implementation MAY compress those entries into one coinbase output with the
summed value, provided the aggregate value by scriptPubKey is equivalent.

Slot 0 attribution is consensus-critical. For every untrusted share, peers MUST
derive the miner payout identity from the decoded slot-0 scriptPubKey inside the
submitted coinbase transaction. Peers MUST NOT trust sender metadata,
usernames, worker names, or peer identities for payout attribution.

Changing slot 0 changes the coinbase transaction, which changes the Merkle root,
which invalidates the submitted block header. This is the core anti-theft
property for relayed share proofs.

## 6. Share Proof Format

A full share proof contains:

- `shareId`: deterministic identifier for duplicate suppression.
- `headerHex`: 80-byte Bitcoin block header, hex encoded.
- `coinbaseHex`: coinbase transaction, hex encoded.
- `merklePath`: ordered list of 32-byte Merkle branch hashes, hex encoded.
- `prevBlockHash`: optional displayed parent block hash.
- `payoutSnapshotId`: optional active snapshot identifier the share was mined
  against.
- `minerAddress`: optional metadata only.
- `username`: optional metadata only.
- `scriptPubKeyHex`: optional decoded slot-0 script metadata.
- `difficulty`: optional sender-reported difficulty metadata.
- `diffString`: optional human-readable difficulty metadata.
- `source`: optional relay-source metadata.
- `timestamp`: optional observation timestamp.

The reference `shareId` is:

```text
sha256(utf8(normalizedHeaderHex + "|" + normalizedCoinbaseHex))
```

where `normalizedHeaderHex` and `normalizedCoinbaseHex` are lowercase,
whitespace-free hex strings.

The first reference implementation also accepts an older legacy share ID:

```text
sha256(utf8(normalizedHeaderHex + "|" + normalizedCoinbaseHex + "|" + slot0Address))
```

New implementations SHOULD produce the non-legacy `shareId`.

## 7. Share Validation

For every share proof from an untrusted source, a node MUST:

1. Parse `headerHex` and reject unless it is exactly 80 bytes.
2. Parse `coinbaseHex` and reject malformed transaction data.
3. Parse each `merklePath` entry as a 32-byte hash.
4. Extract the parent block hash from the submitted header.
5. If `prevBlockHash` is provided, verify that it matches the header parent.
6. Recompute the coinbase transaction hash.
7. Rebuild the Merkle root from the coinbase hash and `merklePath`.
8. Verify that the rebuilt Merkle root equals the header Merkle root.
9. Parse the coinbase outputs.
10. Decode slot 0 into a supported standard payout script and address.
11. Verify that the shared payout outputs match the active payout snapshot, or a
    retained recent snapshot context when `payoutSnapshotId` is present or the
    share was mined shortly before a later Bitcoin-block snapshot.
12. Double-SHA256 the 80-byte block header.
13. Compute actual share difficulty from the header hash.
14. Determine whether the share is a Bitcoin block by comparing the header hash
    to the header target.
15. Recompute `shareId`.
16. Attribute the share to slot 0, not to submitted metadata.

For current reference compatibility, peers should support Merkle branch hashes in
the order used by the reference implementation. If a branch-order ambiguity is
encountered, an implementation MAY try the byte-reversed branch variant before
rejecting, but the resulting proof MUST still match the header Merkle root.

An implementation MUST reject a share if:

- the header is malformed;
- the coinbase is malformed;
- the Merkle root does not match;
- slot 0 cannot be decoded as a supported payout script;
- the shared payout outputs do not match the expected active or retained payout
  snapshot;
- the computed difficulty is below the implementation's minimum useful floor;
- the share is a duplicate of a previously seen share ID.

Duplicate shares MUST NOT create additional Work Set entries or payout slots. A
duplicate MAY be reported as `duplicate` rather than `rejected`, but it has no
consensus effect.

## 8. Transaction Privacy

The normal share proof includes the coinbase transaction and the coinbase Merkle
branch. It does not include the full transaction list.

Therefore, ordinary GridPool internode relay lets peers verify:

- the header hash;
- the coinbase commitment;
- the slot-0 payout;
- the shared payout outputs;
- the Merkle root commitment;
- the share difficulty.

It does not normally reveal which non-coinbase transactions the miner included.
A Merkle root by itself does not prove inclusion of a specific non-coinbase
transaction. A txid plus a Merkle branch can prove inclusion, but that is outside
the normal GridPool share proof.

## 9. Unpaid Work Set and Snapshot Rules

Each node maintains a bounded unpaid Work Set of share proofs. The default
reserve limit is:

```text
work_set_reserve_limit = shared_winner_slot_count * 3
```

With the reference public beta parameters, this is `299 * 3 = 897` proofs.

A valid share may enter the unpaid Work Set if:

- it validates against the active payout snapshot or a retained snapshot context;
- it builds on an accepted parent block for the current tip, or it is accepted
  under an implementation's fresh-parent policy;
- it has a unique share ID;
- it ranks within the reserve limit.

The deterministic ranking order is:

1. Higher computed difficulty first.
2. Lexicographically smaller `shareId` first as the tie-breaker.

Every ordinary Bitcoin block creates a new active payout snapshot from the top
unpaid proofs. This snapshot operation MUST NOT remove proofs from the unpaid
Work Set.

When a validated GridPool block pays the active snapshot, nodes remove only the
proof IDs that were actually paid by that snapshot. Unpaid reserve proofs remain
eligible for later snapshots. This paid-once lineage is the core V2 replacement
for destructive On Deck clearing.

Each paid proof contributes one shared payout slot attributed to its slot-0
address. Multiple slots may belong to the same address if that address produced
multiple ranked shares.

A node MAY accept or record valid lower-difficulty shares for diagnostics or
local hashrate estimation, but such shares do not affect the unpaid Work Set and
SHOULD NOT be relayed to peers unless they can enter the unpaid Work Set.

## 10. Candidate Work Set State ID

The reference candidate state ID is:

```text
sha256(utf8(
  "boot-protocol-candidate-state\n" +
  boot_protocol_version + "\n" +
  boot_network_id + "\n" +
  current_state_id + "\n" +
  ranked_share_lines
))
```

Each ranked share line is:

```text
index + "|" + slot0ScriptPubKeyHex + "|" + canonicalDifficulty + "|" + shareId + "\n"
```

Shares are ordered by the Work Set ranking rules. `index` starts at `0`.

The first reference implementation uses the C# round-trip floating point string
for `canonicalDifficulty`. This is acceptable for the beta reference network,
but future versions SHOULD replace floating-point difficulty with an integer
work/target representation to make cross-language implementations less fragile.

## 11. Active Snapshot State ID

When an active payout snapshot is created from unpaid work, the reference state
ID is:

```text
sha256(utf8(
  "boot-protocol-state\n" +
  boot_protocol_version + "\n" +
  boot_network_id + "\n" +
  locked_block_hash + "\n" +
  ranked_share_lines
))
```

The ranked share line format is identical to the candidate state ID format.

`locked_block_hash` is the normalized hash of the Bitcoin block that caused the
snapshot. The genesis state uses an empty locked block hash.

## 12. Snapshot and Payment Transitions

Round 0 is the genesis round. Its initial payout list is a network parameter,
but protocol V2 no longer depends on a donation-only genesis payout to launch
fairly. Once shares enter the unpaid Work Set, ordinary Bitcoin blocks create
active snapshots from those proofs.

On every new Bitcoin chain tip:

1. The node validates or accepts the chain-tip notification according to its
   Bitcoin-parent policy.
2. The node ranks the unpaid Work Set.
3. The top unpaid proofs are converted into a new active payout snapshot.
4. The current state ID becomes the active snapshot ID.
5. The current round/tip metadata is advanced.
6. The unpaid Work Set is preserved.
7. Miners are instructed to refresh work against the new active snapshot.

This Bitcoin-block snapshot transition does not by itself prove that GridPool
was paid. A node MUST NOT process a payment transition from a bare chain-tip
notification alone.

A payment transition requires a validated GridPool block proof from a DATUM
client, HTTP/API submitter, or peer relay. A valid GridPool block:

- satisfies Bitcoin proof-of-work for the block target;
- commits to a coinbase transaction with slot 0 plus the active payout snapshot;
- has a valid Merkle root proof for the submitted coinbase.

When a valid GridPool block proof is accepted:

1. The block proof itself is inserted into the unpaid Work Set if it is not a
   duplicate and it ranks high enough.
2. The active payout snapshot is recorded as the paid snapshot.
3. Only the paid snapshot proof IDs are removed from the unpaid Work Set.
4. Parent-block context is advanced to the found block.
5. A new active payout snapshot is built from the remaining unpaid reserve.
6. State bundles retain paid snapshot metadata for peer convergence.

Deterministic test triggers MAY be used on private test networks, but production
networks SHOULD process payments only on real validated GridPool block proofs.

## 13. Parent Block Handling

Nodes need a notion of accepted parent block hashes for the current round. Near a
Bitcoin tip change, honest nodes can temporarily disagree about the freshest
parent block.

A node SHOULD accept a share that builds on a known accepted parent block.

A node MAY accept an otherwise valid share on an unknown fresh parent if the
source is locally trusted or if the implementation has an authenticated peer
mechanism for learning fresh headers. If a node accepts such a share, it SHOULD
record the fresh parent and converge its accepted parent set.

A node SHOULD reject stale old-template shares that pay the wrong active
snapshot, but SHOULD distinguish this from malicious behavior. Short
payout-mismatch windows are expected immediately after Bitcoin-block snapshots
or GridPool payment transitions because miners may still have old work queued.

## 14. State Bundle Format

A state bundle contains:

- `stateId`
- `previousStateId`
- `kind`, for example `current`, `candidate`, or implementation-specific
  rotation source
- `currentRoundNumber`
- `protocolVersion`
- `networkId`
- `lockedByBlockHash`
- `lockedByBlockHeight`
- `parentBlockHash`
- `parentBlockHeight`
- `createdAtUtc`
- `totalDifficulty`
- `activeSnapshotId`
- `paidSnapshotId`
- `activeSnapshotProofIds`
- `paidSnapshotProofIds`
- `supportFeeEnabled`
- `payoutVariant`
- `validParentBlockHashes`
- `winnersList`
- `proofWinnersList`
- `shareProofs`
- `workSetProofs`
- `snapshotContexts`
- optional commitment metadata

For a candidate bundle:

- `winnersList` is the payout snapshot being proposed from the Work Set.
- `proofWinnersList` is the active snapshot used to validate the proofs.
- `shareProofs` contains the ranked proofs backing `winnersList`.
- `workSetProofs` may contain the broader unpaid reserve.

For an active-snapshot state bundle:

- `winnersList` is the active payout snapshot.
- `shareProofs` SHOULD contain the paid or active snapshot proofs when available.
- `workSetProofs` SHOULD contain unpaid reserve proofs when available.
- `snapshotContexts` SHOULD contain retained contexts needed to validate
  work-set proofs mined against earlier snapshots.
- proofless snapshots MAY be used for bootstrapping, but proof-backed state is
  preferred.

## 15. Importing Candidate Work Set State

When a node receives a candidate Work Set state bundle from a peer, it MUST:

1. Verify `protocolVersion` and `networkId`.
2. Reject if the winner/proof count exceeds the shared winner slot count.
3. Validate each share proof against `proofWinnersList`, the local active
   snapshot, or retained snapshot contexts supplied by the bundle.
4. Rebuild the payout list from the validated proofs.
5. Verify that the rebuilt payout list equals `winnersList`.
6. Recompute the candidate Work Set state ID.
7. Reject if the recomputed state ID differs from `stateId`.

If the bundle is valid and refers to the same active snapshot, a node SHOULD
merge/adopt it when its Work Set contains stronger unpaid proofs than the local
candidate Work Set state.

This rule gives convergence pressure toward the candidate Work Set with the most
observed unpaid work.

## 16. Importing Active Snapshot State

When a node receives an active-snapshot state bundle from a peer, it MUST:

1. Verify `protocolVersion` and `networkId`.
2. Reject impossible winner/proof counts.
3. Validate share proofs and Work Set proofs when present.
4. Rebuild and verify `winnersList` from proofs when present.
5. Recompute the active snapshot state ID using `lockedByBlockHash`.
6. Reject if the recomputed active snapshot state ID differs from `stateId`.
7. Verify that adopting the state does not obviously move the node backward
   relative to its known chain tip and round number.

A node SHOULD adopt a valid peer active snapshot state if:

- the local state is empty or genesis-only;
- the peer round number is greater than the local round number;
- the peer state is proof-backed and the local state is proofless;
- the peer state has greater total snapshot difficulty for the same tip/round; or
- the implementation's deterministic tie-breaker prefers the peer state.

The reference tie-breaker for equal total difficulty is lexicographically larger
state ID.

## 17. Peer Discovery and Compatibility

Nodes announce and gossip reachable peer endpoints. A node without a public
endpoint MAY still participate outbound-only, but it cannot be dialed by peers.

Peers MUST NOT be considered compatible unless:

- `protocolVersion` matches; and
- `networkId` matches.

Peers SHOULD also expose their Bitcoin network for diagnostics, but
implementations should rely on `networkId` to prevent accidental cross-network
sync.

Nodes SHOULD reject or ignore malformed peer endpoints. Public nodes SHOULD NOT
gossip private, LAN, localhost, or placeholder endpoints unless explicitly
configured for a lab network.

Seed peers are bootstrap hints, not authorities. Nodes SHOULD maintain an
address book and connect to a bounded, scored set of peers.

## 18. Reference HTTP Transport

The first reference transport is HTTP JSON.

Peer announcement headers:

```text
X-Boot-Peer-Endpoint: https://node.example
X-Boot-Protocol-Version: 1
X-Boot-Network-Id: mainnet-beta
```

Read endpoints:

```text
GET /api/network/summary
GET /api/network/peer-addresses?limit=128
GET /api/network/state/{stateId}
```

Share relay endpoint:

```text
POST /api/peer/share
```

The HTTP share relay body is:

```json
{
  "senderEndpoint": "https://node.example",
  "protocolVersion": 1,
  "networkId": "mainnet-beta",
  "share": {
    "shareId": "<share id>",
    "minerAddress": "<metadata only>",
    "username": "<metadata only>",
    "scriptPubKeyHex": "<slot-0 script metadata>",
    "headerHex": "<80-byte header hex>",
    "coinbaseHex": "<coinbase transaction hex>",
    "merklePath": ["<32-byte hash hex>"],
    "prevBlockHash": "<parent hash>",
    "difficulty": 12345.0,
    "diffString": "12.3K",
    "source": "peer-http",
    "timestamp": "2026-06-16T00:00:00Z"
  }
}
```

Receiver responses SHOULD distinguish:

- accepted;
- duplicate;
- rejected, with reason.

HTTP is the compatibility fallback. Implementations may add faster transports
without changing consensus behavior.

## 19. Reference Encrypted Session Transport

The reference V2 transport uses WebSocket sessions:

```text
GET /api/peer/session
```

Each session begins with a signed hello containing:

- message type;
- protocol version;
- network ID;
- advertised endpoint;
- node ID;
- X25519 public key;
- nonce;
- timestamp;
- signature.

After hello exchange, peers derive symmetric keys and send encrypted frames with
monotonic sequence numbers. The current reference implementation is
Noise-inspired rather than a complete Noise protocol. Future versions SHOULD
move to a standard Noise pattern or another well-reviewed encrypted transport.

Encrypted sessions are a transport optimization. Shares received over a session
MUST be validated through the same proof path as HTTP shares.

## 20. Reference UDP Fast Relay

The reference V3 transport uses authenticated UDP datagrams as an optimistic
fast path.

Rules:

- UDP relay MUST NOT be unauthenticated.
- UDP relay is used only after an authenticated/encrypted peer session exists.
- Receivers MUST replay-protect datagrams.
- Receivers MUST validate the decrypted share proof normally.
- If a share proof is too large for the configured datagram limit, the sender
  skips UDP and relies on encrypted session or HTTP fallback.

The reference datagram header contains:

- magic bytes `GP3S`;
- datagram version;
- truncated sender node key;
- per-session sequence.

The encrypted payload is a compact binary full share proof. At mature 300-output
scale, full coinbase proofs may exceed safe single-datagram size. Future compact
share formats may reconstruct common active snapshot outputs locally and transmit
only slot-0 plus variable coinbase fields, but that is not yet a consensus
requirement.

## 21. Security and Abuse Rules

Duplicate suppression:

Nodes MUST remember seen share IDs for the active Work Set, active payout
snapshot, and recent paid snapshots. A duplicate share cannot take multiple
slots.

Sybil resistance:

Nodes MUST NOT allocate payout weight by peer identity, username, IP address, or
account identity. Weight comes from ranked verified work only.

Low-difficulty spam:

Nodes SHOULD advertise the current Work Set admission floor. Peers that continue
to send shares far below the floor after being informed of the floor MAY be
rate-limited or disconnected.

Oversized payloads:

Nodes MUST bound request sizes, coinbase sizes, Merkle path lengths, frame
sizes, and datagram sizes.

Network isolation:

Nodes MUST reject mismatched protocol versions and network IDs. Testnet and
mainnet shares MUST NOT be accepted on the same internode network.

Metadata distrust:

Nodes MUST treat sender endpoint, miner address, username, worker name, reported
difficulty, timestamps, and tags as advisory metadata only.

Censorship detection:

The base protocol does not require peers to reveal full transaction templates.
Nodes can detect peer behavior such as rejecting valid shares, failing to relay
accepted shares, or omitting known valid shares from advertised Work Set state,
but they cannot usually infer arbitrary transaction-policy censorship from a
normal share proof alone.

## 22. Open Draft Items

This draft intentionally leaves several areas open:

- Replace floating-point difficulty in state IDs with integer work or target
  commitments.
- Standardize a compact-share format for mature 300-output UDP fast relay.
- Standardize encrypted peer identity and key rotation.
- Define a robust block/header relay path for fresh parent discovery.
- Define optional peer acceptance matrices for censorship and relay-health
  detection.
- Define canonical serialization independent of the C# reference implementation.
- Decide whether a future on-chain snapshot commitment should be included in
  coinbase metadata.

## 23. Compatibility Guidance

To interoperate with the current reference implementation, an independent node
should implement, in order:

1. HTTP `GET /api/network/summary`.
2. HTTP `GET /api/network/state/{stateId}`.
3. HTTP `POST /api/peer/share`.
4. Share validation exactly as described above.
5. Candidate Work Set state ID and active snapshot state ID compatibility.
6. Address gossip via `GET /api/network/peer-addresses`.
7. Optional encrypted sessions.
8. Optional UDP fast relay.

The safest minimum viable independent implementation is an HTTP-only node that
validates shares, gossips state bundles, and converges on stronger Work Set
states. Faster transports can be added without changing consensus.
