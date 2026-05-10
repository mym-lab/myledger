// ─── BIR-aligned transaction categories ──────────────────────

export const INCOME_CATEGORIES = [
  'Sale of Goods',
  'Sale of Services',
  'Professional Fees',
  'Rental Income',
  'Interest Income',
  'Commission Income',
  'Dividend Income',
  'Other Income',
];

export const EXPENSE_CATEGORIES = [
  'Cost of Goods Sold',
  'Salaries & Wages',
  'Rent',
  'Utilities',
  'Office Supplies',
  'Advertising & Marketing',
  'Transportation & Travel',
  'Professional Fees',
  'Repairs & Maintenance',
  'Bank Charges & Fees',
  'Taxes & Licenses',
  'Depreciation',
  'Insurance',
  'Interest Expense',
  'Other Expenses',
];

export const TAX_TYPES = [
  { code: '2550M',   label: '2550M  — Monthly VAT Return' },
  { code: '2550Q',   label: '2550Q  — Quarterly VAT Return' },
  { code: '1601C',   label: '1601-C — WHT on Compensation' },
  { code: '1601EQ',  label: '1601-EQ — Expanded WHT (Quarterly)' },
  { code: '1702Q',   label: '1702Q  — Quarterly IT (Corporation)' },
  { code: '1702',    label: '1702   — Annual IT (Corporation)' },
  { code: '1701Q',   label: '1701Q  — Quarterly IT (Individual)' },
  { code: '1701',    label: '1701   — Annual IT (Individual)' },
  { code: '1550',    label: '1550   — Documentary Stamp Tax' },
];
