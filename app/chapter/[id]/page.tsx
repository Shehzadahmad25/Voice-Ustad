'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

interface Topic {
  id: string
  chapter_number: number
  chapter_title: string
  topic_code: string
  topic_title: string
  page: number | null
  definition: string | null
  explanation: string | null
  example: string | null
  formula: string | null
}

const cardStyle: React.CSSProperties = {
  background: '#141929',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding: '26px 28px',
  position: 'relative',
  overflow: 'hidden',
}

// ── Section label badge ──────────────────────────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
    }}>
      <div style={{
        width: '3px', height: '16px', borderRadius: '2px',
        background: color, flexShrink: 0,
      }} />
      <span style={{
        fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: '0.8px', color,
      }}>{label}</span>
    </div>
  )
}

// ── Generic section block ────────────────────────────────────────────────────
function SectionBlock({ label, text, color }: { label: string; text: string; color: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '20px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <SectionLabel label={label} color={color} />
      <div style={{
        fontSize: '14px', color: '#cbd5e1', lineHeight: '1.8',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </div>
  )
}

// ── Formula section (monospace) ──────────────────────────────────────────────
function FormulaBlock({ text }: { text: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '20px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <SectionLabel label="Formula" color="#a78bfa" />
      <div style={{
        background: 'rgba(167,139,250,0.06)',
        border: '1px solid rgba(167,139,250,0.15)',
        borderRadius: '8px', padding: '14px 16px',
      }}>
        <div style={{
          fontSize: '13.5px', color: '#e2d9ff', lineHeight: '1.9',
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {text}
        </div>
      </div>
    </div>
  )
}

// ── Elements table for topic 1.4 ─────────────────────────────────────────────
function ElementsTable({ raw }: { raw: string }) {
  const rows = raw
    .split('\n')
    .map(line => line.split('|').map(c => c.trim()))
    .filter(cols => cols.length >= 2 && cols[0])

  if (rows.length === 0) return (
    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.8', margin: 0, whiteSpace: 'pre-line' }}>
      {raw}
    </p>
  )

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: '11px', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.6px',
    color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)',
    textAlign: 'left', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: '13.5px', color: '#cbd5e1',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={thStyle}>Element</th>
            <th style={thStyle}>Symbol</th>
            <th style={thStyle}>Atomic No.</th>
            <th style={thStyle}>Atomic Mass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((cols, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <td style={tdStyle}>{cols[0] ?? '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#22c55e', fontWeight: '700' }}>{cols[1] ?? '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{cols[2] ?? '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{cols[3] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Example section (with elements table for 1.4) ────────────────────────────
function ExampleBlock({ text, topicCode }: { text: string; topicCode: string }) {
  if (!text?.trim()) return null
  const isElementsTable = topicCode === '1.4'
  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '20px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <SectionLabel label="Example" color="#f59e0b" />
      {isElementsTable ? (
        <ElementsTable raw={text} />
      ) : (
        <div style={{
          fontSize: '14px', color: '#cbd5e1', lineHeight: '1.8',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

// ── Topic card ───────────────────────────────────────────────────────────────
function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div style={cardStyle}>
      {/* Code + page row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', color: '#22c55e',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)',
          borderRadius: '5px', padding: '2px 8px',
        }}>
          {topic.topic_code}
        </span>
        {topic.page != null && (
          <span style={{
            fontSize: '11px', color: '#64748b',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '5px', padding: '2px 8px',
          }}>
            p. {topic.page}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: '17px', fontWeight: '800', color: '#f1f5f9',
        margin: '0 0 2px', lineHeight: '1.35',
      }}>
        {topic.topic_title}
      </h2>

      {/* Sections */}
      <SectionBlock  label="Definition"  text={topic.definition  ?? ''} color="#22c55e" />
      <SectionBlock  label="Explanation" text={topic.explanation ?? ''} color="#0ea5e9" />
      <ExampleBlock  text={topic.example ?? ''} topicCode={topic.topic_code} />
      <FormulaBlock  text={topic.formula ?? ''} />
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ height = '100px' }: { height?: string }) {
  return <div className="skeleton" style={{ width: '100%', height, borderRadius: '14px' }} />
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ChapterPage() {
  const router    = useRouter()
  const params    = useParams()
  const chapterId = params?.id as string

  const [topics,       setTopics]       = useState<Topic[]>([])
  const [chapterTitle, setChapterTitle] = useState('')
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (!chapterId) return

    const load = async () => {
      try {
        const supabase = getSupabaseClient()
        if (!supabase) {
          setError('Database not configured.')
          setLoading(false)
          return
        }

        console.log('[chapter-view] raw params.id:', chapterId)
        const chapterNumber = parseInt(chapterId, 10)
        console.log('[chapter-view] parsed chapterNumber:', chapterNumber)

        const { data: debugData, error: debugError } = await supabase
          .from('topics')
          .select('id, chapter_number, topic_code, topic_title')
          .limit(20)

        console.log('[chapter-view] ALL topics in DB:', debugData)
        console.log('[chapter-view] debug error:', debugError)

        const { data, error: dbError } = await supabase
          .from('topics')
          .select('*')
          .eq('chapter_number', chapterNumber)
          .not('topic_code', 'like', '%.MCQ%')
          .order('topic_code', { ascending: true })

        console.log('[chapter-view] chapterNumber:', chapterNumber)
        console.log('[chapter-view] topics found:', data?.length)
        console.log('[chapter-view] error:', dbError)

        if (dbError) throw dbError

        const parseCode = (code: string) => {
          const parts = code.replace('MCQ', '999').split('.')
          return parseFloat(parts[0]) * 1000 + parseFloat(parts[1] || '0')
        }
        const rows = ((data ?? []) as Topic[]).sort(
          (a, b) => parseCode(a.topic_code) - parseCode(b.topic_code)
        )
        setTopics(rows)
        if (rows.length > 0) setChapterTitle(rows[0].chapter_title)
      } catch (e: unknown) {
        console.error('Chapter load error:', e)
        setError('Failed to load chapter. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [chapterId])

  const displayTitle = chapterTitle || `Chapter ${chapterId}`

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>

      {/* ── Sticky Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '62px',
        background: 'rgba(10,14,26,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: '14px',
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#94a3b8', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          ← Dashboard
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '14px', fontWeight: '700', color: '#f1f5f9',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {loading ? 'Loading…' : displayTitle}
          </p>
        </div>

        <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {!loading && `${topics.length} topics`}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <div style={{ paddingTop: '62px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '36px 20px 100px' }}>

          {/* Chapter heading */}
          {!loading && !error && (
            <div style={{ marginBottom: '36px' }}>
              <p style={{
                fontSize: '11px', color: '#22c55e', textTransform: 'uppercase',
                letterSpacing: '1px', fontWeight: '700', marginBottom: '8px',
              }}>
                Chapter {chapterId}
              </p>
              <h1 style={{
                fontSize: '26px', fontWeight: '900', color: '#f1f5f9',
                margin: 0, lineHeight: '1.3',
              }}>
                {displayTitle}
              </h1>
              <div style={{
                width: '48px', height: '3px', marginTop: '14px',
                background: 'linear-gradient(90deg, #22c55e, #0ea5e9)',
                borderRadius: '3px',
              }} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              ...cardStyle, textAlign: 'center', padding: '48px 24px',
              borderColor: 'rgba(239,68,68,0.2)',
            }}>
              <p style={{ fontSize: '16px', color: '#f87171', marginBottom: '16px' }}>{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true) }}
                style={{
                  padding: '9px 20px', borderRadius: '9px', background: '#22c55e',
                  color: '#000', fontWeight: '700', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px',
                }}
              >Retry</button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={i % 2 === 0 ? '160px' : '120px'} />
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && !error && topics.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 24px' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>📚</p>
              <p style={{ fontSize: '16px', color: '#f1f5f9', fontWeight: '600', marginBottom: '8px' }}>
                No topics found
              </p>
              <p style={{ fontSize: '13px', color: '#64748b' }}>Chapter {chapterId} has no content yet.</p>
            </div>
          )}

          {/* Topics */}
          {!loading && !error && topics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {topics.map(topic => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </div>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 600px) {
          nav { padding: 0 14px !important; }
        }
      `}</style>
    </div>
  )
}
