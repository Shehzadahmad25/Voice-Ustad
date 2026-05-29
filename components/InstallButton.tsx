'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showButton, setShowButton] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Only show on / and /dashboard
    if (pathname !== '/' && pathname !== '/dashboard') return

    // Already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Already dismissed permanently
    if (localStorage.getItem('vu-pwa-installed')) return

    // Listen for native install prompt
    const handler = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowButton(true)
      console.log('[PWA] Install prompt ready')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Also show manual button after 4 seconds as fallback
    const timer = setTimeout(() => {
      setShowButton(prev => prev || true)
    }, 4000)

    const onInstalled = () => {
      setShowButton(false)
      localStorage.setItem('vu-pwa-installed', 'true')
      console.log('[PWA] App installed!')
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(timer)
    }
  }, [pathname])

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      console.log('[PWA] User choice:', outcome)
      if (outcome === 'accepted') {
        setShowButton(false)
        localStorage.setItem('vu-pwa-installed', 'true')
      }
      setInstallPrompt(null)
      return
    }

    alert(
      'Install VoiceUstad:\n\n' +
      '📱 Android Chrome:\n' +
      'Tap ⋮ (3 dots) at top right\n' +
      '→ Tap "Add to Home Screen"\n' +
      '→ Tap "Add"\n\n' +
      '🍎 iPhone Safari:\n' +
      'Tap Share button (box with arrow up)\n' +
      '→ Tap "Add to Home Screen"\n' +
      '→ Tap "Add"'
    )
  }

  if (!showButton) return null

  return (
    <button
      onClick={handleInstall}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 16,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#f97316',
        border: 'none',
        color: '#fff',
        borderRadius: 99,
        padding: '11px 18px',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 4px 16px rgba(249,115,22,0.5)',
      }}
    >
      ⬇ Install App
    </button>
  )
}
