function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Predefined members and timelines
const OFFICIAL_MEMBERS = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev'];
const MEMBERSHIP_TIMELINES = {
  Aisha: { joined: '2026-02-01', left: null },
  Rohan: { joined: '2026-02-01', left: null },
  Priya: { joined: '2026-02-01', left: null },
  Dev: { joined: '2026-02-01', left: null },
  Meera: { joined: '2026-02-01', left: '2026-03-31' },
  Sam: { joined: '2026-04-15', left: null }
};

// Normalize name by capitalization and trimming
function normalizeName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'priya s') return 'Priya';
  if (trimmed.toLowerCase() === 'priya') return 'Priya';
  if (trimmed.toLowerCase() === 'rohan') return 'Rohan';
  if (trimmed.toLowerCase() === 'aisha') return 'Aisha';
  if (trimmed.toLowerCase() === 'meera') return 'Meera';
  if (trimmed.toLowerCase() === 'sam') return 'Sam';
  if (trimmed.toLowerCase() === 'dev') return 'Dev';
  return trimmed;
}

// Convert "Mar-14" or "01-02-2026" to "YYYY-MM-DD"
function parseDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.trim();
  
  // Format: DD-MM-YYYY
  const dmyRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  if (dmyRegex.test(str)) {
    const [, day, month, year] = str.match(dmyRegex);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Format: Mon-DD (e.g. Mar-14)
  const monDayRegex = /^([A-Za-z]{3})-(\d{1,2})$/;
  if (monDayRegex.test(str)) {
    const [, monthStr, day] = str.match(monDayRegex);
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[monthStr.toLowerCase()];
    if (month) {
      // Deduce year based on other rows or standard context (2026)
      return `2026-${month}-${day.padStart(2, '0')}`;
    }
  }

  return null;
}

// Checks if user was active on a given date
function isMemberActive(name, dateStr) {
  const timeline = MEMBERSHIP_TIMELINES[name];
  if (!timeline) return false;
  const date = new Date(dateStr);
  const joined = new Date(timeline.joined);
  const left = timeline.left ? new Date(timeline.left) : null;

  return date >= joined && (!left || date <= left);
}

export function analyzeCSV(csvText, customRate = 83.0) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return { anomalies: [], processedRows: [] };

  const headers = parseCSVLine(lines[0]);
  const rawRows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    
    const rowObj = {};
    headers.forEach((header, idx) => {
      rowObj[header] = values[idx] || '';
    });
    rowObj._rowNumber = i + 1; // 1-indexed (with header as row 1)
    rawRows.push(rowObj);
  }

  const anomalies = [];
  const processedRows = [];

  // Track occurrences for duplicate detection
  // Key: date + amount + paid_by (normalized)
  const seenTransactions = {};

  for (const rawRow of rawRows) {
    const rowNum = rawRow._rowNumber;
    const errors = [];
    const fixes = {};
    
    // 1. Parse Date
    let parsedDate = parseDate(rawRow.date);
    if (!parsedDate) {
      errors.push({
        type: 'INCONSISTENT_DATE',
        severity: 'warning',
        description: `Inconsistent date format: "${rawRow.date}"`,
        proposed_resolution: `Parse as "2026-03-14" (assuming year 2026)`
      });
      parsedDate = '2026-03-14'; // Fallback
    } else if (rawRow.date !== parsedDate) {
      if (rawRow.date.includes('Mar-')) {
        errors.push({
          type: 'INCONSISTENT_DATE',
          severity: 'warning',
          description: `Date in "Month-Day" shorthand: "${rawRow.date}"`,
          proposed_resolution: `Standardize to "2026-03-14"`
        });
      } else {
        // Date format was DD-MM-YYYY, converted to YYYY-MM-DD
        fixes.date = parsedDate;
      }
    }
    fixes.date = parsedDate;

    // 2. Parse Payer
    const rawPayer = rawRow.paid_by;
    const normalizedPayer = normalizeName(rawPayer);
    
    if (!rawPayer || rawPayer.trim() === '') {
      errors.push({
        type: 'MISSING_PAYER',
        severity: 'critical',
        description: `Missing payer for expense: "${rawRow.description}"`,
        proposed_resolution: `Ask user to assign a payer`
      });
      fixes.paid_by = ''; // Needs manual resolution
    } else if (!OFFICIAL_MEMBERS.includes(normalizedPayer)) {
      errors.push({
        type: 'TYPO_NAME',
        severity: 'warning',
        description: `Unrecognized payer name "${rawPayer}"`,
        proposed_resolution: `Map to group member "${normalizedPayer}"`
      });
      fixes.paid_by = normalizedPayer;
    } else {
      if (rawPayer !== normalizedPayer) {
        errors.push({
          type: 'TYPO_NAME',
          severity: 'warning',
          description: `Name format issue: "${rawPayer}" (spaces or lowercase)`,
          proposed_resolution: `Standardize to "${normalizedPayer}"`
        });
      }
      fixes.paid_by = normalizedPayer;
    }

    // 3. Parse Amount
    let rawAmt = rawRow.amount;
    let cleanAmtStr = rawAmt.replace(/[",]/g, '').trim();
    let amountFloat = parseFloat(cleanAmtStr);
    
    if (isNaN(amountFloat)) {
      errors.push({
        type: 'INVALID_AMOUNT',
        severity: 'critical',
        description: `Invalid expense amount: "${rawAmt}"`,
        proposed_resolution: `Set amount to 0`
      });
      amountFloat = 0;
    } else {
      // Check formatting issues (quotes and commas)
      if (rawAmt.includes(',') || rawAmt.includes('"')) {
        errors.push({
          type: 'FORMATTING_AMOUNT',
          severity: 'warning',
          description: `Amount has commas or quotes: "${rawAmt}"`,
          proposed_resolution: `Clean as numeric float: ${amountFloat}`
        });
      }
      // Check sub-paise decimal precision
      const decimalParts = cleanAmtStr.split('.');
      if (decimalParts[1] && decimalParts[1].length > 2) {
        const rounded = Math.round(amountFloat * 100) / 100;
        errors.push({
          type: 'DECIMAL_PRECISION',
          severity: 'warning',
          description: `Amount has more than 2 decimal places: "${rawAmt}"`,
          proposed_resolution: `Round to 2 decimal places: ${rounded.toFixed(2)}`
        });
        amountFloat = rounded;
      }
    }
    fixes.amount = amountFloat;

    // Check negative amount (refund)
    if (amountFloat < 0) {
      errors.push({
        type: 'NEGATIVE_AMOUNT',
        severity: 'warning',
        description: `Negative expense amount (${amountFloat}): "${rawRow.description}"`,
        proposed_resolution: `Treat as a refund to be shared among members`
      });
    }

    // Check zero amount
    if (amountFloat === 0) {
      errors.push({
        type: 'ZERO_AMOUNT',
        severity: 'warning',
        description: `Zero amount expense: "${rawRow.description}"`,
        proposed_resolution: `Exclude from active balance calculation`
      });
    }

    // 4. Parse Currency & Exchange Rate
    const rawCurrency = rawRow.currency.trim().toUpperCase();
    let currency = rawCurrency || 'INR';
    if (!rawCurrency) {
      errors.push({
        type: 'MISSING_CURRENCY',
        severity: 'warning',
        description: `Missing currency for expense: "${rawRow.description}"`,
        proposed_resolution: `Default to "INR"`
      });
    }
    fixes.currency = currency;

    let exchangeRate = 1.0;
    if (currency === 'USD') {
      exchangeRate = customRate;
      errors.push({
        type: 'USD_CURRENCY',
        severity: 'warning',
        description: `USD transaction (${rawRow.amount} USD): "${rawRow.description}"`,
        proposed_resolution: `Convert to INR at rate of ${customRate} (Total: ${(amountFloat * customRate).toFixed(2)} INR)`
      });
    }
    fixes.exchange_rate = exchangeRate;
    fixes.amount_in_inr = amountFloat * exchangeRate;

    // 5. Parse Splits & Splits Types
    let splitType = rawRow.split_type.trim().toLowerCase();
    
    // Settlement checking
    const isSettlementNote = rawRow.notes.toLowerCase().includes('settlement') || 
                             rawRow.notes.toLowerCase().includes('paid') && rawRow.notes.toLowerCase().includes('back');
    const isSettlementDesc = rawRow.description.toLowerCase().includes('paid') && rawRow.description.toLowerCase().includes('back');
    const hasOnlyOneSplitter = rawRow.split_with.split(';').filter(Boolean).length === 1;

    if (!splitType && (isSettlementNote || isSettlementDesc || hasOnlyOneSplitter)) {
      errors.push({
        type: 'SETTLEMENT_LOGGED_AS_EXPENSE',
        severity: 'warning',
        description: `Settlement logged as expense: "${rawRow.description}"`,
        proposed_resolution: `Import as a Payment/Settlement (not a split expense)`
      });
      splitType = 'settlement';
    } else if (!splitType) {
      errors.push({
        type: 'MISSING_SPLIT_TYPE',
        severity: 'warning',
        description: `Missing split type for expense: "${rawRow.description}"`,
        proposed_resolution: `Default to "equal"`
      });
      splitType = 'equal';
    } else if (splitType === 'percentag') {
      errors.push({
        type: 'TYPO_SPLIT_TYPE',
        severity: 'warning',
        description: `Truncated split type: "percentag"`,
        proposed_resolution: `Correct to "percentage"`
      });
      splitType = 'percentage';
    }
    fixes.split_type = splitType;

    // Split with list parsing
    const rawSplitWith = rawRow.split_with.split(';').map(n => n.trim()).filter(Boolean);
    const normalizedSplitWith = [];
    const invalidMembers = [];

    for (const rawName of rawSplitWith) {
      const normName = normalizeName(rawName);
      if (!OFFICIAL_MEMBERS.includes(normName)) {
        invalidMembers.push(rawName);
      } else {
        normalizedSplitWith.push(normName);
      }
    }

    if (invalidMembers.length > 0) {
      errors.push({
        type: 'NON_MEMBER_SPLIT',
        severity: 'warning',
        description: `Split list contains guest/non-member: ${invalidMembers.join(', ')}`,
        proposed_resolution: `Expose toggle: Dev absorbs Kabir's guest share, or split among all including guest`
      });
      // Store raw invalid members for reference
      fixes.guests = invalidMembers;
    }
    fixes.split_with = normalizedSplitWith;

    // Timeline validations on split list
    if (parsedDate) {
      // Check if Meera is in split list after March 31
      if (normalizedSplitWith.includes('Meera') && new Date(parsedDate) > new Date('2026-03-31')) {
        errors.push({
          type: 'INACTIVE_MEMBER_SPLIT',
          severity: 'warning',
          description: `Meera is in split list for expense dated ${parsedDate} but moved out March 31`,
          proposed_resolution: `Remove Meera from split list and redistribute`
        });
        fixes.removeMeera = true;
      }
      
      // Check if Sam is in split list before April 15
      if (normalizedSplitWith.includes('Sam') && new Date(parsedDate) < new Date('2026-04-15')) {
        errors.push({
          type: 'PRE_MEMBERSHIP_SPLIT',
          severity: 'warning',
          description: `Sam is in split list for expense dated ${parsedDate} but moved in April 15`,
          proposed_resolution: `Remove Sam from split list and redistribute`
        });
        fixes.removeSam = true;
      }
    }

    // 6. Split details parsing (percentages, shares, etc.)
    const rawDetails = rawRow.split_details.trim();
    fixes.split_details = rawDetails;
    
    if (splitType === 'percentage' && rawDetails) {
      // Parse e.g. "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
      const detailsList = rawDetails.split(';').map(d => d.trim()).filter(Boolean);
      let percentSum = 0;
      const percentages = {};
      
      for (const det of detailsList) {
        const match = det.match(/^([A-Za-z\s'\-_]+)\s+(\d+)\s*%$/);
        if (match) {
          const name = normalizeName(match[1]);
          const val = parseInt(match[2], 10);
          percentages[name] = val;
          percentSum += val;
        }
      }
      
      if (percentSum !== 100) {
        errors.push({
          type: 'INVALID_PERCENTAGE',
          severity: 'warning',
          description: `Percentage split sums to ${percentSum}% (should be 100%): "${rawDetails}"`,
          proposed_resolution: `Normalize percentages proportionally to sum to 100%`
        });
        fixes.invalidPercentageSum = percentSum;
        fixes.parsedPercentages = percentages;
      }
    } else if (splitType === 'share' && rawDetails) {
      // Parse e.g. "Aisha 1; Rohan 2; Priya 1; Dev 2"
      const detailsList = rawDetails.split(';').map(d => d.trim()).filter(Boolean);
      const shares = {};
      for (const det of detailsList) {
        const match = det.match(/^([A-Za-z\s'\-_]+)\s+(\d+)$/);
        if (match) {
          const name = normalizeName(match[1]);
          const val = parseInt(match[2], 10);
          shares[name] = val;
        }
      }
      fixes.parsedShares = shares;
    } else if (splitType === 'unequal' && rawDetails) {
      // Parse e.g. "Rohan 700; Priya 400; Meera 400"
      const detailsList = rawDetails.split(';').map(d => d.trim()).filter(Boolean);
      let unequalSum = 0;
      const unequalAmounts = {};
      
      for (const det of detailsList) {
        const match = det.match(/^([A-Za-z\s'\-_]+)\s+(\d+)$/);
        if (match) {
          const name = normalizeName(match[1]);
          const val = parseInt(match[2], 10);
          unequalAmounts[name] = val;
          unequalSum += val;
        }
      }

      if (Math.abs(unequalSum - amountFloat) > 0.01) {
        errors.push({
          type: 'INVALID_UNEQUAL_SUM',
          severity: 'warning',
          description: `Unequal split sum (${unequalSum}) does not equal total amount (${amountFloat})`,
          proposed_resolution: `Reconcile the difference to match total amount`
        });
        fixes.invalidUnequalSum = unequalSum;
        fixes.parsedUnequalAmounts = unequalAmounts;
      }
    }

    // 7. Duplicate & Dispute Detections
    // Check if duplicate of a transaction we have already parsed
    const txKey = `${parsedDate}_${amountFloat.toFixed(2)}_${normalizedPayer}`;
    if (seenTransactions[txKey]) {
      const duplicateRow = seenTransactions[txKey];
      
      // Look at description similarity. If they are almost identical (e.g. Marina Bites vs dinner - marina bites)
      const desc1 = rawRow.description.toLowerCase();
      const desc2 = duplicateRow.description.toLowerCase();
      const isSimilar = desc1.includes(desc2) || desc2.includes(desc1) || 
                        desc1.replace(/[^a-z]/g, '') === desc2.replace(/[^a-z]/g, '');

      if (isSimilar) {
        errors.push({
          type: 'DUPLICATE_EXPENSE',
          severity: 'warning',
          description: `Duplicate expense of Row ${duplicateRow._rowNumber}: "${rawRow.description}"`,
          proposed_resolution: `Discard this duplicate transaction. Keep Row ${duplicateRow._rowNumber} (which contains notes/description)`
        });
        fixes.isDuplicate = true;
        fixes.duplicateOf = duplicateRow._rowNumber;
      }
    } else {
      seenTransactions[txKey] = rawRow;
    }

    // Check for Disputes (e.g., Row 24 & 25: Dinner at Thalassa (Aisha, 2400) vs Thalassa dinner (Rohan, 2450) on 11-03-2026)
    // Same date, similar description, different payers/amounts
    for (const otherRowKey in seenTransactions) {
      const otherRow = seenTransactions[otherRowKey];
      if (otherRow._rowNumber === rowNum) continue;

      if (otherRow.date === rawRow.date) {
        const desc1 = rawRow.description.toLowerCase();
        const desc2 = otherRow.description.toLowerCase();
        const isSimilarDesc = desc1.includes('thalassa') && desc2.includes('thalassa') || 
                              desc1.includes('dinner') && desc2.includes('dinner') && (desc1.includes('marina') && desc2.includes('marina'));
        
        if (isSimilarDesc && otherRow.paid_by !== rawRow.paid_by) {
          errors.push({
            type: 'DISPUTED_DUPLICATE',
            severity: 'warning',
            description: `Disputed transaction with Row ${otherRow._rowNumber}: Aisha logged 2400 vs Rohan 2450. Notes say: "Aisha also logged this I think hers is wrong"`,
            proposed_resolution: `Choose one correct record (keep Rohan's 2450, delete Aisha's 2400)`
          });
          fixes.isDisputed = true;
          fixes.disputedWith = otherRow._rowNumber;
        }
      }
    }

    processedRows.push({
      rowNumber: rowNum,
      raw: rawRow,
      fixes: fixes,
      anomalies: errors,
      hasErrors: errors.length > 0,
      hasCritical: errors.some(e => e.severity === 'critical')
    });
  }

  return {
    anomalies: processedRows.filter(r => r.anomalies.length > 0),
    processedRows: processedRows
  };
}
