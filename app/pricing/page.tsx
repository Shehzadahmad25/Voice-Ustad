'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const card: React.CSSProperties = {
  background: '#111d30',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '24px 26px',
  marginBottom: '16px',
}

export default function PricingPage() {
  const router = useRouter()
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason')
    setIsExpired(reason === 'expired')
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07101f',
      color: '#e2e8f0',
      fontFamily: 'var(--font-dm, DM Sans, sans-serif)',
      padding: '0',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#07101f',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()} style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', color: '#94a3b8',
          cursor: 'pointer', fontSize: '18px',
          padding: '5px 10px', fontFamily: 'inherit',
        }}>←</button>
        <span style={{ fontWeight: 700, fontSize: '16px' }}>Subscribe to VoiceUstad</span>
      </div>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '28px 20px 80px' }}>

        {/* ── Expired banner (TASK 5) ───────────────────────────────────────── */}
        {isExpired && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '14px',
            padding: '18px 22px',
            marginBottom: '24px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '20px' }}>⏰</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#fca5a5' }}>
              Your free trial has ended
            </div>
            <div style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.6 }}>
              Subscribe to continue learning — unlimited questions, Urdu voice explanations,
              and all 24 FSc Chemistry chapters.
            </div>
          </div>
        )}

        {/* ── Plan card ─────────────────────────────────────────────────────── */}
        <div style={{
          ...card,
          border: '1px solid rgba(245,158,11,0.3)',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(249,115,22,0.05))',
          marginBottom: '28px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                display: 'inline-block',
                background: '#f59e0b', color: '#000',
                borderRadius: '6px', fontSize: '11px', fontWeight: 800,
                padding: '3px 8px', marginBottom: '10px',
              }}>BEST VALUE</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>
                Rs. 499
                <span style={{ fontSize: '15px', fontWeight: 400, color: '#94a3b8', marginLeft: '6px' }}>/ month</span>
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                Unlimited access · Cancel anytime
              </div>
            </div>
          </div>
          <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              'Full KPK Board FSc Part 1 & Part 2',
              'English text + natural Urdu voice audio',
              'Ask unlimited questions, any chapter',
              '24/7 access on any device',
              'Past paper walkthroughs with AI feedback',
              'EasyPaisa / JazzCash / bank transfer',
            ].map(f => (
              <li key={f} style={{ fontSize: '13.5px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Payment instructions (TASK 4) ───────────────────────────────── */}
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '16px' }}>
          How to Subscribe
        </h2>

        {/* EasyPaisa */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>📱</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'white' }}>EasyPaisa</span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: 1.7 }}>
            Send <strong style={{ color: '#f1f5f9' }}>Rs. 499</strong> to:{' '}
            <strong style={{
              color: '#f59e0b', fontSize: '15px',
              background: 'rgba(245,158,11,0.1)',
              padding: '2px 8px', borderRadius: '6px',
            }}>
              03XX-XXXXXXX
            </strong>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Account title: [Your Name]
          </p>
        </div>

        {/* JazzCash */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>📱</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'white' }}>JazzCash</span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: 1.7 }}>
            Send <strong style={{ color: '#f1f5f9' }}>Rs. 499</strong> to:{' '}
            <strong style={{
              color: '#f59e0b', fontSize: '15px',
              background: 'rgba(245,158,11,0.1)',
              padding: '2px 8px', borderRadius: '6px',
            }}>
              03XX-XXXXXXX
            </strong>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Account title: [Your Name]
          </p>
        </div>

        {/* After payment steps */}
        <div style={{
          ...card,
          background: 'rgba(34,197,94,0.05)',
          border: '1px solid rgba(34,197,94,0.15)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'white', marginBottom: '14px' }}>
            ✅ After payment:
          </div>
          <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.6 }}>
              Screenshot your payment confirmation
            </li>
            <li style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.6 }}>
              WhatsApp it to:{' '}
              <strong style={{ color: '#f1f5f9' }}>03XX-XXXXXXX</strong>
            </li>
            <li style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.6 }}>
              Access activated within{' '}
              <strong style={{ color: '#22c55e' }}>2 hours ⚡</strong>
            </li>
          </ol>
        </div>

        {/* Back link */}
        <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '13px', color: '#475569' }}>
          Questions?{' '}
          <a href="mailto:support@voiceustad.pk" style={{ color: '#f59e0b', textDecoration: 'none' }}>
            support@voiceustad.pk
          </a>
        </p>
      </div>
    </div>
  )
}
