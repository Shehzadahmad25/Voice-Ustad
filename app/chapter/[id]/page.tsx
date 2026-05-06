'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Topic {
  id: string
  chapter: number
  section: string
  term: string
  topic_slug: string
  page_ref: number | null
  book_definition: string | null
  example_q: string | null
  formula: string | string[] | null
  keywords: string[] | null
  type: string | null
  difficulty: string | null
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color }}>{label}</span>
    </div>
  )
}

// ── Generic section block ────────────────────────────────────────────────────
function SectionBlock({ label, text, color }: { label: string; text: string; color: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <SectionLabel label={label} color={color} />
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', lineHeight: '1.8', color: '#cbd5e1' }}>
        {text.replace(/(\d+\.\s)/g, '\n$1').replace(/^\n/, '')}
      </div>
    </div>
  )
}

// ── Formula section (monospace, handles array) ───────────────────────────────
function FormulaBlock({ formula }: { formula: string | string[] | null }) {
  const lines = Array.isArray(formula)
    ? formula.map((f) => String(f).trim()).filter(Boolean)
    : (typeof formula === 'string' && formula.trim() ? [formula.trim()] : [])
  if (lines.length === 0) return null
  return (
    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {lines.length <= 10 && <SectionLabel label="Formula" color="#a78bfa" />}
      <div style={{
        background: 'rgba(167,139,250,0.06)',
        border: '1px solid rgba(167,139,250,0.15)',
        borderRadius: '8px', padding: '14px 16px',
      }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            fontSize: '13.5px', color: '#e2d9ff', lineHeight: '1.9',
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            borderBottom: i < lines.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            paddingBottom: i < lines.length - 1 ? '6px' : '0',
            marginBottom: i < lines.length - 1 ? '6px' : '0',
          }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Example section ──────────────────────────────────────────────────────────
function ExampleBlock({ text }: { text: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <SectionLabel label="Example" color="#f59e0b" />
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', lineHeight: '1.8', color: '#cbd5e1' }}>
        {text.replace(/(\d+\.\s)/g, '\n$1').replace(/^\n/, '')}
      </div>
    </div>
  )
}

// ── Topic card ───────────────────────────────────────────────────────────────
function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div style={cardStyle}>
      {/* Section badge + page ref */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', color: '#22c55e',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)',
          borderRadius: '5px', padding: '2px 8px',
        }}>
          {topic.section}
        </span>
        {topic.page_ref != null && (
          <span style={{
            fontSize: '11px', color: '#64748b',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '5px', padding: '2px 8px',
          }}>
            p. {topic.page_ref}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 2px', lineHeight: '1.35' }}>
        {topic.term}
      </h2>

      {/* Content sections — guide_explanation (Roman Urdu) intentionally excluded */}
      <SectionBlock label="Definition" text={topic.book_definition ?? ''} color="#22c55e" />
      <ExampleBlock text={topic.example_q ?? ''} />
      <FormulaBlock formula={topic.formula} />
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
        const res  = await fetch(`/api/chapter-content?chapter=${encodeURIComponent(chapterId)}&board=KPK`)
        const json = await res.json()

        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Failed to load chapter')
        }

        setChapterTitle(`Chapter ${json.chapter.unit_number}: ${json.chapter.title}`)
        setTopics(json.topics as Topic[])
      } catch (e: unknown) {
        console.error('[chapter-page] load error:', e)
        setError('Failed to load chapter. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [chapterId])

  const displayTitle = chapterTitle || 'Loading chapter…'

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
                {displayTitle.split(':')[0]}
              </p>
              <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#f1f5f9', margin: 0, lineHeight: '1.3' }}>
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
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px', borderColor: 'rgba(239,68,68,0.2)' }}>
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
              <p style={{ fontSize: '13px', color: '#64748b' }}>{displayTitle} has no content yet.</p>
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
