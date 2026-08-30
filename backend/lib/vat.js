// ─── VAT / Tax Calculation Library ────────────────────────────────────────────
// Philippine VAT = 12%
// OPT (Percentage Tax) = configurable rate, default 3%
//
// Income vatType:
//   'vatable'    → user enters NET, system adds 12% VAT, GROSS = NET × 1.12
//   'zero_rated' → user enters amount = NET = GROSS, VAT = 0 (exporters etc.)
//   'exempt'     → user enters amount = NET = GROSS, VAT = 0 (Sec. 109 NIRC)
//
// For OPT clients (taxRegime === 'opt'):
//   user enters GROSS sales, OPT = GROSS × optRate, NET = GROSS for P&L
//
// Expense supplierVatType:
//   'vat'     → user enters GROSS (inc. VAT), NET = GROSS/1.12, VAT extracted
//   'non_vat' → user enters amount = NET = GROSS, VAT = 0

const round = (n) => Math.round(n * 100) / 100;

export function calculateIncomeVAT(amount, vatType = 'vatable', isOPT = false, optRate = 0.03) {
  if (isOPT) {
    // OPT: amount is GROSS sales
    return {
      net:           amount,
      vat:           0,
      gross:         amount,
      percentageTax: round(amount * optRate),
      taxType:       'opt',
    };
  }
  if (vatType === 'zero_rated') {
    return { net: amount, vat: 0, gross: amount, percentageTax: 0, taxType: 'zero_rated' };
  }
  if (vatType === 'exempt') {
    return { net: amount, vat: 0, gross: amount, percentageTax: 0, taxType: 'exempt' };
  }
  // Standard vatable 12%
  return {
    net:           amount,
    vat:           round(amount * 0.12),
    gross:         round(amount * 1.12),
    percentageTax: 0,
    taxType:       'vatable',
  };
}

export function calculateExpenseVAT(amount, supplierVatType = 'vat', vatOverride = null) {
  if (supplierVatType === 'non_vat') {
    return { net: amount, vat: 0, gross: amount };
  }
  // VAT supplier — amount is GROSS.
  // vatOverride: manually entered VAT from invoice — handles mixed-VAT invoices
  // (service charge, SC/PWD split, partial exemptions, etc.)
  if (vatOverride != null && vatOverride >= 0) {
    const vat = round(vatOverride);
    const net = round(amount - vat);
    return { net, vat, gross: amount, vatOverridden: true };
  }
  const net = round(amount / 1.12);
  const vat = round(amount - net);
  return { net, vat, gross: amount };
}
