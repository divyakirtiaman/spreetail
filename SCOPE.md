# SCOPE.md — Anomaly Log & Database Schema

---

## Detected CSV Anomalies (20 found)

Each anomaly in `expenses_export.csv` is documented below with its row number, type, description, and the handling policy chosen.

| # | Row | Description | Anomaly Type | Policy |
|---|-----|-------------|-------------|--------|
| 1 | 5 & 6 | `Dinner at Marina Bites` / `dinner - marina bites` | **Duplicate Expense** — Same date (08-02-2026), same payer (Dev), same amount (3200 INR). | Flag as duplicate. Keep Row 5 (has explanatory notes). Discard Row 6. |
| 2 | 7 | `Electricity Feb` | **Amount Formatting Error** — Amount is `"1,200"` (comma inside quoted string). | Strip quotes and commas. Parse as `1200.00` INR. Auto-resolved (logged in import report). |
| 3 | 9 | `Movie night snacks` | **Payer Name Casing** — Payer is `priya` (lowercase). | Normalize to `Priya` via name map. Auto-resolved. |
| 4 | 10 | `Cylinder refill` | **Decimal Precision** — Amount is `899.995` (3 decimal places). | Round to `900.00` INR using round-half-up. |
| 5 | 11 | `Groceries DMart` | **Name Alias** — Payer is `Priya S`. | Map alias `Priya S` → `Priya`. User can confirm in wizard. |
| 6 | 13 | `House cleaning supplies` | **Missing Payer** — `paid_by` column is empty. | Flag as critical. Import wizard requires user to select payer before import can proceed. |
| 7 | 14 | `Rohan paid Aisha back` | **Settlement Logged as Expense** — No split type; notes say "settlement". | Detect via note keywords + single-member split_with. Import as a Payment/Settlement (Rohan → Aisha, ₹5000). |
| 8 | 15 | `Pizza Friday` | **Invalid Percentages** — Shares sum to 110% (30+30+30+20). | Normalize proportionally so total = 100%. User can override to manual adjustment. |
| 9 | 20 | `Goa villa booking` | **USD Currency** — 540 USD booked on "intl site". | Convert at configurable rate (default 83 INR/USD). Store both USD and INR values. |
| 10 | 21 | `Beach shack lunch` | **USD Currency** — 84 USD. | Same USD conversion policy. |
| 11 | 23 | `Parasailing` | **Guest/Non-Member in Split** — `Dev's friend Kabir` in split list. | Default: Payer (Dev) absorbs Kabir's share. User can toggle to "split 5-ways including Kabir". |
| 12 | 23 | `Parasailing` | **USD Currency** — 150 USD. | Same USD conversion policy. |
| 13 | 24 & 25 | `Dinner at Thalassa` / `Thalassa dinner` | **Disputed Duplicate** — Aisha logged ₹2400, Rohan logged ₹2450 on same night. Note says "Aisha also logged this I think hers is wrong". | Flag as dispute. Default: Keep Rohan's ₹2450 entry. Discard Aisha's ₹2400. User can reverse. |
| 14 | 26 | `Parasailing refund` | **Negative Amount** — Amount is `-30 USD`. | Treat as a refund. Share is negative and reduces each member's balance proportionally. |
| 15 | 27 | `Airport cab` | **Non-standard Date Format** — Date is `Mar-14` (no year). Payer has trailing whitespace `rohan `. | Parse `Mar-14` → `2026-03-14`. Strip whitespace and standardize name to `Rohan`. |
| 16 | 28 | `Groceries DMart` | **Missing Currency** — Currency column is empty. | Auto-default to `INR`. Logged in import report. |
| 17 | 31 | `Dinner order Swiggy` | **Zero Amount** — Amount is `0`. Notes say "counted twice earlier - fixing later". | Flag as zero-amount. Default action: Skip/Discard. |
| 18 | 32 | `Weekend brunch` | **Invalid Percentages** — Shares sum to 110%. | Same normalization policy as Row 15 (Pizza Friday). |
| 19 | 34 | `Deep cleaning service` | **Date Ambiguity** — `04-05-2026` is ambiguous (May 4 vs April 5). | Resolved via split list context: Sam is excluded, aligning with April. Standardize to `05-04-2026`. |
| 20 | 36 | `Groceries BigBasket` | **Inactive Member in Split** — April 2, 2026 expense includes Meera who moved out March 31. | Automatically remove Meera from split list. Redistribute equally among Aisha, Rohan, Priya. Pre-checked in wizard. |
| 21 | 38 | `Sam deposit share` | **Settlement Logged as Expense** — Sam pays Aisha 15000 INR as a deposit. | Detect via note ("Sam moving in! paid Aisha his deposit"). Import as Payment/Settlement. |
| 22 | 40 | `Electricity Apr` | **Pre-Membership Split** — April 12 expense includes Sam who joined April 15. | Automatically remove Sam from split. Redistribute among Aisha, Rohan, Priya. Pre-checked in wizard. |
| 23 | 42 | `Furniture for common room` | **split_type Mismatch** — Type is `equal` but split_details provide weights `1;1;1;1`. | Validate: all weights equal → proceed as equal split. No change needed; logged in report. |

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT UNIQUE NOT NULL | |
| email | TEXT UNIQUE | |
| password_hash | TEXT NOT NULL | bcryptjs hash |
| created_at | DATETIME | |

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| description | TEXT | |
| created_at | DATETIME | |

### `memberships`
| Column | Type | Notes |
|--------|------|-------|
| group_id | INTEGER FK → groups.id | |
| user_id | INTEGER FK → users.id | |
| joined_at | TEXT | Format: `YYYY-MM-DD` |
| left_at | TEXT | NULL = currently active |

**Timeline rules enforced at import:**
- Meera: `2026-02-01` → `2026-03-31`
- Sam: `2026-04-15` → present
- Aisha, Rohan, Priya, Dev: `2026-02-01` → present

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| group_id | INTEGER FK | Always 1 for the shared flat group |
| description | TEXT | |
| paid_by_id | INTEGER FK → users.id | |
| amount | REAL | Original amount in original currency |
| currency | TEXT | `INR` or `USD` |
| exchange_rate | REAL | 1.0 for INR; configurable for USD |
| amount_in_inr | REAL | `amount * exchange_rate` |
| split_type | TEXT | `equal`, `unequal`, `percentage`, `share` |
| date | TEXT | Format: `YYYY-MM-DD` |
| notes | TEXT | |
| created_at | DATETIME | |

### `expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| expense_id | INTEGER FK → expenses.id | Cascade delete |
| user_id | INTEGER FK → users.id | |
| share_amount | REAL | Calculated individual share in INR |
| percentage | REAL | Only for `percentage` split type |
| share_points | REAL | Only for `share` (weight) split type |

### `payments`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| group_id | INTEGER FK | |
| paid_by_id | INTEGER FK → users.id | Who paid |
| received_by_id | INTEGER FK → users.id | Who received |
| amount | REAL | In INR |
| date | TEXT | |
| notes | TEXT | |
| created_at | DATETIME | |

---

## Balance Calculation

**Net Balance Formula per member:**

```
netBalance = (totalPaid + totalSettlementsPaid) - (totalShare + totalSettlementsReceived)
```

- Positive `netBalance` = member is **owed** money by the group
- Negative `netBalance` = member **owes** money to the group

**Rounding Reconciliation:** After computing each member's share, any rounding remainder (from dividing non-divisible amounts) is assigned to the payer's own share row, ensuring `SUM(splits.share_amount) == expense.amount_in_inr` exactly.

**Debt Simplification Algorithm:** A greedy two-pointer approach sorts debtors (negative balance) and creditors (positive balance) and creates the minimum number of payment transactions.
