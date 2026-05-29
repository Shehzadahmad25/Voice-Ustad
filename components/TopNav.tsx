'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { getFirstName } from '@/lib/utils'

// Module-level singleton — prevents "Multiple GoTrueClient" warning
let _topNavClient: ReturnType<typeof createBrowserClient> | null = null
function getTopNavClient() {
  if (!_topNavClient) {
    _topNavClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _topNavClient
}

export default function TopNav({ user, profile }: { user?: any; profile?: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = getTopNavClient()

  const firstName = getFirstName(profile, user)
  const initial = firstName[0]?.toUpperCase() || 'S'

  const [displayName, setDisplayName] = useState<string>(profile?.full_name || firstName || '')
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const handler = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) {
      alert('To install:\nAndroid: tap ⋮ menu → Add to Home Screen\niPhone: tap Share → Add to Home Screen')
      return
    }
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
  }

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setDisplayName(data.full_name)
      })
  }, [user?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/signin')
  }

  const navLinks = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Chat', href: '/chat' },
    { label: 'Settings', href: '/settings' },
  ]

  return (
    <nav className="topnav" style={{
      height: '62px',
      background: 'rgba(10,14,26,0.94)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 100,
    }}>
      <Link href="/" style={{ marginRight:'auto', display:'flex', alignItems:'center' }}>
        <Image
          src="/logo.jpg"
          alt="VoiceUstad"
          width={44}
          height={44}
          className="object-contain"
          style={{ borderRadius: '8px' }}
          priority
        />
      </Link>

      <div className="topnav-links" style={{ position:'absolute', left:'50%', transform:'translateX(-50%)', display:'flex', gap:'4px' }}>
        {navLinks.map(link => (
          <button key={link.href} onClick={() => router.push(link.href)} style={{
            padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            background: pathname === link.href ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: pathname === link.href ? 'white' : '#64748b',
          }}>{link.label}</button>
        ))}
      </div>

      {!isInstalled && (
        <button
          onClick={handleInstall}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(249,115,22,0.12)',
            border: '1px solid #f97316',
            color: '#f97316',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
            marginLeft: 'auto',
            marginRight: 12,
            flexShrink: 0,
          }}
        >
          <span>⬇</span>
          <span className="hide-mobile">Install App</span>
        </button>
      )}

      <div style={{
        display:'flex', alignItems:'center', gap:'10px', marginLeft: isInstalled ? 'auto' : undefined,
        paddingLeft:'16px', borderLeft:'1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width:'32px', height:'32px', borderRadius:'50%',
          background:'#f59e0b',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'13px', fontWeight:'700', color:'#000', flexShrink:0,
        }}>{initial}</div>
        <span className="topnav-email" style={{ fontSize:'12px', color:'#94a3b8' }}>{displayName || user?.email}</span>
        <button onClick={handleLogout} style={{
          padding:'5px 12px', borderRadius:'7px', fontSize:'12px', fontWeight:'500',
          color:'#94a3b8', border:'1px solid rgba(255,255,255,0.1)',
          background:'transparent', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
        }}>Logout</button>
      </div>
    </nav>
  )
}
