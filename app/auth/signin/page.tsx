'use client'
// ── AUTH BYPASS — development mode ──────────────────────────────────────────
// To re-enable auth: delete this file and restore the original signin page.
// Original is preserved in git history.
// ────────────────────────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'
import AuthLayout from '@/components/auth/AuthLayout'

export default function SignInPage() {
  const router = useRouter()

  return (
    <AuthLayout>
      <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>
        Development Mode
      </h2>
      <p style={{ fontSize: '13.5px', color: '#64748b', marginBottom: '28px' }}>
        Authentication is temporarily disabled.
      </p>

      <button
        onClick={() => router.push('/dashboard')}
        style={{
          width: '100%', padding: '14px', borderRadius: '11px',
          background: '#22c55e', fontSize: '15px', fontWeight: '700',
          color: '#000', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', boxShadow: '0 3px 16px rgba(34,197,94,0.28)',
          transition: 'all 0.15s',
        }}
      >
        Continue to Dashboard →
      </button>

      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#334155' }}>
        Auth bypass active — re-enable before deploying to production
      </p>
    </AuthLayout>
  )
}
