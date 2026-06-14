# AI_USAGE.md — AI Tool Usage Log

---

## AI Tool Used

**Antigravity** — Powered by Google DeepMind. Used as the primary development collaborator throughout this project.

**Role:** Antigravity was used to accelerate implementation (writing boilerplate, generating SQL schema, scaffolding React components), but every decision, data policy, and line of code was reviewed, understood, and approved by the developer.

---

## Key Prompts

### Prompt 1: CSV Analysis Strategy
> "Analyze the contents of expenses_export.csv and identify all data problems systematically. For each issue, describe what type of anomaly it is, which row it affects, and what handling policy I should implement."

**Output used:** The initial anomaly table in the implementation plan (20 anomalies catalogued with severity and proposed resolution).

---

### Prompt 2: Balance Engine Architecture
> "Write a balance calculation function that takes a list of expenses with splits and a list of payments, and returns a per-member ledger showing totalPaid, totalShare, settlements, and netBalance. Also write a greedy debt simplification function that minimizes the number of payment transactions."

**Output used:** `backend/utils/balanceEngine.js` — reviewed to ensure the formula `(paid + settledPaid) - (share + settledReceived)` was correct.

---

### Prompt 3: CSV Parser Anomaly Detection
> "Write a JavaScript CSV parser that detects the following anomalies: duplicate rows, settlement-logged-as-expense, missing payer, invalid percentages, non-standard date formats, inactive member in split list, USD transactions, negative amounts, zero amounts. Return a structured list of detected anomalies per row with proposed resolutions."

**Output used:** `backend/utils/csvParser.js` — required several manual corrections (see below).

---

### Prompt 4: Interactive Import Wizard UI
> "Build a React component for an interactive CSV import wizard. It should display each row from the CSV with detected anomalies, provide a per-row action selector (import/skip/import-as-settlement), show interactive controls for each anomaly type (missing payer dropdown, inactive member toggle, percentage fix selector), and a Confirm button that triggers the final ingestion."

**Output used:** The `view === 'import'` section of `App.jsx`.

---

## Cases Where AI Produced Something Wrong

### Case 1: Incorrect Balance Formula

**What the AI produced:**
```javascript
m.netBalance = m.totalPaid - m.totalShare;
```
This formula ignored settlements entirely.

**How I caught it:**
When tracing through a scenario where Rohan had already paid Aisha back ₹5000, his balance was still showing as very negative. Manually computing: Rohan paid ₹1500 (cake), settled ₹5000 to Aisha. His share is ₹12205. His net should account for the ₹5000 settlement.

**What I changed:**
```javascript
m.netBalance = roundToTwo(
  (m.totalPaid + m.totalSettlementsPaid) - (m.totalShare + m.totalSettlementsReceived)
);
```
Settlements are both deducted from the payer and added to the receiver, affecting net balance correctly on both sides.

---

### Case 2: Duplicate Detection Was Too Aggressive

**What the AI produced:**
The initial CSV parser flagged any two rows with the same `description` on the same date as duplicates, regardless of payer.

**How I caught it:**
Row 24 (`Dinner at Thalassa`, Aisha, ₹2400) and Row 25 (`Thalassa dinner`, Rohan, ₹2450) were being flagged as duplicates of *each other* AND as duplicates of Row 5 (`Dinner at Marina Bites`) because both contained the word "dinner". The regex was too broad.

**What I changed:**
Tightened the similarity check to require both rows to share the same payer name OR to have very similar descriptions *and* be explicitly in the `seenTransactions` map. Introduced separate `DISPUTED_DUPLICATE` vs `DUPLICATE_EXPENSE` anomaly types with different defaults. Only truly identical rows (same date + same amount + same payer + very similar description) get the `DUPLICATE_EXPENSE` type with a default "skip" action.

---

### Case 3: `roundToTwo` Used in Frontend Without Import

**What the AI produced:**
The AI generated `App.jsx` that used `roundToTwo(exp.amount_in_inr)` in the JSX template — a function that only exists in `backend/utils/balanceEngine.js`.

**How I caught it:**
The browser console showed: `Uncaught ReferenceError: roundToTwo is not defined` at `App.jsx:583`.

**What I changed:**
Added a local duplicate of the helper at the top of `App.jsx`:
```javascript
const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
```
This is a frontend-only copy. The backend version remains canonical; the frontend only uses it for display formatting.

---

## Summary of AI Effectiveness

| Area | Rating | Notes |
|------|--------|-------|
| Boilerplate & scaffolding | ⭐⭐⭐⭐⭐ | Express routes, React state, SQLite schema setup — very accurate. |
| Balance math | ⭐⭐⭐ | Core formula correct but missed settlements on first attempt. |
| CSV anomaly logic | ⭐⭐⭐ | Good coverage but duplicate detection needed manual tuning. |
| UI design | ⭐⭐⭐⭐ | Dark glassmorphic theme and component structure were solid. |
| Domain understanding | ⭐⭐ | AI didn't independently reason about membership timelines or settlement vs expense distinction — those were directed by the developer. |

**Bottom line:** AI was a fast executor but a weak domain reasoner. Every policy decision (who owes what, what counts as a settlement, how timelines work) required developer judgment and explicit direction.
