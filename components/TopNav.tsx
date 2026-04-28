'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { getFirstName } from '@/lib/utils'

export default function TopNav({ user, profile }: { user?: any; profile?: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const firstName = getFirstName(profile, user)
  const initial = firstName[0]?.toUpperCase() || 'S'

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
      <div style={{ display:'flex', alignItems:'center', gap:'9px', marginRight:'auto', cursor:'pointer' }}
        onClick={() => router.push('/dashboard')}>
        <span style={{ fontSize:'22px' }}>📚</span>
        <span style={{ fontSize:'15px', fontWeight:'800', color:'white' }}>VoiceUstad</span>
      </div>

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

      <div style={{
        display:'flex', alignItems:'center', gap:'10px', marginLeft:'auto',
        paddingLeft:'16px', borderLeft:'1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width:'32px', height:'32px', borderRadius:'50%',
          background:'#f59e0b',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'13px', fontWeight:'700', color:'#000', flexShrink:0,
        }}>{initial}</div>
        <span className="topnav-email" style={{ fontSize:'12px', color:'#94a3b8' }}>{user?.email}</span>
        <button onClick={handleLogout} style={{
          padding:'5px 12px', borderRadius:'7px', fontSize:'12px', fontWeight:'500',
          color:'#94a3b8', border:'1px solid rgba(255,255,255,0.1)',
          background:'transparent', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
        }}>Logout</button>
      </div>
    </nav>
  )
}
