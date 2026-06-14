# DECISIONS.md — Decision Log

---

## Decision 1: Database — SQLite over PostgreSQL/MySQL

**Options considered:**
1. PostgreSQL (hosted on Render/Railway)
2. MySQL (local server)
3. SQLite (file-based, embedded)

**Decision:** SQLite.

**Rationale:**
- The evaluator requirement says "relational DBs only" — SQLite is a fully relational, ACID-compliant SQL database.
- Zero-configuration: no server setup, no connection strings, works on first `npm start`. This is critical for a 2-day deadline.
- The entire schema is in a single `expenses.db` file that can be committed/inspected alongside code.
- All SQL is written as explicit raw queries (no ORM), making it easy for any interviewer to `point at a line and ask why it exists`.

---

## Decision 2: No ORM — Raw SQL Queries

**Options considered:**
1. Sequelize / Drizzle ORM
2. Raw `sqlite3` queries

**Decision:** Raw `sqlite3` queries wrapped in a `query.run / query.all / query.get` promise helper.

**Rationale:**
- The assignment specifically warns: "We will walk through your balance calculation by hand for one member."
- ORMs abstract away the JOIN logic which would make it harder to trace individual computations.
- Every SQL statement in `backend/db/database.js` and `backend/index.js` maps 1:1 to a relational operation you can trace in the schema diagram in SCOPE.md.

---

## Decision 3: Negative Amounts are Refunds, not Errors

**Options considered:**
1. Reject rows with negative amounts as invalid.
2. Treat negative amounts as refunds that reduce the group's shared liability.

**Decision:** Treat as refunds (Option 2).

**Rationale:**
- Row 26: `Parasailing refund (-30 USD)` — the note says "one slot got cancelled." This is clearly a refund, not a data error.
- Reversing the sign of a shared expense is the correct accounting treatment (a negative shared expense reduces each member's owed share).
- We flag it in the wizard with type `NEGATIVE_AMOUNT` so the user sees it explicitly, but the default action is to import it.

---

## Decision 4: Settlements Are Imported as Payments, Not Expenses

**Options considered:**
1. Import settlements as zero-net expenses.
2. Import them into the separate `payments` table.

**Decision:** Separate `payments` table (Option 2).

**Rationale:**
- A settlement is not an expense — it doesn't represent shared spending. Mixing them into the `expenses` table would corrupt the `totalPaid` / `totalShare` calculation.
- Rows 14 (`Rohan paid Aisha back`) and 38 (`Sam deposit share`) are detected by: (a) notes containing keywords "settlement" or "deposit", and (b) having only one person in `split_with`.
- Payments affect the balance formula via `totalSettlementsPaid` and `totalSettlementsReceived`.

---

## Decision 5: Meera & Sam Timeline Enforcement

**Options considered:**
1. Silently exclude inactive members from split calculations.
2. Flag the discrepancy in the import wizard and let the user confirm before removing them.

**Decision:** Flag and default to removing (Option 2 with safe defaults).

**Rationale:**
- Sam specifically asked: "Why would March electricity affect my balance?" Silent removal risks being wrong (what if the data was correct?).
- We pre-tick the "Exclude Meera / Exclude Sam" checkboxes with sensible defaults but surface them explicitly so the user (Meera in this case) can choose to override.
- Membership timelines (joined_at, left_at) are stored in the `memberships` table and used both at import-time (for the wizard) and at runtime (for any manual expense added through the UI).

---

## Decision 6: Disputed Thalassa Dinner — Keep Rohan's Entry

**Options considered:**
1. Keep Aisha's entry (₹2400).
2. Keep Rohan's entry (₹2450).
3. Keep both (import both rows).

**Decision:** Default to Rohan's ₹2450, discard Aisha's ₹2400.

**Rationale:**
- Row 25 explicitly has a note: "Aisha also logged this I think hers is wrong." This is a direct human-written hint.
- The user can reverse this in the import wizard (change Aisha's row to "Import Expense" and Rohan's to "Discard").
- Importing both would count this dinner twice, inflating every member's share by the duplicate.

---

## Decision 7: Invalid Percentage Splits — Normalize, Not Reject

**Options considered:**
1. Reject the row entirely (hard error).
2. Silently pick the first N% to fill 100%.
3. Normalize proportionally and flag the anomaly.

**Decision:** Normalize proportionally (Option 3).

**Rationale:**
- Row 15 (Pizza Friday) and Row 32 (Weekend brunch) both have percentages summing to 110%.
- The user note says "percentages might be off" — this is a known ambiguity, not a deliberate violation.
- Proportional normalization (divide each by 1.1) preserves the *intent* of the relative weighting and is the least-damaging correction.
- The user sees this in the wizard and can switch to "Reduce Meera to 10%" as an alternative.

---

## Decision 8: USD Exchange Rate is User-Configurable

**Options considered:**
1. Hard-code a fixed rate (e.g., 83 INR/USD).
2. Fetch live rates from an API.
3. Provide a configurable field in the import wizard.

**Decision:** Configurable field with a sensible default (Option 3).

**Rationale:**
- Priya's complaint: "The sheet pretends a dollar is a rupee. That can't be right."
- Using a live API adds network dependency and latency for what is a one-time historical import.
- The Goa trip was in March 2026 — the user knows the approximate rate at that time. Providing the field gives them control.
- Default is 83.0 INR/USD (approximate rate at the time of trip dates shown in the CSV).

---

## Decision 9: `computeSplits` Rounding Reconciliation

**Rationale:**
When dividing a total like ₹3600 across 4 people, floating point gives ₹900.0 each. But dividing ₹1199 across 4 gives ₹299.75 each. The remainder (₹0.00) may accumulate. Our algorithm assigns any rounding penny to the **payer's own split row**, so that `SUM(expense_splits.share_amount) = expenses.amount_in_inr` is always exactly true. This satisfies Rohan's requirement that numbers can be verified by hand.

---

## Decision 10: Greedy Two-Pointer Debt Simplification

**Rationale:**
The Splitwise-style minimization problem (minimize number of transactions to settle a group) is NP-hard in general. For a group of ≤6 people, the greedy two-pointer approach (sort debtors and creditors, match the largest debtor to the largest creditor) produces an optimal or near-optimal solution and runs in O(n log n). The output directly answers Aisha's request: "Who pays whom, how much, done."
