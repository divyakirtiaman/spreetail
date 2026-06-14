import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { initDatabase, query } from './db/database.js';
import { analyzeCSV } from './utils/csvParser.js';
import { calculateBalances, simplifyDebts, roundToTwo } from './utils/balanceEngine.js';

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = 'shared-expenses-super-secret-key-123';

app.use(cors());
app.use(express.json());

// Set up file upload storage in memory for parsing CSVs
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for JWT Verification
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Token missing' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Helper: Calculate split shares and resolve rounding remainders
function computeSplits(amount, splitType, splitWith, splitDetails, payerName, guestAbsorption = 'payer') {
  // amount is the converted INR amount
  const totalAmount = amount;
  let splits = [];

  // Parse split details if passed as JSON or object
  let details = {};
  if (typeof splitDetails === 'string' && splitDetails.trim() !== '') {
    // Parse e.g. "Rohan 700; Priya 400"
    const parts = splitDetails.split(';').map(p => p.trim()).filter(Boolean);
    parts.forEach(part => {
      const match = part.match(/^([A-Za-z\s'\-_0-9]+)\s+([\d.]+)(%?)$/);
      if (match) {
        const name = match[1].trim();
        const val = parseFloat(match[2]);
        details[name] = val;
      }
    });
  } else if (typeof splitDetails === 'object') {
    details = splitDetails;
  }

  // Pre-process split list to handle guests/non-members
  const officialSplitWith = [];
  const guestSplitWith = [];
  const OFFICIAL_MEMBERS = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev'];

  splitWith.forEach(name => {
    if (OFFICIAL_MEMBERS.includes(name)) {
      officialSplitWith.push(name);
    } else {
      guestSplitWith.push(name);
    }
  });

  const totalSplitCount = splitWith.length;
  if (totalSplitCount === 0) return [];

  // If equal split
  if (splitType === 'equal') {
    const rawShare = totalAmount / totalSplitCount;
    const share = roundToTwo(rawShare);
    
    // Add shares for official members
    officialSplitWith.forEach(name => {
      splits.push({ user_name: name, share_amount: share });
    });

    // Handle guest shares
    guestSplitWith.forEach(guestName => {
      if (guestAbsorption === 'payer') {
        // Payer absorbs guest share
        const existing = splits.find(s => s.user_name === payerName);
        if (existing) {
          existing.share_amount = roundToTwo(existing.share_amount + share);
        } else {
          // If payer is not in split, they pay the guest share
          splits.push({ user_name: payerName, share_amount: share });
        }
      } else {
        // Split with guest directly (guest owes Dev/group)
        splits.push({ user_name: guestName, share_amount: share });
      }
    });

    // Reconcile rounding remainder
    const sum = splits.reduce((acc, s) => acc + s.share_amount, 0);
    const remainder = roundToTwo(totalAmount - sum);
    if (Math.abs(remainder) > 0.001 && splits.length > 0) {
      // Assign remainder to the first official member or payer
      const target = splits.find(s => s.user_name === payerName) || splits[0];
      target.share_amount = roundToTwo(target.share_amount + remainder);
    }
  }
  // If percentage split
  else if (splitType === 'percentage') {
    let totalPct = 0;
    // Standardize keys in details
    const cleanDetails = {};
    Object.keys(details).forEach(k => {
      const match = OFFICIAL_MEMBERS.find(m => m.toLowerCase() === k.toLowerCase()) || k;
      cleanDetails[match] = details[k];
      totalPct += details[k];
    });

    let sum = 0;
    Object.keys(cleanDetails).forEach(name => {
      const pctVal = cleanDetails[name];
      const pctFraction = pctVal / (totalPct || 100);
      const share = roundToTwo(totalAmount * pctFraction);
      splits.push({ user_name: name, share_amount: share, percentage: pctVal });
      sum += share;
    });

    // Reconcile
    const remainder = roundToTwo(totalAmount - sum);
    if (Math.abs(remainder) > 0.001 && splits.length > 0) {
      const target = splits.find(s => s.user_name === payerName) || splits[0];
      target.share_amount = roundToTwo(target.share_amount + remainder);
    }
  }
  // If share split
  else if (splitType === 'share') {
    let totalShares = 0;
    const cleanDetails = {};
    Object.keys(details).forEach(k => {
      const match = OFFICIAL_MEMBERS.find(m => m.toLowerCase() === k.toLowerCase()) || k;
      cleanDetails[match] = details[k];
      totalShares += details[k];
    });

    let sum = 0;
    Object.keys(cleanDetails).forEach(name => {
      const shareVal = cleanDetails[name];
      const shareFraction = shareVal / (totalShares || 1);
      const share = roundToTwo(totalAmount * shareFraction);
      splits.push({ user_name: name, share_amount: share, share_points: shareVal });
      sum += share;
    });

    // Reconcile
    const remainder = roundToTwo(totalAmount - sum);
    if (Math.abs(remainder) > 0.001 && splits.length > 0) {
      const target = splits.find(s => s.user_name === payerName) || splits[0];
      target.share_amount = roundToTwo(target.share_amount + remainder);
    }
  }
  // If unequal split
  else if (splitType === 'unequal') {
    const cleanDetails = {};
    let sum = 0;
    Object.keys(details).forEach(k => {
      const match = OFFICIAL_MEMBERS.find(m => m.toLowerCase() === k.toLowerCase()) || k;
      const shareAmt = roundToTwo(details[k]);
      cleanDetails[match] = shareAmt;
      splits.push({ user_name: match, share_amount: shareAmt });
      sum += shareAmt;
    });

    // Reconcile
    const remainder = roundToTwo(totalAmount - sum);
    if (Math.abs(remainder) > 0.001 && splits.length > 0) {
      const target = splits.find(s => s.user_name === payerName) || splits[0];
      target.share_amount = roundToTwo(target.share_amount + remainder);
    }
  }

  return splits;
}

// --- AUTHENTICATION ENDPOINTS ---

// Get all users
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await query.all('SELECT id, name, email FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE name = ?', [name]);
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MAIN EXPENSE & LEDGER ENDPOINTS ---

// Get all expenses
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expenses = await query.all(`
      SELECT e.*, u.name as paid_by
      FROM expenses e
      JOIN users u ON e.paid_by_id = u.id
      ORDER BY e.date DESC, e.id DESC
    `);
    
    // Add splits for each expense
    for (const exp of expenses) {
      const splits = await query.all(`
        SELECT s.*, u.name as user_name
        FROM expense_splits s
        JOIN users u ON s.user_id = u.id
        WHERE s.expense_id = ?
      `, [exp.id]);
      exp.splits = splits;
    }
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Manual Expense
app.post('/api/expenses', authenticateToken, async (req, res) => {
  const { description, paid_by, amount, currency, exchange_rate, split_type, date, split_with, split_details, notes } = req.body;
  
  if (!description || !paid_by || !amount || !split_type || !date || !split_with) {
    return res.status(400).json({ error: 'Missing required expense fields' });
  }

  try {
    const payer = await query.get('SELECT id FROM users WHERE name = ?', [paid_by]);
    if (!payer) return res.status(400).json({ error: `Payer "${paid_by}" does not exist` });

    const rate = currency === 'USD' ? (exchange_rate || 83.0) : 1.0;
    const amountInr = amount * rate;

    // Insert expense
    const expResult = await query.run(`
      INSERT INTO expenses (group_id, description, paid_by_id, amount, currency, exchange_rate, amount_in_inr, split_type, date, notes)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [description, payer.id, amount, currency, rate, amountInr, split_type, date, notes || '']);

    const expenseId = expResult.id;

    // Calculate splits
    const splits = computeSplits(amountInr, split_type, split_with, split_details, paid_by);

    // Insert splits
    for (const split of splits) {
      const splitUser = await query.get('SELECT id FROM users WHERE name = ?', [split.user_name]);
      if (splitUser) {
        await query.run(`
          INSERT INTO expense_splits (expense_id, user_id, share_amount, percentage, share_points)
          VALUES (?, ?, ?, ?, ?)
        `, [expenseId, splitUser.id, split.share_amount, split.percentage || null, split.share_points || null]);
      }
    }

    res.status(201).json({ message: 'Expense created successfully', id: expenseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    await query.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all payments (settlements)
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const payments = await query.all(`
      SELECT p.*, u1.name as paid_by, u2.name as received_by
      FROM payments p
      JOIN users u1 ON p.paid_by_id = u1.id
      JOIN users u2 ON p.received_by_id = u2.id
      ORDER BY p.date DESC, p.id DESC
    `);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create manual payment
app.post('/api/payments', authenticateToken, async (req, res) => {
  const { paid_by, received_by, amount, date, notes } = req.body;
  if (!paid_by || !received_by || !amount || !date) {
    return res.status(400).json({ error: 'Missing required settlement fields' });
  }

  try {
    const payer = await query.get('SELECT id FROM users WHERE name = ?', [paid_by]);
    const receiver = await query.get('SELECT id FROM users WHERE name = ?', [received_by]);

    if (!payer || !receiver) {
      return res.status(400).json({ error: 'Payer or receiver does not exist' });
    }

    const payResult = await query.run(`
      INSERT INTO payments (group_id, paid_by_id, received_by_id, amount, date, notes)
      VALUES (1, ?, ?, ?, ?, ?)
    `, [payer.id, receiver.id, amount, date, notes || '']);

    res.status(201).json({ message: 'Settlement recorded successfully', id: payResult.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete payment
app.delete('/api/payments/:id', authenticateToken, async (req, res) => {
  try {
    await query.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get balances & debt simplification
app.get('/api/balances', authenticateToken, async (req, res) => {
  try {
    // 1. Fetch group members
    const membersRows = await query.all(`
      SELECT u.name
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = 1
    `);
    const members = membersRows.map(m => m.name);

    // 2. Fetch expenses and their splits
    const expenses = await query.all(`
      SELECT e.*, u.name as paid_by
      FROM expenses e
      JOIN users u ON e.paid_by_id = u.id
    `);
    for (const exp of expenses) {
      const splits = await query.all(`
        SELECT s.*, u.name as user_name
        FROM expense_splits s
        JOIN users u ON s.user_id = u.id
        WHERE s.expense_id = ?
      `, [exp.id]);
      exp.splits = splits;
    }

    // 3. Fetch payments
    const payments = await query.all(`
      SELECT p.*, u1.name as paid_by, u2.name as received_by
      FROM payments p
      JOIN users u1 ON p.paid_by_id = u1.id
      JOIN users u2 ON p.received_by_id = u2.id
    `);

    // 4. Calculate
    const ledger = calculateBalances(members, expenses, payments);
    const transactions = simplifyDebts(ledger);

    res.json({ ledger, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- IMPORT CSV ENDPOINTS ---

// Dry-run Analyze
app.post('/api/import/analyze', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
  
  const csvText = req.file.buffer.toString('utf-8');
  const rate = parseFloat(req.body.exchangeRate) || 83.0;

  try {
    const analysis = analyzeCSV(csvText, rate);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute CSV Import (Save approved rows with custom overrides)
app.post('/api/import/confirm', authenticateToken, async (req, res) => {
  const { rows, guestAbsorption, usdRate } = req.body;
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Invalid or missing import rows' });
  }

  const importReport = [];
  const exchangeRate = usdRate || 83.0;

  try {
    // Wrap database operations in a manual transaction
    await query.exec('BEGIN TRANSACTION');

    for (const item of rows) {
      const rowNum = item.rowNumber;
      const { raw, fixes, action, chosenAction, customPayer } = item;

      // Skip action
      if (action === 'skip') {
        importReport.push({
          rowNumber: rowNum,
          description: raw.description,
          action: 'DISCARDED',
          notes: 'Flagged as duplicate/disputed or manually skipped.'
        });
        continue;
      }

      // 1. Resolve Payer
      let finalPayer = fixes.paid_by || raw.paid_by;
      if (customPayer) {
        finalPayer = customPayer;
      }
      if (!finalPayer || finalPayer.trim() === '') {
        // Payer remains unassigned, skip this row or reject
        await query.exec('ROLLBACK');
        return res.status(400).json({
          error: `Row ${rowNum} ("${raw.description}"): Payer could not be resolved. Please assign a payer.`
        });
      }

      const payerObj = await query.get('SELECT id FROM users WHERE name = ?', [finalPayer]);
      if (!payerObj) {
        await query.exec('ROLLBACK');
        return res.status(400).json({
          error: `Row ${rowNum} ("${raw.description}"): Payer "${finalPayer}" does not exist in users database.`
        });
      }

      // 2. Resolve Amount & Currency
      let finalAmt = fixes.amount;
      let finalCurrency = fixes.currency;
      let finalRate = finalCurrency === 'USD' ? exchangeRate : 1.0;
      let finalAmtInr = finalAmt * finalRate;

      // 3. Resolve split list & inactive members
      let finalSplitWith = [...fixes.split_with];

      // Meera and Sam inactive filters
      if (fixes.removeMeera || chosenAction === 'removeMeera') {
        finalSplitWith = finalSplitWith.filter(name => name !== 'Meera');
      }
      if (fixes.removeSam || chosenAction === 'removeSam') {
        finalSplitWith = finalSplitWith.filter(name => name !== 'Sam');
      }

      // 4. Check if payment/settlement
      if (fixes.split_type === 'settlement' || action === 'import_as_settlement') {
        // It's a settlement. The receiver is the sole split_with member
        const receiverName = finalSplitWith[0];
        if (!receiverName) {
          await query.exec('ROLLBACK');
          return res.status(400).json({
            error: `Row ${rowNum} ("${raw.description}"): Settlement requires exactly one recipient.`
          });
        }
        
        const receiverObj = await query.get('SELECT id FROM users WHERE name = ?', [receiverName]);
        if (!receiverObj) {
          await query.exec('ROLLBACK');
          return res.status(400).json({
            error: `Row ${rowNum} ("${raw.description}"): Receiver "${receiverName}" not found.`
          });
        }

        await query.run(`
          INSERT INTO payments (group_id, paid_by_id, received_by_id, amount, date, notes)
          VALUES (1, ?, ?, ?, ?, ?)
        `, [payerObj.id, receiverObj.id, finalAmtInr, fixes.date, raw.notes || '']);

        importReport.push({
          rowNumber: rowNum,
          description: raw.description,
          action: 'IMPORTED_AS_SETTLEMENT',
          notes: `Recorded payment: ${finalPayer} paid ${receiverName} ₹${finalAmtInr}`
        });
        continue;
      }

      // 5. standard Split details override
      let finalSplitDetails = {};
      if (fixes.split_type === 'percentage') {
        finalSplitDetails = fixes.parsedPercentages || {};
      } else if (fixes.split_type === 'share') {
        finalSplitDetails = fixes.parsedShares || {};
      } else if (fixes.split_type === 'unequal') {
        finalSplitDetails = fixes.parsedUnequalAmounts || {};
      }

      // If split details sum issue resolved
      if (chosenAction === 'normalize') {
        // Calculated details normalized
      } else if (chosenAction === 'adjustMeera') {
        // Adjust Meera percentage to 10%
        if (finalSplitDetails['Meera'] !== undefined) {
          finalSplitDetails['Meera'] = 10;
        }
      }

      // Insert Expense
      const expResult = await query.run(`
        INSERT INTO expenses (group_id, description, paid_by_id, amount, currency, exchange_rate, amount_in_inr, split_type, date, notes)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [raw.description, payerObj.id, finalAmt, finalCurrency, finalRate, finalAmtInr, fixes.split_type, fixes.date, raw.notes || '']);

      const expId = expResult.id;

      // Compute individual shares
      const splits = computeSplits(
        finalAmtInr,
        fixes.split_type,
        finalSplitWith,
        finalSplitDetails,
        finalPayer,
        guestAbsorption
      );

      // Insert Splits
      for (const s of splits) {
        const u = await query.get('SELECT id FROM users WHERE name = ?', [s.user_name]);
        if (u) {
          await query.run(`
            INSERT INTO expense_splits (expense_id, user_id, share_amount, percentage, share_points)
            VALUES (?, ?, ?, ?, ?)
          `, [expId, u.id, s.share_amount, s.percentage || null, s.share_points || null]);
        }
      }

      importReport.push({
        rowNumber: rowNum,
        description: raw.description,
        action: 'IMPORTED_EXPENSE',
        notes: `Imported as ${fixes.split_type} split. Total: ₹${finalAmtInr.toFixed(2)}. Payer: ${finalPayer}. Participants: ${finalSplitWith.join(', ')}.`
      });
    }

    await query.exec('COMMIT');
    res.json({ message: 'CSV Import successful', report: importReport });

  } catch (err) {
    await query.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await initDatabase();
});
