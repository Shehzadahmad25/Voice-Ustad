import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy – VoiceUstad',
  description: 'How VoiceUstad collects, uses, and protects your data.',
}

const LAST_UPDATED = 'July 16, 2026'

const section: React.CSSProperties = {
  background: '#111d30',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '24px 26px',
  marginBottom: '16px',
}
const h2: React.CSSProperties = {
  fontSize: '16px', fontWeight: 700, color: 'white', margin: '0 0 10px',
}
const p: React.CSSProperties = {
  fontSize: '14px', color: '#94a3b8', lineHeight: 1.75, margin: '0 0 10px',
}
const li: React.CSSProperties = {
  fontSize: '14px', color: '#94a3b8', lineHeight: 1.75, marginBottom: '6px',
}

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#07101f',
      color: '#e2e8f0',
      fontFamily: 'var(--font-dm, DM Sans, sans-serif)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 24px', borderBottom: '1px solid #1a2d47',
      }}>
        <a href="/" style={{ color: '#f59e0b', textDecoration: 'none', fontWeight: 800, fontSize: '15px' }}>
          🎙️ VoiceUstad
        </a>
        <span style={{ color: '#334155' }}>/</span>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>Privacy Policy</span>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 20px 80px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: '0 0 6px' }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 28px' }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div style={section}>
          <h2 style={h2}>1. Who we are</h2>
          <p style={p}>
            VoiceUstad (&quot;we&quot;, &quot;us&quot;) is an AI-powered educational platform that helps
            FSc and MDCAT students in Pakistan learn with English text and Urdu voice explanations,
            aligned with the KPK Board curriculum. This policy explains what data we collect when you
            use VoiceUstad, how we use it, and the choices you have.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>2. What data we collect</h2>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Account information</strong> — your email address and, if you sign in with Google, your Google account name and email provided through Google OAuth.</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Profile details</strong> — your name, phone number (optional), and your class, board, and study-stream selections (e.g. FSc Part 1, KPK Board, MDCAT preparation).</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Learning activity</strong> — quiz results and scores, topics you view, and your chat history with the AI tutor (questions asked and answers received, including generated Urdu audio).</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Usage analytics</strong> — basic usage data such as XP, learning streaks, and feature usage, used to track progress and improve the app.</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Payment confirmation</strong> — if you subscribe, the payment screenshot you send us via WhatsApp for manual verification. We do not collect or store card numbers; payments are made directly through EasyPaisa/JazzCash.</li>
          </ul>
        </div>

        <div style={section}>
          <h2 style={h2}>3. How we use your data</h2>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={li}>To personalize learning content to your class, board, and goals.</li>
            <li style={li}>To track your progress (quiz history, topic coverage, streaks, XP) and show it back to you.</li>
            <li style={li}>To operate core features — e.g. generating answers and Urdu voice explanations for your questions.</li>
            <li style={li}>To manage your free trial and subscription status.</li>
            <li style={li}>To improve VoiceUstad — e.g. understanding which topics students find difficult.</li>
          </ul>
          <p style={{ ...p, marginTop: '10px' }}>
            We do not sell your personal data to anyone.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>4. Third-party services</h2>
          <p style={p}>VoiceUstad is built on trusted third-party services that process data on our behalf:</p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Supabase</strong> — hosts our database, user authentication, and file storage (including generated audio). Your account and learning data are stored here.</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>Google</strong> — if you choose &quot;Sign in with Google&quot;, Google handles authentication and shares your name and email with us, subject to Google&apos;s own privacy policy.</li>
            <li style={li}><strong style={{ color: '#e2e8f0' }}>OpenAI and Anthropic (Claude)</strong> — the questions and textbook content used to generate AI answers and Urdu voice audio are processed by these AI providers&apos; APIs to produce the content you see and hear.</li>
          </ul>
          <p style={{ ...p, marginTop: '10px' }}>
            Data sent to these services is limited to what is needed to provide the feature you are using.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>5. Data retention &amp; account deletion</h2>
          <p style={p}>
            We keep your account data, chat history, and quiz results for as long as your account is
            active, so your learning progress is preserved between sessions.
          </p>
          <p style={p}>
            You can request deletion of your account and all associated data at any time — either from
            the in-app Settings page or by emailing us. We will delete your profile, chat history, quiz
            records, and stored audio associated with your account.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>6. Contact</h2>
          <p style={p}>
            For any privacy questions, data requests, or concerns, contact us at{' '}
            <a href="mailto:shehzadahmadofficial@gmail.com" style={{ color: '#f59e0b', textDecoration: 'none', fontWeight: 600 }}>
              shehzadahmadofficial@gmail.com
            </a>.
          </p>
        </div>

        <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '28px' }}>
          <a href="/terms" style={{ color: '#64748b' }}>Terms of Service</a>
          {' · '}
          <a href="/" style={{ color: '#64748b' }}>Back to VoiceUstad</a>
        </p>
      </div>
    </div>
  )
}
