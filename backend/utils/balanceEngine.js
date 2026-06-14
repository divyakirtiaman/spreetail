/**
 * Computes individual ledgers for group members and runs a greedy algorithm
 * to simplify debts into a minimal list of payments.
 */

// Helper to round numbers to 2 decimal places
export function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates individual balances, shares, and a detailed audit trail
 * for each group member based on raw database records.
 * 
 * @param {Array} members List of member names in the group
 * @param {Array} expenses List of expenses with their parsed splits
 * @param {Array} payments List of logged payments/settlements
 */
export function calculateBalances(members, expenses, payments) {
  const ledger = {};

  // Initialize ledger for each member
  members.forEach(member => {
    ledger[member] = {
      name: member,
      totalPaid: 0,
      totalShare: 0,
      totalSettlementsPaid: 0,
      totalSettlementsReceived: 0,
      netBalance: 0, // positive means owed, negative means owes
      expenseBreakdown: [],
      settlementBreakdown: []
    };
  });

  // 1. Process Expenses
  expenses.forEach(exp => {
    const paidBy = exp.paid_by;
    const amountInr = exp.amount_in_inr;
    
    // Add to paid_by's total paid if they are a group member
    if (ledger[paidBy]) {
      ledger[paidBy].totalPaid += amountInr;
    }

    // Process splits
    const splits = exp.splits || [];
    splits.forEach(split => {
      const uName = split.user_name;
      const share = split.share_amount;
      
      if (ledger[uName]) {
        ledger[uName].totalShare += share;

        // Record for Rohan's requirement: "No magic numbers"
        ledger[uName].expenseBreakdown.push({
          expenseId: exp.id,
          date: exp.date,
          description: exp.description,
          totalAmount: exp.amount,
          currency: exp.currency,
          exchangeRate: exp.exchange_rate,
          totalAmountInr: amountInr,
          paidBy: paidBy,
          userRole: paidBy === uName ? 'paid_and_split' : 'split_only',
          shareAmountInr: share,
          splitDetailsText: exp.split_details || '',
          splitType: exp.split_type,
          notes: exp.notes
        });
      }
    });

    // If the payer is not in the split list, they still need an entry for what they paid
    if (ledger[paidBy] && !splits.some(s => s.user_name === paidBy)) {
      ledger[paidBy].expenseBreakdown.push({
        expenseId: exp.id,
        date: exp.date,
        description: exp.description,
        totalAmount: exp.amount,
        currency: exp.currency,
        exchangeRate: exp.exchange_rate,
        totalAmountInr: amountInr,
        paidBy: paidBy,
        userRole: 'paid_only',
        shareAmountInr: 0,
        splitDetailsText: exp.split_details || '',
        splitType: exp.split_type,
        notes: exp.notes
      });
    }
  });

  // 2. Process Settlements/Payments
  payments.forEach(pay => {
    const payer = pay.paid_by;
    const receiver = pay.received_by;
    const amount = pay.amount;

    if (ledger[payer]) {
      ledger[payer].totalSettlementsPaid += amount;
      ledger[payer].settlementBreakdown.push({
        id: pay.id,
        date: pay.date,
        type: 'paid',
        peer: receiver,
        amount: amount,
        notes: pay.notes
      });
    }

    if (ledger[receiver]) {
      ledger[receiver].totalSettlementsReceived += amount;
      ledger[receiver].settlementBreakdown.push({
        id: pay.id,
        date: pay.date,
        type: 'received',
        peer: payer,
        amount: amount,
        notes: pay.notes
      });
    }
  });

  // 3. Compute Net Balance for each member
  // Net Balance = (Total Paid + Settlements Paid) - (Total Share + Settlements Received)
  members.forEach(member => {
    const m = ledger[member];
    m.totalPaid = roundToTwo(m.totalPaid);
    m.totalShare = roundToTwo(m.totalShare);
    m.totalSettlementsPaid = roundToTwo(m.totalSettlementsPaid);
    m.totalSettlementsReceived = roundToTwo(m.totalSettlementsReceived);
    
    // Calculate net balance
    m.netBalance = roundToTwo(
      (m.totalPaid + m.totalSettlementsPaid) - (m.totalShare + m.totalSettlementsReceived)
    );
  });

  return ledger;
}

/**
 * Simplifies group debts to find the minimum number of payment transactions
 * needed to settle the group ("Who pays whom, how much").
 * 
 * @param {Object} ledger The calculated balance ledger from calculateBalances
 */
export function simplifyDebts(ledger) {
  const participants = Object.values(ledger).map(m => ({
    name: m.name,
    balance: m.netBalance
  }));

  // Separate debtors and creditors
  const debtors = [];
  const creditors = [];

  participants.forEach(p => {
    // Round to avoid precision issues
    const bal = roundToTwo(p.balance);
    if (bal < -0.01) {
      debtors.push({ name: p.name, balance: bal });
    } else if (bal > 0.01) {
      creditors.push({ name: p.name, balance: bal });
    }
  });

  // Sort debtors ascending (most negative first)
  debtors.sort((a, b) => a.balance - b.balance);
  // Sort creditors descending (most positive first)
  creditors.sort((a, b) => b.balance - a.balance);

  const transactions = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const oweAmount = Math.min(Math.abs(debtor.balance), creditor.balance);
    
    if (oweAmount > 0.01) {
      transactions.push({
        from: debtor.name,
        to: creditor.name,
        amount: roundToTwo(oweAmount)
      });
    }

    debtor.balance += oweAmount;
    creditor.balance -= oweAmount;

    if (Math.abs(debtor.balance) < 0.01) {
      i++;
    }
    if (Math.abs(creditor.balance) < 0.01) {
      j++;
    }
  }

  return transactions;
}
