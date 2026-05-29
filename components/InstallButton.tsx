'use client'
import { useEffect, useState } from 'react'

export default function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const path = window.location.pathname
    const allowedPages = ['/', '/dashboard']
    if (!allowedPages.some(p => path === p)) return

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const timer = setTimeout(() => setShow(true), 3000)
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

  if (isInstalled || !show) return null

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setIsInstalled(true)
    } else {
      alert('To install:\nAndroid: tap ⋮ menu → Add to Home Screen\niPhone: tap Share → Add to Home Screen')
    }
  }

  return (
    <button
      onClick={handleInstall}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 16,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#f97316',
        border: 'none',
        color: '#fff',
        borderRadius: 99,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 2px 12px rgba(249,115,22,0.4)',
      }}
    >
      ⬇ Install App
    </button>
  )
}
