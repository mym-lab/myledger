// ─── BIR eBIRForms XML Export ──────────────────────────────────────────────────
// GET /api/bir/export-xml?clientId=&form=2550M&year=2026&month=7
//
// Generates pre-filled XML data for eBIRForms-compatible forms.
// The output follows BIR form field structure for:
//   2550M / 2550Q  — VAT Declaration (Monthly / Quarterly)
//   2551M / 2551Q  — Percentage Tax (Monthly / Quarterly)
//   1601C          — WHT on Compensation
//   1601EQ         — Expanded Withholding Tax (Quarterly)
//
// IMPORTANT: This export is a DATA FILE, not a direct eBIRForms import.
// Use it as a pre-filled reference when encoding into the eBIRForms offline package.
// Field labels match BIR form boxes/lines as of 2024 ENCS editions.

import { Router }          from 'express';
import { db, rowToClient, rowToTx } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { requireTier } from '../middleware/tierGuard.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);
router.use(requireTier('solo')); // eBIR XML export: solo+ only

const round  = n => Math.round((n || 0) * 100) / 100;
const sum    = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);
const f2     = n => Number(n || 0).toFixed(2);
const xmlEsc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtTxByClient = db.prepare('SELECT * FROM transactions WHERE client_id=? AND voided_at IS NULL');
const stmtEmployees  = db.prepare('SELECT * FROM employees WHERE client_id=?');

function canAccess(c, uid) { return c.ownerId === uid || c.accountantId === uid; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function monthBounds(year, month) {
  const m = String(month).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${m}-01`, to: `${year}-${m}-${last}` };
}
function quarterBounds(year, month) {
  const q = Math.ceil(month / 3);
  const qs = (q - 1) * 3 + 1;
  const qe = q * 3;
  const last = new Date(year, qe, 0).getDate();
  return {
    from: `${year}-${String(qs).padStart(2,'0')}-01`,
    to:   `${year}-${String(qe).padStart(2,'0')}-${last}`,
    q, qs, qe,
  };
}
function filterPeriod(txns, from, to) {
  return txns.filter(t => t.createdAt >= from && t.createdAt <= to + 'T23:59:59');
}

// ── WHT computation ───────────────────────────────────────────────────────────
function annualWHT(annual) {
  if (annual <= 250000)   return 0;
  if (annual <= 400000)   return (annual - 250000) * 0.20;
  if (annual <= 800000)   return 30000  + (annual - 400000) * 0.25;
  if (annual <= 2000000)  return 130000 + (annual - 800000) * 0.30;
  if (annual <= 8000000)  return 490000 + (annual - 2000000) * 0.32;
  return 2410000 + (annual - 8000000) * 0.35;
}
function empMonthlyWHT(emp) {
  const basic = parseFloat(emp.monthly_basic_salary) || 0;
  const ded   = (parseFloat(emp.sss_contribution) || 0)
              + (parseFloat(emp.philhealth_contribution) || 0)
              + (parseFloat(emp.pagibig_contribution) || 0);
  return round(annualWHT(Math.max(0, basic - ded) * 12) / 12);
}

// ── XML builders ─────────────────────────────────────────────────────────────

function xml2550M(client, txns, year, month) {
  const { from, to } = monthBounds(year, month);
  const period = filterPeriod(txns, from, to);
  const income  = period.filter(t => t.type === 'income');
  const expense = period.filter(t => t.type === 'expense');

  const vatableSales  = round(sum(income.filter(t => !t.vatType || t.vatType === 'vatable'), 'amount_net'));
  const zeroRated     = round(sum(income.filter(t => t.vatType === 'zero_rated'), 'amount_net'));
  const exempt        = round(sum(income.filter(t => t.vatType === 'exempt'), 'amount_net'));
  const totalSales    = round(vatableSales + zeroRated + exempt);
  const outputVAT     = round(vatableSales * 0.12);

  const vatPurchases  = round(sum(expense.filter(t => !t.supplierVatType || t.supplierVatType === 'vat'), 'amount_net'));
  const nonVatPurch   = round(sum(expense.filter(t => t.supplierVatType === 'non_vat'), 'amount_gross'));
  const inputVAT      = round(sum(expense.filter(t => !t.supplierVatType || t.supplierVatType === 'vat'), 'amount_vat'));

  const vatPayable    = round(Math.max(0, outputVAT - inputVAT));
  const vatCredit     = round(Math.max(0, inputVAT - outputVAT));
  const monthName     = new Date(year, month - 1, 1).toLocaleString('en-PH', { month: 'long' });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 2550M — Monthly Value-Added Tax Declaration
     Tax Period: ${monthName} ${year}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     NOTE: Pre-fill reference for eBIRForms offline package.
           Verify all amounts before filing.
     ================================================================ -->
<BIR_Form_2550M>

  <!-- ─── PART I: BACKGROUND INFORMATION ─── -->
  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <ZipCode></ZipCode>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <LineOfBusiness>${xmlEsc(client.lineOfBusiness || '')}</LineOfBusiness>
    <TelephoneNumber>${xmlEsc(client.telephone || '')}</TelephoneNumber>

    <TaxablePeriod>
      <Month>${String(month).padStart(2,'0')}</Month>
      <Year>${year}</Year>
      <FromDate>${from}</FromDate>
      <ToDate>${to}</ToDate>
    </TaxablePeriod>

    <AmendedReturn>No</AmendedReturn>
  </PartI_BackgroundInformation>

  <!-- ─── PART II: COMPUTATION OF VAT ─── -->
  <PartII_ComputationOfVAT>

    <!-- Schedule 1: Sales/Receipts and Output Tax -->
    <Schedule1_OutputVAT>
      <!-- Line 1: Taxable Sales/Receipts (NET — VAT exclusive) -->
      <Line1_VatableSalesReceipts>${f2(vatableSales)}</Line1_VatableSalesReceipts>
      <!-- Line 2: Zero-Rated Sales/Receipts -->
      <Line2_ZeroRatedSales>${f2(zeroRated)}</Line2_ZeroRatedSales>
      <!-- Line 3: Exempt Sales/Receipts -->
      <Line3_ExemptSales>${f2(exempt)}</Line3_ExemptSales>
      <!-- Line 4: Total Sales/Receipts (Sum of Lines 1-3) -->
      <Line4_TotalSalesReceipts>${f2(totalSales)}</Line4_TotalSalesReceipts>
      <!-- Line 5: Output Tax Due (Line 1 × 12%) -->
      <Line5_OutputTaxDue>${f2(outputVAT)}</Line5_OutputTaxDue>
    </Schedule1_OutputVAT>

    <!-- Schedule 2: Purchases/Importations and Input Tax -->
    <Schedule2_InputVAT>
      <!-- Line 6A: Domestic Purchases (VAT Registered Suppliers) -->
      <Line6A_VatPurchases>${f2(vatPurchases)}</Line6A_VatPurchases>
      <Line6A_InputVAT>${f2(inputVAT)}</Line6A_InputVAT>
      <!-- Line 6B: Non-VAT Domestic Purchases -->
      <Line6B_NonVatPurchases>${f2(nonVatPurch)}</Line6B_NonVatPurchases>
      <!-- Line 7: Total Available Input Tax -->
      <Line7_TotalInputVAT>${f2(inputVAT)}</Line7_TotalInputVAT>
    </Schedule2_InputVAT>

    <!-- Schedule 3: Computation of VAT Payable / Refundable -->
    <Schedule3_VATPayable>
      <!-- Line 10: Output Tax (from Line 5) -->
      <Line10_OutputTax>${f2(outputVAT)}</Line10_OutputTax>
      <!-- Line 14: Total Input Tax (from Line 7) -->
      <Line14_TotalInputTax>${f2(inputVAT)}</Line14_TotalInputTax>
      <!-- Line 15: VAT Payable (Line 10 minus Line 14) -->
      <Line15_VATPayable>${f2(vatPayable)}</Line15_VATPayable>
      <!-- Line 20: VAT Credit/Excess (if Input exceeds Output) -->
      <Line20_ExcessInputVAT>${f2(vatCredit)}</Line20_ExcessInputVAT>
    </Schedule3_VATPayable>

  </PartII_ComputationOfVAT>

  <!-- ─── PART III: PAYMENT ─── -->
  <PartIII_Payment>
    <AmountDue>${f2(vatPayable)}</AmountDue>
    <PaymentOption>${vatPayable > 0 ? 'Electronic Filing and Payment System (eFPS)' : 'No payment due'}</PaymentOption>
    <DueDate>${year}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}-20</DueDate>
  </PartIII_Payment>

  <!-- ─── METADATA ─── -->
  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <FormVersion>April 2003 (Revised)</FormVersion>
    <Disclaimer>Pre-fill reference only. Verify amounts against official receipts before filing.</Disclaimer>
  </ExportMetadata>

</BIR_Form_2550M>`;
}

function xml2550Q(client, txns, year, month) {
  const { from, to, q, qs, qe } = quarterBounds(year, month);
  const period = filterPeriod(txns, from, to);
  const income  = period.filter(t => t.type === 'income');
  const expense = period.filter(t => t.type === 'expense');

  const vatableSales  = round(sum(income.filter(t => !t.vatType || t.vatType === 'vatable'), 'amount_net'));
  const zeroRated     = round(sum(income.filter(t => t.vatType === 'zero_rated'), 'amount_net'));
  const exempt        = round(sum(income.filter(t => t.vatType === 'exempt'), 'amount_net'));
  const totalSales    = round(vatableSales + zeroRated + exempt);
  const outputVAT     = round(vatableSales * 0.12);
  const inputVAT      = round(sum(expense.filter(t => !t.supplierVatType || t.supplierVatType === 'vat'), 'amount_vat'));
  const vatPayable    = round(Math.max(0, outputVAT - inputVAT));
  const vatCredit     = round(Math.max(0, inputVAT - outputVAT));
  const qLabel        = `Q${q} (${new Date(year,qs-1,1).toLocaleString('en-PH',{month:'short'})}–${new Date(year,qe-1,1).toLocaleString('en-PH',{month:'short'})}) ${year}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 2550Q — Quarterly Value-Added Tax Return
     Tax Period: ${qLabel}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     ================================================================ -->
<BIR_Form_2550Q>

  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <TaxablePeriod>
      <Quarter>Q${q}</Quarter>
      <Year>${year}</Year>
      <FromDate>${from}</FromDate>
      <ToDate>${to}</ToDate>
    </TaxablePeriod>
  </PartI_BackgroundInformation>

  <PartII_ComputationOfVAT>
    <Schedule1_OutputVAT>
      <VatableSalesReceipts>${f2(vatableSales)}</VatableSalesReceipts>
      <ZeroRatedSales>${f2(zeroRated)}</ZeroRatedSales>
      <ExemptSales>${f2(exempt)}</ExemptSales>
      <TotalSalesReceipts>${f2(totalSales)}</TotalSalesReceipts>
      <OutputTaxDue>${f2(outputVAT)}</OutputTaxDue>
    </Schedule1_OutputVAT>
    <Schedule2_InputVAT>
      <TotalAvailableInputVAT>${f2(inputVAT)}</TotalAvailableInputVAT>
    </Schedule2_InputVAT>
    <Schedule3_VATPayable>
      <OutputTax>${f2(outputVAT)}</OutputTax>
      <InputTaxApplied>${f2(inputVAT)}</InputTaxApplied>
      <VATPayable>${f2(vatPayable)}</VATPayable>
      <ExcessInputVAT>${f2(vatCredit)}</ExcessInputVAT>
    </Schedule3_VATPayable>
  </PartII_ComputationOfVAT>

  <PartIII_Payment>
    <AmountDue>${f2(vatPayable)}</AmountDue>
    <DueDateNote>25th day after close of each taxable quarter</DueDateNote>
  </PartIII_Payment>

  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  </ExportMetadata>

</BIR_Form_2550Q>`;
}

function xml2551M(client, txns, year, month) {
  const { from, to } = monthBounds(year, month);
  const period    = filterPeriod(txns, from, to);
  const income    = period.filter(t => t.type === 'income' && t.vatType === 'opt');
  const optRate   = parseFloat(client.optRate) || 0.03;
  const grossSales = round(sum(income, 'amount_gross'));
  const ptax       = round(grossSales * optRate);
  const monthName  = new Date(year, month - 1, 1).toLocaleString('en-PH', { month: 'long' });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 2551M — Monthly Percentage Tax Return
     Tax Period: ${monthName} ${year}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     ================================================================ -->
<BIR_Form_2551M>

  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <TaxablePeriod>
      <Month>${String(month).padStart(2,'0')}</Month>
      <Year>${year}</Year>
    </TaxablePeriod>
    <TaxpayerClassification>Non-VAT Registered (OPT)</TaxpayerClassification>
  </PartI_BackgroundInformation>

  <PartII_ComputationOfPercentageTax>
    <!-- Line 1: Gross Sales/Receipts -->
    <Line1_GrossSalesReceipts>${f2(grossSales)}</Line1_GrossSalesReceipts>
    <!-- Line 2: Applicable Tax Rate -->
    <Line2_TaxRate>${(optRate * 100).toFixed(0)}%</Line2_TaxRate>
    <!-- Line 3: Tax Due (Line 1 × Line 2) -->
    <Line3_TaxDue>${f2(ptax)}</Line3_TaxDue>
    <!-- Line 4: Tax Withheld -->
    <Line4_TaxWithheld>0.00</Line4_TaxWithheld>
    <!-- Line 5: Tax Payable (Line 3 minus Line 4) -->
    <Line5_TaxPayable>${f2(ptax)}</Line5_TaxPayable>
  </PartII_ComputationOfPercentageTax>

  <PartIII_Payment>
    <AmountDue>${f2(ptax)}</AmountDue>
    <DueDate>20th day of the following month</DueDate>
  </PartIII_Payment>

  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  </ExportMetadata>

</BIR_Form_2551M>`;
}

function xml2551Q(client, txns, year, month) {
  const { from, to, q } = quarterBounds(year, month);
  const period    = filterPeriod(txns, from, to);
  const income    = period.filter(t => t.type === 'income' && t.vatType === 'opt');
  const optRate   = parseFloat(client.optRate) || 0.03;
  const grossSales = round(sum(income, 'amount_gross'));
  const ptax       = round(grossSales * optRate);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 2551Q — Quarterly Percentage Tax Return
     Tax Period: Q${q} ${year}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     ================================================================ -->
<BIR_Form_2551Q>

  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <TaxablePeriod>
      <Quarter>Q${q}</Quarter>
      <Year>${year}</Year>
      <FromDate>${from}</FromDate>
      <ToDate>${to}</ToDate>
    </TaxablePeriod>
  </PartI_BackgroundInformation>

  <PartII_ComputationOfPercentageTax>
    <GrossSalesReceipts>${f2(grossSales)}</GrossSalesReceipts>
    <TaxRate>${(optRate * 100).toFixed(0)}%</TaxRate>
    <TaxDue>${f2(ptax)}</TaxDue>
    <TaxWithheld>0.00</TaxWithheld>
    <TaxPayable>${f2(ptax)}</TaxPayable>
  </PartII_ComputationOfPercentageTax>

  <PartIII_Payment>
    <AmountDue>${f2(ptax)}</AmountDue>
    <DueDateNote>25th day after close of each taxable quarter</DueDateNote>
  </PartIII_Payment>

  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  </ExportMetadata>

</BIR_Form_2551Q>`;
}

function xml1601C(client, year, month) {
  const employees = stmtEmployees.all(client.id);
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-PH', { month: 'long' });

  const empRows = employees.map(e => {
    const basic  = parseFloat(e.monthly_basic_salary) || 0;
    const wht    = empMonthlyWHT(e);
    const totalComp = basic * 12;
    return { name: e.name, tin: e.tin || '', basic, wht, totalComp };
  });

  const totalCompensation = round(empRows.reduce((s, e) => s + e.basic, 0));
  const totalWHT          = round(empRows.reduce((s, e) => s + e.wht,   0));

  const empXml = empRows.map(e => `
    <Employee>
      <Name>${xmlEsc(e.name)}</Name>
      <TIN>${xmlEsc(e.tin)}</TIN>
      <MonthlyBasicSalary>${f2(e.basic)}</MonthlyBasicSalary>
      <MonthlyWHT>${f2(e.wht)}</MonthlyWHT>
    </Employee>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 1601-C — Monthly Remittance Return of Income Taxes
                        Withheld on Compensation
     Tax Period: ${monthName} ${year}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     ================================================================ -->
<BIR_Form_1601C>

  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <TelephoneNumber>${xmlEsc(client.telephone || '')}</TelephoneNumber>
    <TaxablePeriod>
      <Month>${String(month).padStart(2,'0')}</Month>
      <Year>${year}</Year>
    </TaxablePeriod>
    <Category>Private</Category>
  </PartI_BackgroundInformation>

  <PartII_TaxWithheld>
    <!-- Schedule 1: Employees and Withholding -->
    <EmployeeCount>${employees.length}</EmployeeCount>
    <TotalMonthlyCompensation>${f2(totalCompensation)}</TotalMonthlyCompensation>
    <!-- Box 1: Total Compensation Paid -->
    <Box1_TotalCompensationPaid>${f2(totalCompensation)}</Box1_TotalCompensationPaid>
    <!-- Box 2: Tax Required to be Withheld -->
    <Box2_TaxRequiredToBeWithheld>${f2(totalWHT)}</Box2_TaxRequiredToBeWithheld>
    <!-- Box 3: Adjustments / Prior Month WHT Carried Over -->
    <Box3_AdjustmentsOrCredits>0.00</Box3_AdjustmentsOrCredits>
    <!-- Box 4: Tax Still to be Withheld -->
    <Box4_TaxStillDue>${f2(totalWHT)}</Box4_TaxStillDue>
  </PartII_TaxWithheld>

  <PartIII_Payment>
    <AmountDue>${f2(totalWHT)}</AmountDue>
    <DueDate>10th day of the following month</DueDate>
  </PartIII_Payment>

  <!-- ─── SCHEDULE 1: Employee Detail ─── -->
  <Schedule1_EmployeeList>${empXml}
  </Schedule1_EmployeeList>

  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <EmployeeCount>${employees.length}</EmployeeCount>
    <Disclaimer>Monthly WHT computed using graduated tax table (TRAIN Law). Verify with actual payroll records.</Disclaimer>
  </ExportMetadata>

</BIR_Form_1601C>`;
}

function xml1601EQ(client, txns, year, month) {
  const { from, to, q } = quarterBounds(year, month);
  const period   = filterPeriod(txns, from, to);
  const expense  = period.filter(t => t.type === 'expense' && (t.ewtAmount || 0) > 0);
  const totalEWT = round(sum(expense, 'ewtAmount'));

  const ewtRows = expense.map(e => `
    <Payment>
      <Date>${(e.createdAt||'').substring(0,10)}</Date>
      <PayeeName>${xmlEsc(e.counterpartyName || '')}</PayeeName>
      <PayeeTIN>${xmlEsc(e.counterpartyTin || '')}</PayeeTIN>
      <GrossAmount>${f2(e.amount_gross)}</GrossAmount>
      <EWTRate>${f2((e.ewtRate || 0) * 100)}%</EWTRate>
      <EWTAmount>${f2(e.ewtAmount)}</EWTAmount>
    </Payment>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ================================================================
     BIR Form 1601-EQ — Quarterly Remittance Return of Creditable
                         Income Taxes Withheld (Expanded)
     Tax Period: Q${q} ${year}
     Generated: ${new Date().toISOString()}
     Taxpayer: ${xmlEsc(client.tradeName)}
     ================================================================ -->
<BIR_Form_1601EQ>

  <PartI_BackgroundInformation>
    <TIN>${xmlEsc(client.tin || 'XXX-XXX-XXX-XXX')}</TIN>
    <RegisteredName>${xmlEsc(client.tradeName)}</RegisteredName>
    <RegisteredAddress>${xmlEsc(client.address || '')}</RegisteredAddress>
    <RDOCode>${xmlEsc(client.rdoCode || '')}</RDOCode>
    <TaxablePeriod>
      <Quarter>Q${q}</Quarter>
      <Year>${year}</Year>
      <FromDate>${from}</FromDate>
      <ToDate>${to}</ToDate>
    </TaxablePeriod>
  </PartI_BackgroundInformation>

  <PartII_TaxWithheld>
    <TotalPaymentsSubjectToEWT>${f2(round(sum(expense, 'amount_gross')))}</TotalPaymentsSubjectToEWT>
    <TotalEWTWithheld>${f2(totalEWT)}</TotalEWTWithheld>
    <AmountRemitted>0.00</AmountRemitted>
    <TaxStillDue>${f2(totalEWT)}</TaxStillDue>
  </PartII_TaxWithheld>

  <PartIII_Payment>
    <AmountDue>${f2(totalEWT)}</AmountDue>
    <DueDateNote>25th day after close of each taxable quarter</DueDateNote>
  </PartIII_Payment>

  <!-- ─── SCHEDULE — Payments Subject to EWT ─── -->
  <Schedule_EWT_Payments>${ewtRows || '\n    <!-- No EWT payments found for this period -->'}
  </Schedule_EWT_Payments>

  <ExportMetadata>
    <GeneratedBy>MyLedger</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  </ExportMetadata>

</BIR_Form_1601EQ>`;
}

// ── Route ─────────────────────────────────────────────────────────────────────
// GET /api/bir/export-xml?clientId=&form=2550M&year=2026&month=7
router.get('/export-xml', (req, res, next) => {
  try {
    const { clientId, form, year: ys, month: ms } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (!form)     return res.status(400).json({ error: 'form required (2550M | 2550Q | 2551M | 2551Q | 1601C | 1601EQ)' });

    const year  = parseInt(ys)  || new Date().getFullYear();
    const month = parseInt(ms)  || (new Date().getMonth() + 1);

    const clientRow = stmtClientById.get(clientId);
    const client    = clientRow ? rowToClient(clientRow) : null;
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const txns = stmtTxByClient.all(clientId).map(rowToTx);

    let xml, filename;
    const periodTag = `${year}${String(month).padStart(2,'0')}`;
    const safeName  = (client.tradeName || 'client').replace(/[^a-zA-Z0-9_-]/g, '_');

    switch (form.toUpperCase()) {
      case '2550M':
        xml = xml2550M(client, txns, year, month);
        filename = `${safeName}_2550M_${periodTag}.xml`;
        break;
      case '2550Q':
        xml = xml2550Q(client, txns, year, month);
        filename = `${safeName}_2550Q_Q${Math.ceil(month/3)}_${year}.xml`;
        break;
      case '2551M':
        xml = xml2551M(client, txns, year, month);
        filename = `${safeName}_2551M_${periodTag}.xml`;
        break;
      case '2551Q':
        xml = xml2551Q(client, txns, year, month);
        filename = `${safeName}_2551Q_Q${Math.ceil(month/3)}_${year}.xml`;
        break;
      case '1601C':
        xml = xml1601C(client, year, month);
        filename = `${safeName}_1601C_${periodTag}.xml`;
        break;
      case '1601EQ':
        xml = xml1601EQ(client, txns, year, month);
        filename = `${safeName}_1601EQ_Q${Math.ceil(month/3)}_${year}.xml`;
        break;
      default:
        return res.status(400).json({ error: `Unsupported form: ${form}. Supported: 2550M, 2550Q, 2551M, 2551Q, 1601C, 1601EQ` });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);

  } catch (err) { next(err); }
});

export default router;
