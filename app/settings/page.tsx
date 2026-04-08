'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import TopNav from '@/components/TopNav'
import { useToast } from '@/components/ui/Toast'

// ── AUTH BYPASS — development mock user ──────────────────────────────────────
const MOCK_USER    = { id: 'dev-bypass-user', email: 'test@example.com' }
const MOCK_PROFILE = {
  full_name: 'Test User', phone: '', board: 'KPK', class: '11',
  goal: 'FSc Pre-Medical', exam_date: null,
  daily_reminder_enabled: true, exam_alerts_enabled: true,
  streak_alerts_enabled: false, weekly_report_enabled: true,
  response_language: 'english_text_urdu_voice', voice_speed: 'normal',
}
// ─────────────────────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: '10px',
  background: '#1a2035', border: '1px solid rgba(255,255,255,0.14)',
  color: '#f1f5f9', fontSize: '14px', fontFamily: 'inherit', outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const cardStyle: React.CSSProperties = {
  background: '#141929', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '24px 26px', marginBottom: '16px',
}
const sectionHeader = (icon: string, label: string, iconBg: string) => (
  <div style={{
    display:'flex', alignItems:'center', gap:'10px', fontSize:'14px', fontWeight:'700',
    color:'white', paddingBottom:'16px', marginBottom:'18px',
    borderBottom:'1px solid rgba(255,255,255,0.08)',
  }}>
    <div style={{
      width:'28px', height:'28px', borderRadius:'8px', background: iconBg,
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px',
    }}>{icon}</div>
    {label}
  </div>
)

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width:'42px', height:'24px', borderRadius:'24px', position:'relative',
      cursor:'pointer', flexShrink:0, transition:'background 0.2s',
      background: value ? '#22c55e' : '#1a2035',
      border: value ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.14)',
    }}>
      <div style={{
        position:'absolute', width:'16px', height:'16px', borderRadius:'50%',
        top:'3px', transition:'all 0.2s ease',
        left: value ? '23px' : '3px',
        background: value ? 'white' : '#64748b',
      }} />
    </div>
  )
}

function FocusInput({ style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...fieldStyle, ...style, ...(props.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
      onFocus={e => !props.disabled && Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
      onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })}
    />
  )
}

function FocusSelect({ style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{ ...fieldStyle, appearance:'none', cursor:'pointer', ...style }}
      onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
      onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })}
    />
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = getSupabaseClient()
  const { showToast } = useToast()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [board, setBoard] = useState('')
  const [studentClass, setStudentClass] = useState('')
  const [goal, setGoal] = useState('')
  const [examDate, setExamDate] = useState('')
  const [dailyReminder, setDailyReminder] = useState(true)
  const [examAlerts, setExamAlerts] = useState(true)
  const [streakAlerts, setStreakAlerts] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState(true)
  const [responseLang, setResponseLang] = useState('english_text_urdu_voice')
  const [voiceSpeed, setVoiceSpeed] = useState('normal')
  const [referralStats, setReferralStats] = useState({ invited: 0, converted: 0, freeMonths: 0 })

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        // ── AUTH BYPASS: use mock when no real session ──────────────────────
        // To re-enable: replace the block below with:
        //   const { data: { user: u } } = await supabase.auth.getUser()
        //   if (!u) { router.push('/auth/signin'); return }
        let u: any = null
        if (supabase) {
          const { data } = await supabase.auth.getUser()
          u = data?.user ?? null
        }
        if (!u) {
          setUser(MOCK_USER as any)
          const p = MOCK_PROFILE as any
          setProfile(p); setFullName(p.full_name); setPhone(p.phone)
          setBoard(p.board); setStudentClass(p.class); setGoal(p.goal)
          setExamDate(p.exam_date || '')
          setDailyReminder(p.daily_reminder_enabled); setExamAlerts(p.exam_alerts_enabled)
          setStreakAlerts(p.streak_alerts_enabled); setWeeklyReport(p.weekly_report_enabled)
          setResponseLang(p.response_language); setVoiceSpeed(p.voice_speed)
          return
        }
        // ───────────────────────────────────────────────────────────────────
        setUser(u)
        if (!supabase) { setLoading(false); return }
        const { data: p } = await supabase.from('profiles').select('*').eq('id', u.id).single()
        if (p) {
          setProfile(p)
          setFullName(p.full_name || '')
          setPhone(p.phone || '')
          setBoard(p.board || '')
          setStudentClass(p.class || '')
          setGoal(p.goal || '')
          setExamDate(p.exam_date ? p.exam_date.split('T')[0] : '')
          setDailyReminder(p.daily_reminder_enabled ?? true)
          setExamAlerts(p.exam_alerts_enabled ?? true)
          setStreakAlerts(p.streak_alerts_enabled ?? false)
          setWeeklyReport(p.weekly_report_enabled ?? true)
          setResponseLang(p.response_language || 'english_text_urdu_voice')
          setVoiceSpeed(p.voice_speed || 'normal')
        }
        const { data: refs } = await supabase.from('referrals').select('*').eq('referrer_id', u.id)
        if (refs) {
          setReferralStats({
            invited: refs.length,
            converted: refs.filter(r => r.status === 'converted').length,
            freeMonths: refs.reduce((sum, r) => sum + (r.free_months_earned || 0), 0),
          })
        }
      } catch (e) { console.error('Settings load error:', e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const savePersonal = async () => {
    if (!supabase) { showToast('Auth disabled in dev mode', 'error'); return }
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName, phone }).eq('id', user.id)
      if (error) throw error
      showToast('✅ Profile updated!')
    } catch (e) { console.error('Save personal error:', e); showToast('Failed to save', 'error') }
  }

  const saveAcademic = async () => {
    if (!supabase) { showToast('Auth disabled in dev mode', 'error'); return }
    try {
      const { error } = await supabase.from('profiles').update({
        board, class: studentClass, goal,
        ...(examDate ? { exam_date: examDate } : { exam_date: null }),
      }).eq('id', user.id)
      if (error) throw error
      showToast('✅ Academic profile saved!')
    } catch (e) { console.error('Save academic error:', e); showToast('Failed to save', 'error') }
  }

  const saveVoice = async () => {
    if (!supabase) { showToast('Auth disabled in dev mode', 'error'); return }
    try {
      const { error } = await supabase.from('profiles').update({ response_language: responseLang, voice_speed: voiceSpeed }).eq('id', user.id)
      if (error) throw error
      showToast('✅ Voice settings saved!')
    } catch (e) { console.error('Save voice error:', e); showToast('Failed to save', 'error') }
  }

  const toggleNotification = async (field: string, value: boolean) => {
    if (!supabase) return
    try {
      await supabase.from('profiles').update({ [field]: value }).eq('id', user.id)
    } catch (e) { console.error('Toggle notification error:', e) }
  }

  const copyReferral = async () => {
    const code = profile?.referral_code
    if (!code) return
    const link = `https://voice-ustad.vercel.app/?ref=${code}`
    try { await navigator.clipboard.writeText(link); showToast('✅ Link copied!') }
    catch (e) { showToast('Failed to copy', 'error') }
  }

  const shareWhatsApp = () => {
    const code = profile?.referral_code || ''
    const msg = encodeURIComponent(`Chemistry mein help chahiye? VoiceUstad try karo! Pehle 7 din free hain. Link: https://voice-ustad.vercel.app/?ref=${code}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const exportData = async () => {
    if (!supabase) { showToast('Auth disabled in dev mode', 'error'); return }
    try {
      const [profileRes, sessionsRes, progressRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('study_sessions').select('*').eq('user_id', user.id),
        supabase.from('chapter_progress').select('*').eq('user_id', user.id),
      ])
      const data = { profile: profileRes.data, sessions: sessionsRes.data, progress: progressRes.data }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'voice-ustad-data.json'; a.click()
      URL.revokeObjectURL(url)
      showToast('✅ Data exported!')
    } catch (e) { console.error('Export error:', e); showToast('Export failed', 'error') }
  }

  const deleteAccount = async () => {
    if (!supabase) { showToast('Auth disabled in dev mode', 'error'); return }
    try {
      await supabase.rpc('delete_user')
      router.push('/')
    } catch (e) { console.error('Delete account error:', e); showToast('Failed to delete account', 'error') }
  }

  const labelStyle: React.CSSProperties = { fontSize:'12px', color:'#94a3b8', marginBottom:'6px', display:'block' }
  const btnStyle: React.CSSProperties = {
    padding:'7px 16px', borderRadius:'8px', background:'transparent',
    border:'1px solid rgba(239,68,68,0.3)', cursor:'pointer', color:'#ef4444',
    fontSize:'12px', fontWeight:'600', fontFamily:'inherit', transition:'all 0.15s',
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0e1a' }}>
      <TopNav user={user} profile={profile} />
      <div style={{ paddingTop:'62px' }}>
        <div style={{ maxWidth:'740px', margin:'0 auto', padding:'40px 28px 100px' }}>

          <h1 style={{ fontSize:'23px', fontWeight:'800', color:'white', letterSpacing:'-0.3px', marginBottom:'6px' }}>
            Account Settings
          </h1>
          <p style={{ fontSize:'13.5px', color:'#64748b', marginBottom:'28px' }}>
            Manage your profile, board, and study preferences
          </p>

          {/* PLAN BAR */}
          <div className="plan-bar" style={{
            background:'linear-gradient(135deg,#0d1a0d,#0a1220)',
            border:'1px solid rgba(34,197,94,0.2)', borderRadius:'14px',
            padding:'20px 24px', display:'flex', alignItems:'center',
            justifyContent:'space-between', gap:'16px', marginBottom:'18px',
          }}>
            <div>
              <p style={{ fontSize:'10.5px', color:'#22c55e', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'700', marginBottom:'4px' }}>
                CURRENT PLAN
              </p>
              <h3 style={{ fontSize:'17px', fontWeight:'800', color:'white', marginBottom:'4px' }}>Free Trial Active</h3>
              <p style={{ fontSize:'12.5px', color:'#94a3b8' }}>Upgrade to unlock all subjects and unlimited questions</p>
            </div>
            <button style={{
              background:'#22c55e', padding:'10px 22px', borderRadius:'9px',
              fontWeight:'700', color:'#000', border:'none', cursor:'pointer',
              fontFamily:'inherit', fontSize:'13px', flexShrink:0, whiteSpace:'nowrap',
              transition:'all 0.15s',
            }}>⚡ Upgrade – Rs. 499/mo</button>
          </div>

          {/* PERSONAL DETAILS */}
          <div style={cardStyle}>
            {sectionHeader('👤', 'Personal Details', 'rgba(34,197,94,0.12)')}
            <div className="fg" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <FocusInput type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ahmad Khan" />
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <FocusInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92 300 0000000" />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelStyle}>Email address</label>
                <FocusInput type="email" value={user?.email || ''} disabled />
                <p style={{ fontSize:'11.5px', color:'#64748b', marginTop:'5px' }}>Email is linked to your login.</p>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'20px' }}>
              <span style={{ fontSize:'11.5px', color:'#64748b' }}>Changes saved to your profile.</span>
              <button onClick={savePersonal} style={{
                padding:'9px 20px', borderRadius:'9px', background:'#22c55e',
                color:'#000', fontWeight:'700', border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:'13px', transition:'all 0.15s',
              }}>Save Changes</button>
            </div>
          </div>

          {/* ACADEMIC PROFILE */}
          <div style={cardStyle}>
            {sectionHeader('🎓', 'Academic Profile', 'rgba(14,165,233,0.12)')}
            <div className="fg" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
              <div>
                <label style={labelStyle}>Class</label>
                <FocusSelect value={studentClass} onChange={e => setStudentClass(e.target.value)}>
                  <option value="">Select class</option>
                  <option value="Class 9">Class 9</option>
                  <option value="Class 10">Class 10</option>
                  <option value="Class 11 – FSc Part 1">Class 11 – FSc Part 1</option>
                  <option value="Class 12 – FSc Part 2">Class 12 – FSc Part 2</option>
                </FocusSelect>
              </div>
              <div>
                <label style={labelStyle}>Board</label>
                <FocusSelect value={board} onChange={e => setBoard(e.target.value)}>
                  <option value="">Select board</option>
                  <option value="KPK Board">KPK Board</option>
                  <option value="Federal Board">Federal Board</option>
                  <option value="Punjab Board">Punjab Board</option>
                  <option value="Sindh Board">Sindh Board</option>
                </FocusSelect>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelStyle}>Study Goal</label>
                <FocusSelect value={goal} onChange={e => setGoal(e.target.value)}>
                  <option value="">Select goal</option>
                  <option value="FSc Pre-Medical">FSc Pre-Medical</option>
                  <option value="FSc Pre-Engineering">FSc Pre-Engineering</option>
                  <option value="MDCAT Preparation">MDCAT Preparation</option>
                  <option value="ECAT Preparation">ECAT Preparation</option>
                </FocusSelect>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelStyle}>Board Exam Date <span style={{ color:'#64748b' }}>(optional)</span></label>
                <FocusInput type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
                <p style={{ fontSize:'11.5px', color:'#64748b', marginTop:'5px' }}>Used for your exam countdown on the dashboard.</p>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'20px' }}>
              <button onClick={saveAcademic} style={{
                padding:'9px 20px', borderRadius:'9px', background:'#22c55e',
                color:'#000', fontWeight:'700', border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:'13px', transition:'all 0.15s',
              }}>Save Changes</button>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div style={cardStyle}>
            {sectionHeader('🔔', 'Notifications', 'rgba(124,58,237,0.12)')}
            {[
              { label:'Daily Study Reminder', sub:'Get reminded to study every day', field:'daily_reminder_enabled', value: dailyReminder, set: setDailyReminder },
              { label:'Exam Countdown Alerts', sub:'Reminders 30, 14, 7 days before your exam', field:'exam_alerts_enabled', value: examAlerts, set: setExamAlerts },
              { label:'Streak Alerts', sub:'Notify me when my streak is about to break', field:'streak_alerts_enabled', value: streakAlerts, set: setStreakAlerts },
              { label:'Weekly Progress Report', sub:'Study summary every Sunday', field:'weekly_report_enabled', value: weeklyReport, set: setWeeklyReport },
            ].map((item, i, arr) => (
              <div key={item.field} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <div>
                  <p style={{ fontSize:'13.5px', fontWeight:'600', color:'#f1f5f9', marginBottom:'2px' }}>{item.label}</p>
                  <p style={{ fontSize:'12px', color:'#64748b' }}>{item.sub}</p>
                </div>
                <Toggle value={item.value} onChange={v => {
                  item.set(v)
                  toggleNotification(item.field, v)
                }} />
              </div>
            ))}
          </div>

          {/* LANGUAGE & VOICE */}
          <div style={cardStyle}>
            {sectionHeader('🌐', 'Language & Voice', 'rgba(14,165,233,0.12)')}
            <div className="fg" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px' }}>
              <div>
                <label style={labelStyle}>Response Language</label>
                <FocusSelect value={responseLang} onChange={e => setResponseLang(e.target.value)}>
                  <option value="english_text_urdu_voice">English text + Urdu voice</option>
                  <option value="english_text_only">English text only</option>
                  <option value="urdu_text_urdu_voice">Urdu text + Urdu voice</option>
                </FocusSelect>
              </div>
              <div>
                <label style={labelStyle}>Voice Speed</label>
                <FocusSelect value={voiceSpeed} onChange={e => setVoiceSpeed(e.target.value)}>
                  <option value="slow">Slow</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </FocusSelect>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={saveVoice} style={{
                padding:'9px 20px', borderRadius:'9px', background:'#22c55e',
                color:'#000', fontWeight:'700', border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:'13px', transition:'all 0.15s',
              }}>Save Changes</button>
            </div>
          </div>

          {/* REFERRAL */}
          <div style={cardStyle}>
            {sectionHeader('🎁', 'Referral Program', 'rgba(34,197,94,0.12)')}
            <p style={{ fontSize:'13px', color:'#94a3b8', lineHeight:'1.6', marginBottom:'14px' }}>
              Invite friends and earn free months. When they subscribe, you both get 1 month free.
            </p>
            <div style={{
              background:'#1a2035', border:'1px solid rgba(255,255,255,0.14)',
              borderRadius:'10px', padding:'14px 16px',
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px',
            }}>
              <span style={{ fontSize:'18px', fontWeight:'800', letterSpacing:'0.12em', color:'#22c55e' }}>
                {profile?.referral_code || 'Generating...'}
              </span>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={copyReferral} style={{
                  padding:'7px 14px', borderRadius:'8px', background:'rgba(34,197,94,0.1)',
                  border:'1px solid rgba(34,197,94,0.2)', color:'#22c55e',
                  cursor:'pointer', fontFamily:'inherit', fontSize:'12px', fontWeight:'600', transition:'all 0.15s',
                }}>📋 Copy & Share</button>
                <button onClick={shareWhatsApp} style={{
                  padding:'7px 14px', borderRadius:'8px', background:'rgba(37,211,102,0.1)',
                  border:'1px solid rgba(37,211,102,0.2)', color:'#25d366',
                  cursor:'pointer', fontFamily:'inherit', fontSize:'12px', fontWeight:'600', transition:'all 0.15s',
                }}>WhatsApp</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginTop:'12px' }}>
              {[
                { label:'Friends Invited', value: referralStats.invited },
                { label:'Converted', value: referralStats.converted },
                { label:'Free Months', value: referralStats.freeMonths },
              ].map(stat => (
                <div key={stat.label} style={{
                  background:'#1a2035', borderRadius:'9px', padding:'10px 12px', textAlign:'center',
                }}>
                  <p style={{ fontSize:'20px', fontWeight:'800', color:'#22c55e', lineHeight:1, marginBottom:'4px' }}>{stat.value}</p>
                  <p style={{ fontSize:'11px', color:'#64748b' }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* COMING SOON */}
          <div style={{
            ...cardStyle, display:'flex', alignItems:'center', gap:'12px', opacity:0.38,
          }}>
            <span style={{ fontSize:'18px' }}>🔒</span>
            <span style={{ fontSize:'14px', color:'#94a3b8' }}>Password &amp; Security — Coming Soon</span>
          </div>

          {/* DANGER ZONE */}
          <div style={{
            background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.2)',
            borderRadius:'14px', padding:'22px 24px',
          }}>
            <p style={{ color:'#ef4444', fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>⚠️ Danger Zone</p>
            {[
              {
                label:'Export My Data', sub:'Download all your questions and study history',
                btnLabel:'Export', onClick: exportData,
              },
              {
                label:'Delete Account', sub:'Permanently delete your account and all data',
                btnLabel:'Delete Account', onClick: () => setShowDeleteModal(true),
              },
            ].map((item, i) => (
              <div key={item.label} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'14px 0', borderBottom: i === 0 ? '1px solid rgba(239,68,68,0.1)' : 'none',
                gap:'16px', flexWrap:'wrap',
              }}>
                <div>
                  <p style={{ fontSize:'13.5px', fontWeight:'600', color:'#f1f5f9', marginBottom:'2px' }}>{item.label}</p>
                  <p style={{ fontSize:'12px', color:'#94a3b8' }}>{item.sub}</p>
                </div>
                <button onClick={item.onClick} style={btnStyle}
                  onMouseEnter={e => Object.assign(e.currentTarget.style, { background:'rgba(239,68,68,0.1)' })}
                  onMouseLeave={e => Object.assign(e.currentTarget.style, { background:'transparent' })}>
                  {item.btnLabel}
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* SCROLL TO TOP */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position:'fixed', bottom:'28px', right:'24px', zIndex:100,
            width:'42px', height:'42px', borderRadius:'50%',
            background:'#22c55e', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'18px', boxShadow:'0 4px 16px rgba(34,197,94,0.35)',
            transition:'opacity 0.2s, transform 0.2s',
          }}
          title="Back to top"
        >↑</button>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200, padding:'24px',
        }}>
          <div style={{
            background:'#141929', border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:'18px', padding:'32px', maxWidth:'420px', width:'100%',
          }}>
            <h3 style={{ fontSize:'18px', fontWeight:'800', color:'white', marginBottom:'8px' }}>Delete your account?</h3>
            <p style={{ fontSize:'13px', color:'#94a3b8', lineHeight:'1.6', marginBottom:'24px' }}>
              This will permanently delete your account, all study history, progress, and settings. This action cannot be undone.
            </p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{
                flex:1, padding:'11px', borderRadius:'10px',
                background:'#1a2035', border:'1px solid rgba(255,255,255,0.14)',
                color:'#f1f5f9', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', fontSize:'14px',
              }}>Cancel</button>
              <button onClick={deleteAccount} style={{
                flex:1, padding:'11px', borderRadius:'10px',
                background:'#ef4444', border:'none',
                color:'white', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', fontSize:'14px',
              }}>Yes, Delete Everything</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
