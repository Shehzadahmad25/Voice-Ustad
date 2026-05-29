'use client'
import { useEffect, useState } from 'react'

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Already dismissed
    if (localStorage.getItem('vu-pwa-dismissed')) return

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    if (ios) {
      setTimeout(() => setShowBanner(true), 3000)
      return
    }

    // Android/Chrome install prompt
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (isIOS) {
      handleDismiss()
      return
    }
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      localStorage.setItem('vu-pwa-dismissed', 'true')
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setShowBanner(false)
    localStorage.setItem('vu-pwa-dismissed', 'true')
  }

  if (!showBanner) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#0d1b2e',
      borderTop: '1px solid #1a2d47',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 9999,
      boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
    }}>
      <img
        src="/icon-192.png"
        alt="VoiceUstad"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 }}>
          Install VoiceUstad
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {isIOS
            ? 'Tap Share → Add to Home Screen'
            : 'Add to home screen — no app store needed'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={handleDismiss} style={{
          background: 'none',
          border: '1px solid #334155',
          color: '#64748b',
          borderRadius: 8,
          padding: '7px 12px',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: 'inherit',
        }}>Later</button>
        <button onClick={handleInstall} style={{
          background: '#f97316',
          border: 'none',
          color: '#fff',
          borderRadius: 8,
          padding: '7px 14px',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 700,
          fontFamily: 'inherit',
        }}>
          {isIOS ? 'How?' : 'Install'}
        </button>
      </div>
    </div>
  )
}
