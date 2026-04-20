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
  padding: '22px 24px',
  position: 'relative',
  overflow: 'hidden',
}

function SectionBlock({ label, text, color }: { label: string; text: string; color: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{ marginTop: '14px' }}>
      <span style={{
        display: 'inline-block',
        fontSize: '10.5px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.7px',
        color,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        borderRadius: '5px',
        padding: '2px 8px',
        marginBottom: '7px',
      }}>{label}</span>
      <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.7', margin: 0 }}>
        {text}
      </p>
    </div>
  )
}

function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div style={cardStyle}>
      {/* Topic code + page */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', color: '#22c55e',
          textTransform: 'uppercase', letterSpacing: '0.6px',
        }}>
          {topic.topic_code}
        </span>
        {topic.page != null && (
          <span style={{
            fontSize: '11px', color: '#64748b',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '5px', padding: '1px 7px',
          }}>
            p.{topic.page}
          </span>
        )}
      </div>

      {/* Topic title */}
      <h2 style={{
        fontSize: '16px', fontWeight: '700', color: '#f1f5f9',
        margin: '0 0 4px', lineHeight: '1.4',
      }}>
        {topic.topic_title}
      </h2>

      {/* Sections */}
      <SectionBlock label="Definition"   text={topic.definition  ?? ''} color="#22c55e" />
      <SectionBlock label="Explanation"  text={topic.explanation ?? ''} color="#0ea5e9" />
      <SectionBlock label="Example"      text={topic.example     ?? ''} color="#f59e0b" />
      <SectionBlock label="Formula"      text={topic.formula     ?? ''} color="#a78bfa" />
    </div>
  )
}

function Skeleton({ height = '100px' }: { height?: string }) {
  return <div className="skeleton" style={{ width: '100%', height, borderRadius: '14px' }} />
}

export default function ChapterPage() {
  const router   = useRouter()
  const params   = useParams()
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

        const chapterNumber = parseInt(chapterId, 10)

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

        const rows = (data ?? []) as Topic[]
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
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
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

        <div style={{
          fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {!loading && `${topics.length} topics`}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <div style={{ paddingTop: '62px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '36px 20px 100px' }}>

          {/* Chapter heading */}
          {!loading && !error && (
            <div style={{ marginBottom: '32px' }}>
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
                width: '48px', height: '3px', marginTop: '12px',
                background: 'linear-gradient(90deg, #22c55e, #0ea5e9)',
                borderRadius: '3px',
              }} />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div style={{
              ...cardStyle,
              textAlign: 'center', padding: '48px 24px',
              borderColor: 'rgba(239,68,68,0.2)',
            }}>
              <p style={{ fontSize: '16px', color: '#f87171', marginBottom: '16px' }}>{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true); }}
                style={{
                  padding: '9px 20px', borderRadius: '9px', background: '#22c55e',
                  color: '#000', fontWeight: '700', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={i % 2 === 0 ? '140px' : '100px'} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && topics.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 24px' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>📚</p>
              <p style={{ fontSize: '16px', color: '#f1f5f9', fontWeight: '600', marginBottom: '8px' }}>
                No topics found
              </p>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                Chapter {chapterId} has no content yet.
              </p>
            </div>
          )}

          {/* Topic cards */}
          {!loading && !error && topics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
