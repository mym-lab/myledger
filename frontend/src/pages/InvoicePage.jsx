// ─── InvoicePage.jsx ────────────────────────────────────────────────────────
// Public invoice view — no auth required.
// Accessed via /invoice/:token (share link)
// Token is read from window.location.pathname — no React Router needed.

import { useState, useEffect } from 'react';

const API = '';  // same origin

export default function InvoicePage() {
  const token = window.location.pathname.replace(/^\/invoice\//, '');

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`${API}/api/invoices/public/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setInvoice(data);
      })
      .catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', background: '#f9fafb' }}>
      <div style={{ color: '#6b7280', fontSize: 14 }}>Loading invoice…</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Invoice Not Found</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>This invoice link may be invalid or has been removed.</div>
      </div>
    </div>
  );

  const isVoid = invoice.status === 'void';

  const statusColors = {
    draft: { bg: '#f3f4f6', text: '#374151' },
    sent:  { bg: '#eff6ff', text: '#1d4ed8' },
    paid:  { bg: '#f0fdf4', text: '#15803d' },
    void:  { bg: '#fef2f2', text: '#dc2626' },
  };
  const sc = statusColors[invoice.status] || statusColors.draft;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f3f4f6; font-family: 'Inter', sans-serif; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .invoice-card { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ background: '#000', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
          MyLedger <span style={{ color: '#C9A84C' }}>by Kaiman &amp; Co.</span>
        </div>
        <button
          onClick={() => window.print()}
          style={{ background: '#C9A84C', color: '#000', border: 'none', padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          Save as PDF
        </button>
      </div>

      {/* Invoice card */}
      <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px 64px' }}>
        <div className="invoice-card" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div style={{ background: '#000', padding: '40px 48px', position: 'relative' }}>
            {isVoid && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(-20deg)',
                fontSize: 80, fontWeight: 900, color: 'rgba(239,68,68,0.25)',
                letterSpacing: 8, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
              }}>VOID</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.5, marginBottom: 4 }}>
                  {invoice.issuer?.business_name || 'MyLedger Business'}
                </div>
                {invoice.issuer?.address && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{invoice.issuer.address}</div>
                )}
                {invoice.issuer?.tin && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>TIN: {invoice.issuer.tin}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>Invoice</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#C9A84C', letterSpacing: -0.5 }}>{invoice.invoice_number}</div>
                <div style={{ marginTop: 10, display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {invoice.status}
                </div>
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid #f3f4f6' }}>
            {[
              { label: 'Issued',         value: invoice.issue_date },
              { label: 'Due Date',       value: invoice.due_date || 'Upon Receipt' },
              { label: 'Payment Terms',  value: invoice.payment_terms },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '16px 24px', borderRight: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Bill To */}
          <div style={{ padding: '24px 48px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bill To</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{invoice.customer_name}</div>
            {invoice.customer_tin     && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>TIN: {invoice.customer_tin}</div>}
            {invoice.customer_address && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{invoice.customer_address}</div>}
            {invoice.customer_email   && <div style={{ fontSize: 12, color: '#6b7280' }}>{invoice.customer_email}</div>}
          </div>

          {/* Line items */}
          <div style={{ padding: '0 48px 24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
              <thead>
                <tr style={{ background: '#111827' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left',   fontSize: 11, fontWeight: 600, color: '#fff', borderRadius: '8px 0 0 0' }}>Description</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#fff', width: 80 }}>Qty</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right',  fontSize: 11, fontWeight: 600, color: '#fff', width: 120 }}>Unit Price</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right',  fontSize: 11, fontWeight: 600, color: '#fff', width: 120, borderRadius: '0 8px 0 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((item, i) => {
                  const isReim = item.line_vat_type === 'reimbursement';
                  return (
                    <tr key={item.id || i} style={{ borderBottom: '1px solid #f3f4f6', background: isReim ? '#fffbeb' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                        {item.description}
                        {isReim && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Reimbursement
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151', textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151', textAlign: 'right' }}>₱{Number(item.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#111827', textAlign: 'right' }}>₱{Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                  <span>Services Subtotal (NET)</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>₱{Number(invoice.subtotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                  <span>VAT (12%)</span>
                  <span style={{ fontWeight: 600, color: '#C9A84C' }}>₱{Number(invoice.vat_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                {Number(invoice.reimbursement_total) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                    <span>Reimbursements (pass-through)</span>
                    <span style={{ fontWeight: 600, color: '#92400e' }}>₱{Number(invoice.reimbursement_total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  <span>Total Due</span>
                  <span>₱{Number(invoice.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes / void reason */}
          {(invoice.notes || isVoid) && (
            <div style={{ padding: '20px 48px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
              {invoice.notes && (
                <div style={{ marginBottom: isVoid ? 12 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Notes</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{invoice.notes}</div>
                </div>
              )}
              {isVoid && invoice.void_reason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Void Reason</div>
                  <div style={{ fontSize: 13, color: '#7f1d1d' }}>{invoice.void_reason}</div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ background: '#111827', padding: '20px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Generated by <span style={{ color: '#C9A84C', fontWeight: 600 }}>MyLedger</span> — BIR-ready bookkeeping
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>ml.kaimanco.com</div>
          </div>
        </div>
      </div>
    </>
  );
}
