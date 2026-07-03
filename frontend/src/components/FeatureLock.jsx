// ─── FeatureLock ─────────────────────────────────────────────────────────────
// Wraps a premium feature section with a blur + upgrade overlay when the user
// is NOT on an active trial and NOT on a qualifying paid tier.
//
// Usage:
//   <FeatureLock locked={!hasPremium} feature="Cash Flow Forecasting" plan="Professional" onUpgrade={fn}>
//     <MyPremiumComponent />
//   </FeatureLock>
//
// Props:
//   locked      — boolean. When false, renders children normally.
//   feature     — human label for the locked feature (shown in overlay)
//   plan        — minimum plan needed ("Professional", "Firm", etc.)
//   onUpgrade   — callback when user clicks "Upgrade" (open pricing modal)
//   preview     — boolean (default true). If true, shows a blurred preview of children.
//                 If false, shows a placeholder card instead.
//   accentColor — optional brand color (default #1d4ed8)

export default function FeatureLock({
  locked,
  feature = 'Premium Feature',
  plan    = 'Professional',
  onUpgrade,
  preview   = true,
  accentColor = '#1d4ed8',
  children,
}) {
  if (!locked) return children;

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      {/* Blurred preview of the real content */}
      {preview && (
        <div style={{
          filter: 'blur(4px)',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.5,
        }}>
          {children}
        </div>
      )}

      {/* Overlay */}
      <div style={{
        position: preview ? 'absolute' : 'relative',
        inset: 0,
        background: preview
          ? 'linear-gradient(to bottom, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.95) 60%, #fff 100%)'
          : '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        borderRadius: 12,
        border: preview ? 'none' : '2px dashed #e2e8f0',
        minHeight: preview ? undefined : 180,
      }}>
        {/* Lock icon */}
        <div style={{
          width: 48, height: 48,
          background: accentColor + '18',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
          fontSize: 22,
        }}>
          🔒
        </div>

        <p style={{
          margin: '0 0 4px',
          fontSize: 16, fontWeight: 700, color: '#111827',
        }}>
          {feature}
        </p>
        <p style={{
          margin: '0 0 20px',
          fontSize: 13, color: '#6b7280', maxWidth: 280, lineHeight: 1.5,
        }}>
          Available on the <strong>{plan}</strong> plan and above.
          Your trial gives you full access — upgrade before it ends to keep it.
        </p>

        <button
          onClick={onUpgrade}
          style={{
            background: accentColor, color: '#fff',
            border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          View Upgrade Options
        </button>
      </div>
    </div>
  );
}
