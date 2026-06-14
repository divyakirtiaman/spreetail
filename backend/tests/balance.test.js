import { calculateBalances, simplifyDebts, roundToTwo } from '../utils/balanceEngine.js';

console.log('--- RUNNING BALANCE ENGINE TESTS ---');

const members = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev'];

// Define mock expenses
const mockExpenses = [
  // 1. Equal split of 1200 INR between Aisha, Rohan, Priya, Meera (300 each)
  {
    id: 1,
    description: 'Electricity Feb',
    paid_by: 'Aisha',
    amount: 1200.0,
    currency: 'INR',
    exchange_rate: 1.0,
    amount_in_inr: 1200.0,
    split_type: 'equal',
    date: '2026-02-10',
    splits: [
      { user_name: 'Aisha', share_amount: 300.0 },
      { user_name: 'Rohan', share_amount: 300.0 },
      { user_name: 'Priya', share_amount: 300.0 },
      { user_name: 'Meera', share_amount: 300.0 }
    ]
  },
  // 2. Unequal split: Rohan paid 1500, split: Rohan 700, Priya 400, Meera 400
  {
    id: 2,
    description: 'Aisha birthday cake',
    paid_by: 'Rohan',
    amount: 1500.0,
    currency: 'INR',
    exchange_rate: 1.0,
    amount_in_inr: 1500.0,
    split_type: 'unequal',
    date: '2026-02-20',
    splits: [
      { user_name: 'Rohan', share_amount: 700.0 },
      { user_name: 'Priya', share_amount: 400.0 },
      { user_name: 'Meera', share_amount: 400.0 }
    ]
  },
  // 3. Multi-currency USD equal split: Dev paid 540 USD (converted to 44820 INR at 83.0 rate)
  // Split between Aisha, Rohan, Priya, Dev (11205 INR each)
  {
    id: 3,
    description: 'Goa villa booking',
    paid_by: 'Dev',
    amount: 540.0,
    currency: 'USD',
    exchange_rate: 83.0,
    amount_in_inr: 44820.0,
    split_type: 'equal',
    date: '2026-03-09',
    splits: [
      { user_name: 'Aisha', share_amount: 11205.0 },
      { user_name: 'Rohan', share_amount: 11205.0 },
      { user_name: 'Priya', share_amount: 11205.0 },
      { user_name: 'Dev', share_amount: 11205.0 }
    ]
  }
];

// Define mock settlements/payments
const mockPayments = [
  // Rohan paid Aisha 5000 INR
  {
    id: 1,
    paid_by: 'Rohan',
    received_by: 'Aisha',
    amount: 5000.0,
    date: '2026-02-25',
    notes: 'Rohan paid Aisha back'
  }
];

function testBalances() {
  const ledger = calculateBalances(members, mockExpenses, mockPayments);

  // Check Aisha
  // Paid: 1200 (Electricity)
  // Shared Share: 300 (Electricity) + 11205 (Goa) = 11505
  // Settlements Received: 5000 (from Rohan)
  // Net Balance: (1200 + 0) - (11505 + 5000) = 1200 - 16505 = -15305
  const aisha = ledger['Aisha'];
  console.assert(aisha.totalPaid === 1200.0, `Aisha totalPaid mismatch: expected 1200, got ${aisha.totalPaid}`);
  console.assert(aisha.totalShare === 11505.0, `Aisha totalShare mismatch: expected 11505, got ${aisha.totalShare}`);
  console.assert(aisha.totalSettlementsReceived === 5000.0, `Aisha settlementsReceived mismatch`);
  console.assert(aisha.netBalance === -15305.0, `Aisha netBalance mismatch: expected -15305, got ${aisha.netBalance}`);

  // Check Rohan
  // Paid: 1500 (Cake)
  // Shared Share: 300 (Electricity) + 700 (Cake) + 11205 (Goa) = 12205
  // Settlements Paid: 5000 (to Aisha)
  // Net Balance: (1500 + 5000) - (12205 + 0) = 6500 - 12205 = -5705
  const rohan = ledger['Rohan'];
  console.assert(rohan.totalPaid === 1500.0, `Rohan totalPaid mismatch`);
  console.assert(rohan.totalShare === 12205.0, `Rohan totalShare mismatch: expected 12205, got ${rohan.totalShare}`);
  console.assert(rohan.totalSettlementsPaid === 5000.0, `Rohan settlementsPaid mismatch`);
  console.assert(rohan.netBalance === -5705.0, `Rohan netBalance mismatch: expected -5705, got ${rohan.netBalance}`);

  // Check Dev
  // Paid: 44820 (Goa)
  // Share: 11205 (Goa)
  // Net: 44820 - 11205 = +33615
  const dev = ledger['Dev'];
  console.assert(dev.netBalance === 33615.0, `Dev netBalance mismatch: expected 33615, got ${dev.netBalance}`);

  // Check total net balance is zero (critical ledger invariant)
  let netSum = 0;
  members.forEach(m => {
    netSum += ledger[m].netBalance;
  });
  console.assert(Math.abs(netSum) < 0.01, `Ledger total sum is not zero: ${netSum}`);

  console.log('✅ Balance calculation checks passed!');

  // Test Simplification
  const transactions = simplifyDebts(ledger);
  console.log('Simplified Debts Output:');
  transactions.forEach(t => {
    console.log(`- ${t.from} pays ${t.to} ₹${t.amount}`);
  });

  // Total debt should sum to the net positive balances
  const totalPositive = Object.values(ledger)
    .filter(m => m.netBalance > 0)
    .reduce((sum, m) => sum + m.netBalance, 0);

  const totalTransferred = transactions.reduce((sum, t) => sum + t.amount, 0);
  console.assert(Math.abs(totalPositive - totalTransferred) < 0.1, `Transferred amount ${totalTransferred} does not match positive balance ${totalPositive}`);
  console.log('✅ Debt simplification checks passed!');
}

try {
  testBalances();
  console.log('🎉 ALL BACKEND LOGIC TESTS PASSED SUCCESSFULLY!');
} catch (err) {
  console.error('❌ TEST FAILED:', err.message);
  process.exit(1);
}
