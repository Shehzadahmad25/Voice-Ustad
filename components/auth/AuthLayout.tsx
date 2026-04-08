import React from 'react'

interface AuthLayoutProps {
  children: React.ReactNode
  showBrand?: boolean
}

export default function AuthLayout({ children, showBrand = true }: AuthLayoutProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Gradient mesh */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '40%', height: '40%',
        background: 'radial-gradient(circle at 20% 20%, rgba(34,197,94,0.05), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        bottom: 0, right: 0,
        width: '40%', height: '40%',
        background: 'radial-gradient(circle at 80% 80%, rgba(14,165,233,0.05), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="auth-box" style={{
        background: '#141929',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '22px',
        padding: '38px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        position: 'relative',
        zIndex: 1,
      }}>
        {showBrand && (
          <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'28px' }}>
            <span style={{ fontSize:'22px' }}>📚</span>
            <span style={{ fontSize:'18px', fontWeight:'800', color:'white' }}>VoiceUstad</span>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
