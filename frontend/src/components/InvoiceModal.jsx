// ─── InvoiceModal.jsx ────────────────────────────────────────────────────────
// Exports:
//   InvoicesTab   — full invoice list + actions (used in ClientInterface + AccountantPortal)
//   InvoiceFormModal — create / edit invoice modal (used internally)

import { useState, useEffect } from 'react';
import {
  getInvoices, createInvoice, updateInvoice,
  markInvoiceSent, markInvoicePaid, voidInvoice, deleteInvoice,
} from '../api.js';

// ─── Design tokens (matches ClientInterface apple-light theme) ────────────────
const T = {
  bg: '#f5f5f7', surface: '#ffffff', border: '#d2d2d7',
  text: '#1d1d1f', muted: '#6e6e73', accent: '#0071e3',
  green: '#34c759', orange: '#ff9500', red: '#ff3b30',
  radius: '12px', shadow: '0 2px 12px rgba(0,0,0,0.08)',
};

const peso = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_COLORS = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  sent:  { bg: '#eff6ff', text: '#1d4ed8' },
  paid:  { bg: '#f0fdf4', text: '#15803d' },
  void:  { bg: '#fef2f2', text: '#dc2626' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
      background: c.bg, color: c.text,
    }}>
      {status}
    </span>
  );
}

// ─── INVOICE FORM MODAL ───────────────────────────────────────────────────────

export function InvoiceFormModal({ clientId, invoice, onClose, onSaved }) {
  const isEdit = !!invoice;

  const emptyItem = () => ({ key: Date.now() + Math.random(), description: '', quantity: 1, unit_price: 0, line_vat_type: 'vatable' });

  const [form, setForm] = useState({
    customer_name:    invoice?.customer_name    || '',
    customer_email:   invoice?.customer_email   || '',
    customer_address: invoice?.customer_address || '',
    customer_tin:     invoice?.customer_tin     || '',
    issue_date:       invoice?.issue_date       || new Date().toISOString().slice(0, 10),
    due_date:         invoice?.due_date         || '',
    payment_terms:    invoice?.payment_terms    || 'Due on Receipt',
    notes:            invoice?.notes            || '',
    vat_type:         invoice?.vat_type         || 'vatable',
    invoice_prefix:   invoice?.invoice_prefix   || 'INV',
    items: invoice?.items?.length
      ? invoice.items.map(i => ({ ...i, key: i.id || Math.random(), line_vat_type: i.line_vat_type || 'vatable' }))
      : [emptyItem()],
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function setItem(idx, k, v) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [k]: v };
      return { ...f, items };
    });
  }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, emptyItem()] })); }

  function removeItem(idx) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  // Live totals — per-line VAT awareness
  let subtotal  = 0;
  let vatAmount = 0;
  for (const i of form.items) {
    const lineAmt     = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
    const lineVatType = i.line_vat_type || form.vat_type;
    subtotal  += lineAmt;
    if (lineVatType === 'vatable') vatAmount += lineAmt * 0.12;
  }
  subtotal  = Math.round(subtotal  * 100) / 100;
  vatAmount = Math.round(vatAmount * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customer_name.trim()) { setErr('Customer name is required'); return; }
    if (!form.items.some(i => i.description.trim())) { setErr('At least one line item is required'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        client_id: clientId,
        ...form,
        items: form.items
          .filter(i => i.description.trim())
          .map(i => ({
            description:   i.description,
            quantity:      parseFloat(i.quantity) || 1,
            unit_price:    parseFloat(i.unit_price) || 0,
            line_vat_type: i.line_vat_type || 'vatable',
          })),
      };
      if (isEdit) {
        await updateInvoice(invoice.id, payload);
      } else {
        await createInvoice(payload);
      }
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const inp = {
    width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`,
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
    background: '#fff', color: T.text, outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 28, width: '100%', maxWidth: 720, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{isEdit ? 'Edit Invoice' : 'New Invoice'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.muted }}>×</button>
        </div>

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}

        <form onSubmit={handleSubmit}>
          {/* Invoice prefix + dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Prefix</label>
              <input style={inp} value={form.invoice_prefix} onChange={e => setField('invoice_prefix', e.target.value)} placeholder="INV" disabled={isEdit} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Issue Date</label>
              <input style={inp} type="date" value={form.issue_date} onChange={e => setField('issue_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Due Date</label>
              <input style={inp} type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
          </div>

          {/* Payment terms + VAT type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Payment Terms</label>
              <select style={{ ...inp }} value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)}>
                <option>Due on Receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
                <option>Advance Payment</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>VAT Type</label>
              <select style={{ ...inp }} value={form.vat_type} onChange={e => setField('vat_type', e.target.value)}>
                <option value="vatable">VATable (12%)</option>
                <option value="zero_rated">Zero-Rated (0%)</option>
                <option value="exempt">VAT Exempt</option>
              </select>
            </div>
          </div>

          {/* Customer */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10, paddingTop: 4, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>Bill To</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Customer Name *</label>
              <input style={inp} value={form.customer_name} onChange={e => setField('customer_name', e.target.value)} placeholder="Business or person name" required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>TIN</label>
              <input style={inp} value={form.customer_tin} onChange={e => setField('customer_tin', e.target.value)} placeholder="000-000-000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Email</label>
              <input style={inp} type="email" value={form.customer_email} onChange={e => setField('customer_email', e.target.value)} placeholder="customer@email.com" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Address</label>
              <input style={inp} value={form.customer_address} onChange={e => setField('customer_address', e.target.value)} placeholder="Street, City, Province" />
            </div>
          </div>

          {/* Line items */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>Line Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr style={{ background: '#f5f5f7' }}>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.muted, textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.muted, textAlign: 'center', width: 60 }}>Qty</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.muted, textAlign: 'right', width: 110 }}>Unit Price</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.muted, textAlign: 'center', width: 130 }}>Type</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.muted, textAlign: 'right', width: 100 }}>Amount</th>
                <th style={{ width: 28 }}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, idx) => {
                const amt         = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                const isReim      = item.line_vat_type === 'reimbursement';
                return (
                  <tr key={item.key} style={{ borderBottom: `1px solid ${T.border}`, background: isReim ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '6px 4px' }}>
                      <input style={{ ...inp, border: 'none', background: 'transparent', padding: '6px 6px' }}
                        value={item.description} onChange={e => setItem(idx, 'description', e.target.value)} placeholder="Item description" />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input style={{ ...inp, border: 'none', background: 'transparent', padding: '6px 4px', textAlign: 'center' }}
                        type="number" min="0.01" step="0.01"
                        value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      <input style={{ ...inp, border: 'none', background: 'transparent', padding: '6px 6px', textAlign: 'right' }}
                        type="number" min="0" step="0.01"
                        value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <select
                        value={item.line_vat_type || 'vatable'}
                        onChange={e => setItem(idx, 'line_vat_type', e.target.value)}
                        style={{ fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', fontFamily: 'inherit',
                          background: isReim ? '#fef3c7' : '#f0fdf4', color: isReim ? '#92400e' : '#15803d' }}>
                        <option value="vatable">VATable (12%)</option>
                        <option value="reimbursement">Reimbursement (0%)</option>
                      </select>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 13, color: T.text, fontWeight: 600 }}>
                      {peso(amt)}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)}
                          style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" onClick={addItem}
            style={{ fontSize: 13, color: T.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginBottom: 16 }}>
            + Add Line Item
          </button>

          {/* Totals preview */}
          {(() => {
            const reimbTotal = form.items
              .filter(i => i.line_vat_type === 'reimbursement')
              .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);
            const vatableTotal = subtotal - reimbTotal;
            return (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div style={{ width: 280, background: '#f5f5f7', borderRadius: 10, padding: '12px 16px' }}>
                  {reimbTotal > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 4 }}>
                        <span>VATable Services</span><span style={{ color: T.text, fontWeight: 600 }}>{peso(vatableTotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 6 }}>
                        <span>Reimbursements (no VAT)</span><span style={{ color: '#92400e', fontWeight: 600 }}>{peso(reimbTotal)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted, marginBottom: 6 }}>
                    <span>Subtotal (NET)</span><span style={{ color: T.text, fontWeight: 600 }}>{peso(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted, marginBottom: 8 }}>
                    <span>VAT (12% on VATable)</span>
                    <span style={{ color: '#C9A84C', fontWeight: 600 }}>{peso(vatAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: T.text, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                    <span>Total Due</span><span>{peso(total)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }}
              value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="Payment instructions, bank details, thank you message…" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, fontWeight: 600, color: T.text, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: T.accent, fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Invoice')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── VOID MODAL ───────────────────────────────────────────────────────────────

function VoidModal({ invoice, onClose, onVoided }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const isPaid = invoice.status === 'paid';

  async function handleVoid() {
    setLoading(true); setErr('');
    try {
      await voidInvoice(invoice.id, reason);
      onVoided();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 12 }}>Void Invoice</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          You are about to void <strong>{invoice.invoice_number}</strong>.
          {isPaid && <span style={{ color: T.red }}> This invoice was paid — a reversal transaction will be created to cancel the VAT and revenue.</span>}
        </div>
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Void Reason</label>
          <textarea
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 72, boxSizing: 'border-box' }}
            value={reason} onChange={e => setReason(e.target.value)} placeholder="Client cancelled, duplicate entry, error…"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, fontWeight: 600, color: T.text, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleVoid} disabled={loading}
            style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: T.red, fontSize: 13, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Voiding…' : 'Void Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PAY MODAL ────────────────────────────────────────────────────────────────

function PayModal({ invoice, onClose, onPaid }) {
  const [settlement,   setSettlement]   = useState('cash');
  const [paymentDate,  setPaymentDate]  = useState(new Date().toISOString().slice(0, 10));
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState('');

  async function handlePay() {
    setLoading(true); setErr('');
    try {
      await markInvoicePaid(invoice.id, settlement, paymentDate);
      onPaid();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  }

  const inp2 = { width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 12 }}>Mark as Paid</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          Marking <strong>{invoice.invoice_number}</strong> as paid will automatically record an income transaction of <strong style={{ color: T.green }}>₱{Number(invoice.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>.
        </div>
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Payment Date</label>
          <input style={inp2} type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Settlement</label>
          <select style={inp2} value={settlement} onChange={e => setSettlement(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="check">Check</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, fontWeight: 600, color: T.text, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handlePay} disabled={loading}
            style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: T.green, fontSize: 13, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── INVOICES TAB (main export) ───────────────────────────────────────────────

export function InvoicesTab({ clientId, isAccountant = false }) {
  const [invoices,    setInvoices]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');
  const [filter,      setFilter]      = useState('all');
  const [showForm,    setShowForm]    = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [voidTarget,  setVoidTarget]  = useState(null);
  const [payTarget,   setPayTarget]   = useState(null);

  async function load() {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await getInvoices(clientId);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleSend(inv) {
    try {
      await markInvoiceSent(inv.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDelete(inv) {
    if (!window.confirm(`Delete draft invoice ${inv.invoice_number}?`)) return;
    try {
      await deleteInvoice(inv.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const shareBase = window.location.origin;

  const tabBtn = (label, value) => (
    <button key={value}
      onClick={() => setFilter(value)}
      style={{
        padding: '6px 14px', borderRadius: 20, border: 'none',
        background: filter === value ? T.accent : 'transparent',
        color: filter === value ? '#fff' : T.muted,
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
      {label}
      {value !== 'all' && (
        <span style={{ marginLeft: 6, background: filter === value ? 'rgba(255,255,255,0.25)' : '#e5e7eb', color: filter === value ? '#fff' : T.muted, fontSize: 11, borderRadius: 10, padding: '1px 6px' }}>
          {invoices.filter(i => i.status === value).length}
        </span>
      )}
    </button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Invoices</div>
        <button
          onClick={() => { setEditInvoice(null); setShowForm(true); }}
          style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New Invoice
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('All', 'all')}
        {tabBtn('Draft', 'draft')}
        {tabBtn('Sent', 'sent')}
        {tabBtn('Paid', 'paid')}
        {tabBtn('Void', 'void')}
      </div>

      {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ color: T.muted, fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading invoices…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
          {filter === 'all' ? 'No invoices yet. Create your first invoice above.' : `No ${filter} invoices.`}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: T.muted, fontWeight: 600 }}>Invoice #</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: T.muted, fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: T.muted, fontWeight: 600 }}>Date</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: T.muted, fontWeight: 600 }}>NET</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: T.muted, fontWeight: 600 }}>VAT</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: T.muted, fontWeight: 600 }}>Total</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: T.muted, fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: T.muted, fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: T.accent }}>{inv.invoice_number}</td>
                  <td style={{ padding: '10px 12px', color: T.text }}>{inv.customer_name}</td>
                  <td style={{ padding: '10px 12px', color: T.muted }}>{fmtDate(inv.issue_date)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: T.text }}>{peso(inv.subtotal)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#C9A84C' }}>{peso(inv.vat_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: T.text }}>{peso(inv.total)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><StatusBadge status={inv.status} /></td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>

                      {/* View (public link) */}
                      {inv.share_token && (
                        <a href={`${shareBase}/invoice/${inv.share_token}`} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontSize: 12, fontWeight: 600, color: T.text, textDecoration: 'none', cursor: 'pointer' }}>
                          View
                        </a>
                      )}

                      {/* Edit — draft only */}
                      {inv.status === 'draft' && (
                        <button onClick={() => { setEditInvoice(inv); setShowForm(true); }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer' }}>
                          Edit
                        </button>
                      )}

                      {/* Mark Sent — draft */}
                      {inv.status === 'draft' && (
                        <button onClick={() => handleSend(inv)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#eff6ff', fontSize: 12, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
                          Mark Sent
                        </button>
                      )}

                      {/* Mark Paid — draft or sent */}
                      {(inv.status === 'draft' || inv.status === 'sent') && (
                        <button onClick={() => setPayTarget(inv)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#f0fdf4', fontSize: 12, fontWeight: 600, color: '#15803d', cursor: 'pointer' }}>
                          Mark Paid
                        </button>
                      )}

                      {/* Copy share link */}
                      {inv.share_token && (
                        <button onClick={() => { navigator.clipboard.writeText(`${shareBase}/invoice/${inv.share_token}`); }}
                          title="Copy shareable link"
                          style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontSize: 12, color: T.muted, cursor: 'pointer' }}>
                          🔗
                        </button>
                      )}

                      {/* Void — accountant can void paid; anyone can void draft/sent */}
                      {inv.status !== 'void' && (isAccountant || inv.status !== 'paid') && (
                        <button onClick={() => setVoidTarget(inv)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#fef2f2', fontSize: 12, fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                          Void
                        </button>
                      )}

                      {/* Delete — draft only */}
                      {inv.status === 'draft' && (
                        <button onClick={() => handleDelete(inv)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#fef2f2', fontSize: 12, fontWeight: 600, color: T.red, cursor: 'pointer' }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary row */}
      {invoices.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Invoiced (NET)', value: invoices.filter(i => i.status !== 'void').reduce((s, i) => s + (i.subtotal || 0), 0) },
            { label: 'Total VAT', value: invoices.filter(i => i.status !== 'void').reduce((s, i) => s + (i.vat_amount || 0), 0) },
            { label: 'Collected (Paid)', value: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 20px' }}>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{peso(value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <InvoiceFormModal
          clientId={clientId}
          invoice={editInvoice}
          onClose={() => { setShowForm(false); setEditInvoice(null); }}
          onSaved={() => { setShowForm(false); setEditInvoice(null); load(); }}
        />
      )}
      {voidTarget && (
        <VoidModal
          invoice={voidTarget}
          onClose={() => setVoidTarget(null)}
          onVoided={() => { setVoidTarget(null); load(); }}
        />
      )}
      {payTarget && (
        <PayModal
          invoice={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => { setPayTarget(null); load(); }}
        />
      )}
    </div>
  );
}
