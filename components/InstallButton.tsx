'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallButton() {
  const pathname = usePathname()
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [show, setShow] = useState(false)
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const timer = setTimeout(() => setShow(true), 2000)
    const handler = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [])

  const onAuthPage = pathname?.startsWith('/auth')
  if (isInstalled || onAuthPage || !show) return null

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setIsInstalled(true)
    } else {
      setShowManual(true)
    }
  }

  return (
    <>
      <button
        onClick={handleInstall}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 16,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#f97316',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(249,115,22,0.45)',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 16 }}>⬇</span>
        Install App
      </button>

      {showManual && (
        <div
          onClick={() => setShowManual(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1001,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 20px 32px',
              width: '100%',
              maxWidth: 480,
              color: '#f1f5f9',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Install VoiceUstad</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
              <div><strong style={{ color: '#f1f5f9' }}>Android:</strong> Tap the ⋮ menu in Chrome → <em>Add to Home Screen</em></div>
              <div style={{ marginTop: 8 }}><strong style={{ color: '#f1f5f9' }}>iPhone:</strong> Tap the Share button → <em>Add to Home Screen</em></div>
            </div>
            <button
              onClick={() => setShowManual(false)}
              style={{
                marginTop: 20, width: '100%', padding: '10px 0',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  )
}
