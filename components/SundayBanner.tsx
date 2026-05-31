'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SundayBanner() {
  const [show, setShow] = useState(false)
  const [isToday, setIsToday] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const day = new Date().getDay() // 0=Sunday, 6=Saturday
    const dismissed = localStorage.getItem('sunday-banner-dismissed')
    const today = new Date().toDateString()
    if (dismissed === today) return
    if (day === 0) { setIsToday(true); setShow(true) }
    else if (day === 6) { setIsToday(false); setShow(true) }
  }, [])

  function dismiss() {
    localStorage.setItem('sunday-banner-dismissed', new Date().toDateString())
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      background: isToday
        ? 'linear-gradient(90deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))'
        : 'linear-gradient(90deg, rgba(249,115,22,0.15), rgba(245,158,11,0.1))',
      border: `1px solid ${isToday ? '#6366f1' : '#f97316'}`,
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{isToday ? '🗓' : '⏰'}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#818cf8' : '#f97316' }}>
            {isToday ? 'Sunday Test is LIVE today!' : 'Sunday Test tomorrow!'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {isToday
              ? '45 MCQs · 60 minutes · 2× XP bonus'
              : 'Prepare now — full syllabus test tomorrow'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {isToday && (
          <button
            onClick={() => router.push('/quiz')}
            style={{
              background: '#6366f1', border: 'none', color: '#fff',
              borderRadius: 8, padding: '7px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Start Test →</button>
        )}
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: '1px solid #334155', color: '#64748b',
            borderRadius: 8, padding: '7px 10px', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >✕</button>
      </div>
    </div>
  )
}

