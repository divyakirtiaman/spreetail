# SplitFlat — Shared Expenses App

A full-stack shared expenses application built for flatmates Aisha, Rohan, Priya, Meera, Sam, and Dev. It handles real-world messy data from a spreadsheet export including duplicate entries, multi-currency expenses, membership timelines, and disputed transactions.

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React 19 + Vite (Vanilla CSS, glassmorphic UI)  |
| Backend    | Node.js + Express                               |
| Database   | SQLite (`sqlite3` npm package)                  |
| Auth       | JWT + bcryptjs                                  |
| CSV Upload | Multer (in-memory buffer)                        |

---

## Setup Instructions

### Prerequisites
- Node.js v18+ (project uses v24.11.0)
- npm v9+
- Git

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd TASk
```

### 2. Backend Setup
```bash
cd backend
npm install
npm start
```
The backend starts on **http://localhost:5000**.  
SQLite database (`expenses.db`) is auto-created on first start with all 6 flatmates seeded.

### 3. Frontend Setup (new terminal)
```bash
cd frontend
npm install
npm run dev
```
The frontend starts on **http://localhost:5173**.

### 4. Default Login Credentials
All accounts share the same password for demo purposes:

| Name   | Password     |
|--------|--------------|
| Aisha  | password123  |
| Rohan  | password123  |
| Priya  | password123  |
| Meera  | password123  |
| Sam    | password123  |
| Dev    | password123  |

---

## Features

1. **Login Module** — Select your flatmate identity and sign in.
2. **Dashboard** — View per-person net balances and the simplified debt graph ("Who pays whom, how much, done" — Aisha).
3. **Expense Ledger** — Expand any expense to see exact split calculations per person ("No magic numbers" — Rohan).
4. **Multi-currency Support** — USD amounts are converted to INR with a configurable exchange rate (Priya).
5. **Membership Timelines** — Split lists are automatically filtered for inactive members (Sam/Meera) relative to the expense date (Sam).
6. **Interactive CSV Import Wizard** — Detects all 12+ anomalies, surfaces them per-row with proposed fixes, and requires explicit user approval before ingestion (Meera).
7. **Manual Expense & Settlement Recording** — Full form with support for equal, unequal, percentage, and share-weighted splits.
8. **Import Report** — Generated after every CSV ingestion listing every anomaly and the action taken.

---

## AI Tool Used

**Antigravity (Google DeepMind AI assistant)** was used as the primary development collaborator. See `AI_USAGE.md` for detailed prompts, corrections, and lessons learned.
