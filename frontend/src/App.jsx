import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5000/api';

// Local rounding helper (mirrors backend util)
const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [view, setView] = useState('dashboard'); // dashboard, import, ledger
  
  // Auth state
  const [loginName, setLoginName] = useState('Rohan');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [loginError, setLoginError] = useState('');
  
  // Data state
  const [usersList, setUsersList] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ledgerData, setLedgerData] = useState({});
  const [transactions, setTransactions] = useState([]);
  
  // Modals state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showRecordSettlement, setShowRecordSettlement] = useState(false);
  
  // Manual Expense Form
  const [expDesc, setExpDesc] = useState('');
  const [expPayer, setExpPayer] = useState('Aisha');
  const [expAmt, setExpAmt] = useState('');
  const [expCurrency, setExpCurrency] = useState('INR');
  const [expRate, setExpRate] = useState('83.0');
  const [expSplitType, setExpSplitType] = useState('equal');
  const [expSplitWith, setExpSplitWith] = useState([]);
  const [expSplitDetails, setExpSplitDetails] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expNotes, setExpNotes] = useState('');

  // Manual Settlement Form
  const [setFrom, setSetFrom] = useState('Rohan');
  const [setTo, setSetTo] = useState('Aisha');
  const [setAmt, setSetAmt] = useState('');
  const [setDate, setSetDate] = useState(new Date().toISOString().split('T')[0]);
  const [setNotes, setSetNotes] = useState('');

  // CSV Import state
  const [csvFile, setCsvFile] = useState(null);
  const [importAnalysis, setImportAnalysis] = useState(null);
  const [usdRate, setUsdRate] = useState(83.0);
  const [guestAbsorption, setGuestAbsorption] = useState('payer'); // payer, split
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);

  // Expands details in Ledger
  const [expandedExpense, setExpandedExpense] = useState(null);

  // Load basic data
  useEffect(() => {
    fetchUsers();
    if (token) {
      fetchData();
    }
  }, [token]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const expensesRes = await fetch(`${API_BASE}/expenses`, { headers });
      const paymentsRes = await fetch(`${API_BASE}/payments`, { headers });
      const balancesRes = await fetch(`${API_BASE}/balances`, { headers });
      
      if (expensesRes.ok) setExpenses(await expensesRes.json());
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (balancesRes.ok) {
        const b = await balancesRes.json();
        setLedgerData(b.ledger || {});
        setTransactions(b.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch application data:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: loginName, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setView('dashboard');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Could not connect to authentication server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setImportAnalysis(null);
    setImportReport(null);
  };

  // Add Manual Expense
  const handleAddExpenseSubmit = async (e) => {
    e.preventDefault();
    if (expSplitWith.length === 0) {
      alert('Please select at least one roommate for the split.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description: expDesc,
          paid_by: expPayer,
          amount: parseFloat(expAmt),
          currency: expCurrency,
          exchange_rate: parseFloat(expRate),
          split_type: expSplitType,
          date: expDate,
          split_with: expSplitWith,
          split_details: expSplitDetails,
          notes: expNotes
        })
      });

      if (res.ok) {
        setShowAddExpense(false);
        resetExpenseForm();
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add expense');
      }
    } catch (err) {
      alert('Error connecting to backend');
    }
  };

  const resetExpenseForm = () => {
    setExpDesc('');
    setExpAmt('');
    setExpCurrency('INR');
    setExpRate('83.0');
    setExpSplitType('equal');
    setExpSplitWith([]);
    setExpSplitDetails('');
    setExpNotes('');
  };

  // Record Settlement
  const handleRecordSettlementSubmit = async (e) => {
    e.preventDefault();
    if (setFrom === setTo) {
      alert('Sender and receiver must be different roommates.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paid_by: setFrom,
          received_by: setTo,
          amount: parseFloat(setAmt),
          date: setDate,
          notes: setNotes
        })
      });

      if (res.ok) {
        setShowRecordSettlement(false);
        setSetAmt('');
        setSetNotes('');
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to record settlement');
      }
    } catch (err) {
      alert('Error connecting to backend');
    }
  };

  // CSV analysis trigger
  const handleCSVUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) return;

    setIsAnalyzing(true);
    setImportAnalysis(null);
    setImportReport(null);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('exchangeRate', usdRate);

    try {
      const res = await fetch(`${API_BASE}/import/analyze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        // Pre-populate user actions
        const rowsWithActions = data.processedRows.map(row => {
          let defaultAction = 'import';
          let chosenAction = '';
          let customPayer = '';

          // Auto-resolution defaults
          if (row.anomalies.some(a => a.type === 'DUPLICATE_EXPENSE')) {
            defaultAction = 'skip';
          }
          if (row.anomalies.some(a => a.type === 'DISPUTED_DUPLICATE')) {
            // Default to Rohan's 2450 (keep), Aisha's 2400 (skip)
            if (row.raw.paid_by === 'Aisha') {
              defaultAction = 'skip';
            }
          }
          if (row.anomalies.some(a => a.type === 'SETTLEMENT_LOGGED_AS_EXPENSE')) {
            defaultAction = 'import_as_settlement';
          }
          if (row.anomalies.some(a => a.type === 'ZERO_AMOUNT')) {
            defaultAction = 'skip';
          }
          if (row.anomalies.some(a => a.type === 'INACTIVE_MEMBER_SPLIT')) {
            chosenAction = 'removeMeera';
          }
          if (row.anomalies.some(a => a.type === 'PRE_MEMBERSHIP_SPLIT')) {
            chosenAction = 'removeSam';
          }
          if (row.anomalies.some(a => a.type === 'INVALID_PERCENTAGE')) {
            chosenAction = 'normalize';
          }

          return {
            ...row,
            action: defaultAction,
            chosenAction: chosenAction,
            customPayer: customPayer
          };
        });

        setImportAnalysis({
          anomaliesCount: data.anomalies.length,
          processedRows: rowsWithActions
        });
      } else {
        alert(data.error || 'Failed to analyze CSV');
      }
    } catch (err) {
      alert('Error uploading file');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Execute CSV ingestion
  const handleConfirmImport = async () => {
    setIsImporting(true);
    try {
      const res = await fetch(`${API_BASE}/import/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: importAnalysis.processedRows,
          guestAbsorption: guestAbsorption,
          usdRate: usdRate
        })
      });
      const data = await res.json();
      if (res.ok) {
        setImportReport(data.report);
        setImportAnalysis(null);
        setCsvFile(null);
        fetchData();
      } else {
        alert(data.error || 'Import failed');
      }
    } catch (err) {
      alert('Error executing CSV ingestion');
    } finally {
      setIsImporting(false);
    }
  };

  const updateImportRowField = (rowNumber, field, value) => {
    setImportAnalysis(prev => {
      const updated = prev.processedRows.map(r => {
        if (r.rowNumber === rowNumber) {
          return { ...r, [field]: value };
        }
        return r;
      });
      return { ...prev, processedRows: updated };
    });
  };

  // Render Login
  if (!token) {
    return (
      <div className="flex-center" style={{ minHeight: '90vh', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px' }}>
          <div className="flex-center mb-20" style={{ flexDirection: 'column', gap: '10px' }}>
            <div className="logo-icon">₹</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>SplitFlat</h2>
            <p style={{ fontSize: '0.9rem' }}>Shared Expenses & Timeline Import</p>
          </div>
          
          {loginError && (
            <div className="badge badge-danger" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '6px' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Select Roommate</label>
              <select value={loginName} onChange={(e) => setLoginName(e.target.value)}>
                <option value="Aisha">Aisha</option>
                <option value="Rohan">Rohan</option>
                <option value="Priya">Priya</option>
                <option value="Meera">Meera</option>
                <option value="Sam">Sam</option>
                <option value="Dev">Dev</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                className="form-control"
                value={loginPassword} 
                onChange={(e) => setLoginPassword(e.target.value)} 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
              Sign In
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Demo credentials: <strong>password123</strong>
          </div>
        </div>
      </div>
    );
  }

  // Active user details
  const activeUser = user || { name: 'Flatmate' };

  return (
    <div className="container">
      {/* Header NAVBAR */}
      <div className="navbar">
        <div className="logo" onClick={() => setView('dashboard')} style={{ cursor: 'pointer' }}>
          <div className="logo-icon">₹</div>
          <span>SplitFlat</span>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button 
            className={`btn ${view === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => { setView('dashboard'); setImportReport(null); }}
          >
            Dashboard
          </button>
          <button 
            className={`btn ${view === 'ledger' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => { setView('ledger'); setImportReport(null); }}
          >
            Ledger
          </button>
          <button 
            className={`btn ${view === 'import' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => setView('import')}
          >
            Import Wizard
          </button>

          <div className="user-profile-widget">
            <div className="user-avatar">{activeUser.name[0]}</div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{activeUser.name}</span>
            <button 
              className="btn btn-secondary btn-icon" 
              onClick={handleLogout} 
              title="Logout" 
              style={{ padding: '4px', fontSize: '0.8rem', marginLeft: '5px' }}
            >
              🚪
            </button>
          </div>
        </div>
      </div>

      {/* DASHBOARD VIEW */}
      {view === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Top Quick Actions */}
          <div className="flex-between">
            <div>
              <h1 style={{ fontSize: '2rem' }}>Welcome, {activeUser.name}</h1>
              <p>Here is your flat summary & debt simplifications</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>
                ➕ Add Expense
              </button>
              <button className="btn btn-secondary" onClick={() => setShowRecordSettlement(true)}>
                🤝 Record Settlement
              </button>
              <button
                className="btn btn-danger"
                title="Clear all expenses and payments for a clean CSV re-import"
                onClick={async () => {
                  if (!window.confirm('Reset ALL expenses and payments? (Users and memberships are kept)')) return;
                  const res = await fetch(`${API_BASE}/reset`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) { fetchData(); }
                  else { const e = await res.json(); alert(e.error); }
                }}
              >
                🗑 Reset Data
              </button>
            </div>
          </div>

          {/* Core Balance Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* Aisha's requirement: One Number Per Person */}
            <div className="glass-panel">
              <h2>Balances Overview</h2>
              <p style={{ marginBottom: '15px', fontSize: '0.85rem' }}>Net balances of all roommates in the group</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.keys(ledgerData).map(name => {
                  const m = ledgerData[name];
                  const isOwed = m.netBalance >= 0;
                  return (
                    <div key={name} className="glass-card flex-between" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="user-avatar" style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}>{name[0]}</div>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{name}</span>
                      </div>
                      <div className="text-right">
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: isOwed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {isOwed ? `+₹${m.netBalance.toLocaleString()}` : `-₹${Math.abs(m.netBalance).toLocaleString()}`}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {isOwed ? 'is owed' : 'owes'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aisha's requirement: Debt Simplification ("Who pays whom") */}
            <div className="glass-panel" style={{ borderLeft: '3px solid var(--color-primary)' }}>
              <h2>Settle-Up Guide</h2>
              <p style={{ marginBottom: '15px', fontSize: '0.85rem' }}>Aisha's simplified payments to clear all debts</p>

              {transactions.length === 0 ? (
                <div className="flex-center" style={{ minHeight: '180px', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '2.5rem' }}>🎉</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>All Settled! No debts pending.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {transactions.map((t, idx) => (
                    <div key={idx} className="glass-card flex-between" style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{t.from}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>pays</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{t.to}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        ₹{t.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Roommate Status Logs (Meera/Sam) */}
            <div className="glass-panel">
              <h2>Roommate Timelines</h2>
              <p style={{ marginBottom: '15px', fontSize: '0.85rem' }}>Enforces timeline split eligibility</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="glass-card">
                  <div className="flex-between">
                    <span style={{ fontWeight: 600 }}>Meera</span>
                    <span className="badge badge-warning">Moved Out</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Active: Feb 1, 2026 – March 31, 2026.
                    <br />
                    <span style={{ color: 'var(--color-warning)' }}>* Exempt from any April bills.</span>
                  </div>
                </div>

                <div className="glass-card">
                  <div className="flex-between">
                    <span style={{ fontWeight: 600 }}>Sam</span>
                    <span className="badge badge-success">Active Roommate</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Active: April 15, 2026 – Present.
                    <br />
                    <span style={{ color: 'var(--color-success)' }}>* Exempt from Feb/Mar expenses.</span>
                  </div>
                </div>

                <div className="glass-card">
                  <div className="flex-between">
                    <span style={{ fontWeight: 600 }}>Dev</span>
                    <span className="badge badge-info">Trip Member</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Active: Feb 1, 2026 – Present.
                    <br />
                    <span>* Exclusively charged for trips & dinners.</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* LEDGER / EXPENSE LIST VIEW */}
      {view === 'ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h1>Expense & Payments Ledger</h1>
            <p>Rohan's detailed verification view: Select any expense to see split breakdowns.</p>
          </div>

          <div className="glass-panel" style={{ padding: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {expenses.length === 0 ? (
                <div className="flex-center" style={{ minHeight: '150px' }}>No expenses found. Import the spreadsheet CSV to begin.</div>
              ) : (
                expenses.map(exp => {
                  const isExpanded = expandedExpense === exp.id;
                  const formattedAmt = exp.currency === 'USD' 
                    ? `$${exp.amount} (${roundToTwo(exp.amount_in_inr)} INR)` 
                    : `₹${exp.amount_in_inr}`;

                  return (
                    <div key={exp.id} className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                      {/* Accordion Header */}
                      <div 
                        onClick={() => setExpandedExpense(isExpanded ? null : exp.id)}
                        className="flex-between"
                        style={{ padding: '16px', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                      >
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {exp.date}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{exp.description}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Paid by <strong>{exp.paid_by}</strong> • Split type: <span className="badge badge-info" style={{ padding: '1px 6px', fontSize: '0.65rem' }}>{exp.split_type}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {formattedAmt}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      {/* Rohan's "No Magic Numbers" Split Details */}
                      {isExpanded && (
                        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                          {exp.notes && (
                            <p style={{ fontSize: '0.85rem', marginBottom: '12px', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                              📝 Notes: {exp.notes}
                            </p>
                          )}
                          
                          {exp.currency === 'USD' && (
                            <div className="badge badge-warning" style={{ marginBottom: '12px', fontSize: '0.75rem' }}>
                              💱 Exchange Rate: 1 USD = ₹{exp.exchange_rate} INR
                            </div>
                          )}

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  <th style={{ padding: '8px', color: 'var(--text-muted)' }}>Roommate</th>
                                  <th style={{ padding: '8px', color: 'var(--text-muted)' }}>Split Rule</th>
                                  <th style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'right' }}>Calculated Share (INR)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exp.splits && exp.splits.map((s, sIdx) => {
                                  let splitRuleText = 'Equal Share';
                                  if (exp.split_type === 'percentage') {
                                    splitRuleText = `Percentage: ${s.percentage}%`;
                                  } else if (exp.split_type === 'share') {
                                    splitRuleText = `Share weight: ${s.share_points} pts`;
                                  } else if (exp.split_type === 'unequal') {
                                    splitRuleText = 'Custom Amount';
                                  }

                                  return (
                                    <tr key={sIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '8px', fontWeight: 600 }}>{s.user_name}</td>
                                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{splitRuleText}</td>
                                      <td style={{ padding: '8px', fontWeight: 800, textAlign: 'right', color: 'var(--color-info)' }}>
                                        ₹{s.share_amount.toFixed(2)}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {/* Sum Assertion Check */}
                                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                  <td style={{ padding: '8px', fontWeight: 700 }}>Total Reconciled</td>
                                  <td></td>
                                  <td style={{ padding: '8px', fontWeight: 800, textAlign: 'right', borderBottom: '2px double rgba(255,255,255,0.3)' }}>
                                    ₹{exp.splits ? exp.splits.reduce((sum, s) => sum + s.share_amount, 0).toFixed(2) : '0.00'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE IMPORT WIZARD VIEW */}
      {view === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h1>Interactive Import Wizard</h1>
            <p>Upload the spreadsheet CSV to inspect and resolve inconsistencies before DB ingestion.</p>
          </div>

          {/* CSV File Selector Card */}
          {!importAnalysis && !importReport && (
            <div className="glass-panel" style={{ maxWidth: '600px' }}>
              <h2>1. Upload spreadsheet</h2>
              <p style={{ marginBottom: '20px' }}>Please select <code>expenses_export.csv</code></p>
              
              <div className="form-group">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files[0])}
                  style={{ padding: '10px', background: 'rgba(255,255,255,0.02)' }} 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                <div className="form-group">
                  <label>USD exchange rate (INR/USD)</label>
                  <input 
                    type="number"
                    step="0.1"
                    className="form-control"
                    value={usdRate}
                    onChange={(e) => setUsdRate(parseFloat(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Guest Kabir's Share Policy</label>
                  <select value={guestAbsorption} onChange={(e) => setGuestAbsorption(e.target.value)}>
                    <option value="payer">Dev absorbs guest share (Default)</option>
                    <option value="split">Split directly with guest</option>
                  </select>
                </div>
              </div>

              <button 
                className="btn btn-primary mt-20"
                onClick={handleCSVUpload}
                disabled={!csvFile || isAnalyzing}
                style={{ width: '100%' }}
              >
                {isAnalyzing ? 'Scanning CSV Data...' : 'Analyze CSV Anomalies'}
              </button>
            </div>
          )}

          {/* Interactive Resolution Panel (Meera's Requirement) */}
          {importAnalysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ borderLeft: '4px solid var(--color-warning)' }}>
                <h2>Inspect & Approve Resolutions ({importAnalysis.anomaliesCount} anomalies detected)</h2>
                <p style={{ fontSize: '0.85rem' }}>Meera's Approval Queue: Review our suggested fixes below. If unapproved, rows will be skipped or adjusted.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {importAnalysis.processedRows.map((row, idx) => {
                  const hasAnom = row.anomalies.length > 0;
                  
                  return (
                    <div 
                      key={idx} 
                      className="glass-card" 
                      style={{ 
                        borderLeft: hasAnom ? '3px solid var(--color-warning)' : '3px solid var(--color-success)',
                        padding: '16px'
                      }}
                    >
                      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <span className="badge badge-info" style={{ marginRight: '10px' }}>Row {row.rowNumber}</span>
                          <strong style={{ fontSize: '1rem' }}>{row.raw.description}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                            ({row.raw.date} • {row.raw.amount} {row.raw.currency})
                          </span>
                        </div>
                        
                        {/* Import / Skip Toggle */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                            Action:
                          </label>
                          <select 
                            value={row.action} 
                            onChange={(e) => updateImportRowField(row.rowNumber, 'action', e.target.value)}
                            style={{ padding: '4px 10px', fontSize: '0.8rem', width: 'auto' }}
                          >
                            <option value="import">Import Expense</option>
                            <option value="import_as_settlement">Import as Settlement</option>
                            <option value="skip">Discard Row</option>
                          </select>
                        </div>
                      </div>

                      {/* Flagged Anomalies details */}
                      {hasAnom && (
                        <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-warning)' }}>Detected Anomaly & Proposed Resolution:</span>
                          {row.anomalies.map((anom, aIdx) => (
                            <div key={aIdx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              ⚠️ <strong>{anom.type}</strong>: {anom.description}
                              <br />
                              💡 Fix: <span style={{ color: '#818cf8', fontWeight: 600 }}>{anom.proposed_resolution}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Interactive resolution options */}
                      <div className="flex-between" style={{ flexWrap: 'wrap', marginTop: '12px', gap: '10px', fontSize: '0.85rem' }}>
                        {/* Missing Payer resolution */}
                        {row.anomalies.some(a => a.type === 'MISSING_PAYER') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--color-danger)' }}>Select Payer:</span>
                            <select 
                              value={row.customPayer || ''}
                              onChange={(e) => updateImportRowField(row.rowNumber, 'customPayer', e.target.value)}
                              style={{ padding: '2px 8px', fontSize: '0.8rem', width: 'auto' }}
                            >
                              <option value="">-- select payer --</option>
                              <option value="Aisha">Aisha</option>
                              <option value="Rohan">Rohan</option>
                              <option value="Priya">Priya</option>
                              <option value="Meera">Meera</option>
                              <option value="Sam">Sam</option>
                              <option value="Dev">Dev</option>
                            </select>
                          </div>
                        )}

                        {/* Inactive Member Resolution */}
                        {row.anomalies.some(a => a.type === 'INACTIVE_MEMBER_SPLIT') && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input 
                              type="checkbox"
                              checked={row.chosenAction === 'removeMeera'}
                              onChange={(e) => updateImportRowField(row.rowNumber, 'chosenAction', e.target.checked ? 'removeMeera' : '')} 
                            />
                            Exclude Meera from split list
                          </label>
                        )}

                        {/* Pre-membership Sam split */}
                        {row.anomalies.some(a => a.type === 'PRE_MEMBERSHIP_SPLIT') && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input 
                              type="checkbox"
                              checked={row.chosenAction === 'removeSam'}
                              onChange={(e) => updateImportRowField(row.rowNumber, 'chosenAction', e.target.checked ? 'removeSam' : '')} 
                            />
                            Exclude Sam from split list
                          </label>
                        )}

                        {/* Percentages mismatch */}
                        {row.anomalies.some(a => a.type === 'INVALID_PERCENTAGE') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Percentage Fix:</span>
                            <select 
                              value={row.chosenAction}
                              onChange={(e) => updateImportRowField(row.rowNumber, 'chosenAction', e.target.value)}
                              style={{ padding: '2px 6px', fontSize: '0.8rem', width: 'auto' }}
                            >
                              <option value="normalize">Normalize to 100% proportionally (Default)</option>
                              <option value="adjustMeera">Reduce Meera to 10%</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import Action Trigger Buttons */}
              <div className="flex-between mt-20">
                <button className="btn btn-secondary" onClick={() => setImportAnalysis(null)}>
                  Cancel Import
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleConfirmImport}
                  disabled={isImporting || importAnalysis.processedRows.some(r => r.action === 'import' && r.anomalies.some(a => a.type === 'MISSING_PAYER') && !r.customPayer)}
                >
                  {isImporting ? 'Ingesting Data...' : 'Confirm & Save approved rows'}
                </button>
              </div>
            </div>
          )}

          {/* Post Import Report */}
          {importReport && (
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--color-success)' }}>
              <h2>Import Report Output Generated!</h2>
              <p style={{ marginBottom: '20px' }}>Ingestion complete. Here is the log of resolved anomalies and actions taken:</p>
              
              <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {importReport.map((rep, idx) => (
                  <div key={idx} className="glass-card flex-between" style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
                    <div>
                      <span className="badge badge-info" style={{ marginRight: '8px' }}>Row {rep.rowNumber}</span>
                      <strong>{rep.description}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {rep.notes}
                      </div>
                    </div>
                    <div>
                      <span className={`badge ${rep.action.includes('EXPENSE') ? 'badge-success' : rep.action.includes('SETTLEMENT') ? 'badge-info' : 'badge-danger'}`}>
                        {rep.action}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn btn-primary mt-20" onClick={() => { setView('dashboard'); setImportReport(null); }}>
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* ADD MANUAL EXPENSE MODAL */}
      {showAddExpense && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex-between mb-20">
              <h2>➕ Add Manual Expense</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowAddExpense(false)}>✕</button>
            </div>
            
            <form onSubmit={handleAddExpenseSubmit}>
              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="e.g. Cinema tickets"
                  value={expDesc} 
                  onChange={(e) => setExpDesc(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>Paid By</label>
                  <select value={expPayer} onChange={(e) => setExpPayer(e.target.value)}>
                    <option value="Aisha">Aisha</option>
                    <option value="Rohan">Rohan</option>
                    <option value="Priya">Priya</option>
                    <option value="Meera">Meera</option>
                    <option value="Sam">Sam</option>
                    <option value="Dev">Dev</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-control"
                    placeholder="0.00"
                    value={expAmt} 
                    onChange={(e) => setExpAmt(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>Currency</label>
                  <select value={expCurrency} onChange={(e) => setExpCurrency(e.target.value)}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                {expCurrency === 'USD' && (
                  <div className="form-group">
                    <label>USD exchange rate (INR/USD)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="form-control"
                      value={expRate} 
                      onChange={(e) => setExpRate(e.target.value)} 
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  className="form-control"
                  value={expDate} 
                  onChange={(e) => setExpDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Split Type</label>
                <select value={expSplitType} onChange={(e) => setExpSplitType(e.target.value)}>
                  <option value="equal">Split Equally</option>
                  <option value="percentage">Percentage shares</option>
                  <option value="share">Weight points</option>
                  <option value="unequal">Unequal absolute amounts</option>
                </select>
              </div>

              <div className="form-group">
                <label>Select Roommates to include in split</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px' }}>
                  {['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev'].map(name => {
                    const isChecked = expSplitWith.includes(name);
                    return (
                      <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExpSplitWith(prev => [...prev, name]);
                            } else {
                              setExpSplitWith(prev => prev.filter(n => n !== name));
                            }
                          }}
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>

              {expSplitType !== 'equal' && (
                <div className="form-group">
                  <label>
                    Split details weight/percentages/unequal splits (semicolon separated)
                  </label>
                  <textarea 
                    className="form-control" 
                    rows="2"
                    placeholder={
                      expSplitType === 'percentage' ? 'Aisha 30; Rohan 40; Priya 30' :
                      expSplitType === 'share' ? 'Aisha 1; Rohan 2; Priya 1' :
                      'Aisha 500; Rohan 300'
                    }
                    value={expSplitDetails}
                    onChange={(e) => setExpSplitDetails(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Notes</label>
                <textarea 
                  className="form-control"
                  rows="2"
                  value={expNotes} 
                  onChange={(e) => setExpNotes(e.target.value)} 
                />
              </div>

              <button type="submit" className="btn btn-primary mt-20" style={{ width: '100%' }}>
                Save Expense
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RECORD SETTLEMENT MODAL */}
      {showRecordSettlement && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ background: 'var(--bg-secondary)', maxWidth: '450px' }}>
            <div className="flex-between mb-20">
              <h2>🤝 Record Settlement Payment</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowRecordSettlement(false)}>✕</button>
            </div>
            
            <form onSubmit={handleRecordSettlementSubmit}>
              <div className="form-group">
                <label>Sender (Who Paid)</label>
                <select value={setFrom} onChange={(e) => setSetFrom(e.target.value)}>
                  <option value="Aisha">Aisha</option>
                  <option value="Rohan">Rohan</option>
                  <option value="Priya">Priya</option>
                  <option value="Meera">Meera</option>
                  <option value="Sam">Sam</option>
                  <option value="Dev">Dev</option>
                </select>
              </div>

              <div className="form-group">
                <label>Receiver (Who Got Paid)</label>
                <select value={setTo} onChange={(e) => setSetTo(e.target.value)}>
                  <option value="Aisha">Aisha</option>
                  <option value="Rohan">Rohan</option>
                  <option value="Priya">Priya</option>
                  <option value="Meera">Meera</option>
                  <option value="Sam">Sam</option>
                  <option value="Dev">Dev</option>
                </select>
              </div>

              <div className="form-group">
                <label>Amount (INR)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-control"
                  placeholder="0.00"
                  value={setAmt} 
                  onChange={(e) => setSetAmt(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  className="form-control"
                  value={setDate} 
                  onChange={(e) => setSetDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea 
                  className="form-control"
                  rows="2"
                  value={setNotes} 
                  onChange={(e) => setSetNotes(e.target.value)} 
                />
              </div>

              <button type="submit" className="btn btn-primary mt-20" style={{ width: '100%' }}>
                Record Payment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
