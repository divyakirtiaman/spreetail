import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../expenses.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper functions to wrap sqlite3 methods in promises
export const query = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

export async function initDatabase() {
  // Create tables
  await query.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memberships (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL, -- Format: YYYY-MM-DD
      left_at TEXT,            -- Format: YYYY-MM-DD (NULL if still active)
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      paid_by_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      exchange_rate REAL DEFAULT 1.0,
      amount_in_inr REAL NOT NULL,
      split_type TEXT NOT NULL DEFAULT 'equal', -- equal, unequal, percentage, share
      date TEXT NOT NULL, -- Format: YYYY-MM-DD
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      share_amount REAL NOT NULL,
      percentage REAL,
      share_points REAL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      paid_by_id INTEGER NOT NULL,
      received_by_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL, -- Format: YYYY-MM-DD
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_id) REFERENCES users(id),
      FOREIGN KEY (received_by_id) REFERENCES users(id)
    );
  `);

  // Seed flatmates
  const usersToSeed = [
    { name: 'Aisha', email: 'aisha@flatmates.com' },
    { name: 'Rohan', email: 'rohan@flatmates.com' },
    { name: 'Priya', email: 'priya@flatmates.com' },
    { name: 'Meera', email: 'meera@flatmates.com' },
    { name: 'Sam', email: 'sam@flatmates.com' },
    { name: 'Dev', email: 'dev@flatmates.com' }
  ];

  const defaultPassword = 'password123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(defaultPassword, salt);

  for (const user of usersToSeed) {
    const existing = await query.get('SELECT * FROM users WHERE name = ?', [user.name]);
    if (!existing) {
      await query.run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [user.name, user.email, hash]
      );
    }
  }

  // Seed default group
  const existingGroup = await query.get('SELECT * FROM groups WHERE id = 1');
  if (!existingGroup) {
    await query.run(
      'INSERT INTO groups (id, name, description) VALUES (1, "Shared Flat", "Flatmates shared expenses & Goa trip")',
      []
    );
  }

  // Seed memberships (timelines)
  // Aisha: Feb 1, 2026 - present
  // Rohan: Feb 1, 2026 - present
  // Priya: Feb 1, 2026 - present
  // Dev: Feb 1, 2026 - present
  // Meera: Feb 1, 2026 - Mar 31, 2026
  // Sam: Apr 15, 2026 - present
  const memberships = [
    { name: 'Aisha', joined_at: '2026-02-01', left_at: null },
    { name: 'Rohan', joined_at: '2026-02-01', left_at: null },
    { name: 'Priya', joined_at: '2026-02-01', left_at: null },
    { name: 'Dev', joined_at: '2026-02-01', left_at: null },
    { name: 'Meera', joined_at: '2026-02-01', left_at: '2026-03-31' },
    { name: 'Sam', joined_at: '2026-04-15', left_at: null }
  ];

  for (const mem of memberships) {
    const user = await query.get('SELECT id FROM users WHERE name = ?', [mem.name]);
    if (user) {
      const existingMem = await query.get(
        'SELECT * FROM memberships WHERE group_id = 1 AND user_id = ?',
        [user.id]
      );
      if (!existingMem) {
        await query.run(
          'INSERT INTO memberships (group_id, user_id, joined_at, left_at) VALUES (1, ?, ?, ?)',
          [user.id, mem.joined_at, mem.left_at]
        );
      } else {
        // Update it just in case
        await query.run(
          'UPDATE memberships SET joined_at = ?, left_at = ? WHERE group_id = 1 AND user_id = ?',
          [mem.joined_at, mem.left_at, user.id]
        );
      }
    }
  }

  console.log('Database initialized successfully.');
}
export default db;
