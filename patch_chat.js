const fs = require('fs');
let src = fs.readFileSync('./app/chat/page.tsx', 'utf8');

// ─── PATCH A: imports ───────────────────────────────────────────────────────
src = src.replace(
  "import { useEffect } from 'react';\nimport { useRouter } from 'next/navigation';\nimport { useAuth } from '@/contexts/AuthContext';\nimport TopNav from '@/components/TopNav';",
  "import { useEffect, useState, useRef } from 'react';\nimport { useRouter } from 'next/navigation';\nimport { useAuth } from '@/contexts/AuthContext';\nimport { createBrowserClient } from '@supabase/auth-helpers-nextjs';\nimport TopNav from '@/components/TopNav';\nimport { getTimeAgo } from '@/lib/utils';"
);

// ─── PATCH B: module-level session state ────────────────────────────────────
src = src.replace(
  "let viewerTrial='Trial active';",
  "let viewerTrial='Trial active';\n\n/* \u2500\u2500\u2500 Supabase session state (set by ChatPage component) \u2500\u2500\u2500 */\nlet _sbClient: any = null;\nlet _currentUserId: string | null = null;\nlet _currentSessionId: string | null = null;\nlet _sessionHasTitle = false;\nlet _setSessions: ((s: any[]) => void) | null = null;\nlet _setActiveSessionId: ((id: string | null) => void) | null = null;"
);

// ─── PATCH C: stub buildPrevChats ───────────────────────────────────────────
const oldBuildPrev = `function buildPrevChats(){
  const el = document.getElementById('sbPrevList');
  if (!el) return;

  const saved = getSavedChatIndexes().slice(0, 8);
  if (!saved.length) {
    el.innerHTML = \`<div class="sb-prev-empty">No previous chats yet</div>\`;
    return;
  }

  const h = loadHistory();
  el.innerHTML = saved.map((i) => {
    const ch = CHS[i];
    const msgs = h[i] || [];
    const lastUser = [...msgs].reverse().find((m: any) => m?.type === 'user')?.text || 'Saved conversation';
    const preview = esc(String(lastUser));
    return \`<button class="sb-prev-item" type="button" onclick="openPrevChat(\${i})" aria-label="Open previous chat for \${esc(ch?.t || \`Chapter \${i+1}\`)}">
      <div class="sb-prev-row">
        <span class="sb-prev-chip">Ch \${esc(ch?.n || String(i+1))}</span>
        <span class="sb-prev-meta">\${msgs.length} msgs</span>
      </div>
      <div class="sb-prev-title">\${esc(ch?.t || 'Saved chat')}</div>
      <div class="sb-prev-preview">\${preview.slice(0, 44)}\${preview.length > 44 ? '...' : ''}</div>
    </button>\`;
  }).join('');
}`;
if (!src.includes('function buildPrevChats(){')) { console.error('MISS: buildPrevChats'); process.exit(1); }
src = src.replace(oldBuildPrev, "function buildPrevChats(){ /* Sidebar history managed by Supabase \u2014 see dbLoadHistory */ }");

// ─── PATCH D: new Supabase functions (insert before newChat) ────────────────
const supabaseFunctions = `/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   SUPABASE \u2014 Session & History helpers
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

async function dbLoadHistory() {
  if (!_sbClient || !_currentUserId) return;
  try {
    const { data, error } = await _sbClient
      .from('chat_sessions')
      .select('*')
      .eq('user_id', _currentUserId)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) { console.error('History load error:', error); return; }
    if (_setSessions) _setSessions(data || []);
  } catch (e) { console.error('dbLoadHistory error:', e); }
}

async function dbCreateSession(): Promise<string | null> {
  if (!_sbClient || !_currentUserId) return null;
  try {
    const { data, error } = await _sbClient
      .from('chat_sessions')
      .insert({
        user_id: _currentUserId,
        title: 'New Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) { console.error('Session create error:', error); return null; }
    _currentSessionId = data.id;
    _sessionHasTitle = false;
    if (_setActiveSessionId) _setActiveSessionId(data.id);
    if (typeof window !== 'undefined')
      window.history.pushState({}, '', '/chat?session=' + data.id);
    return data.id;
  } catch (e) { console.error('dbCreateSession error:', e); return null; }
}

async function dbSaveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  urduAudioText?: string
) {
  if (!_sbClient || !_currentUserId || !sessionId) return;
  try {
    await _sbClient.from('chat_messages').insert({
      session_id: sessionId,
      user_id: _currentUserId,
      role,
      content,
      urdu_audio_text: urduAudioText || null,
    });
    const isFirstUserMsg = role === 'user' && !_sessionHasTitle;
    if (isFirstUserMsg) _sessionHasTitle = true;
    await _sbClient.from('chat_sessions').update({
      last_message: content.slice(0, 100),
      updated_at: new Date().toISOString(),
      ...(isFirstUserMsg ? { title: content.slice(0, 50) } : {}),
    }).eq('id', sessionId);
    try { await _sbClient.rpc('increment_message_count', { session_id: sessionId }); } catch {}
    await dbLoadHistory();
  } catch (e) { console.error('dbSaveMessage error:', e); }
}

async function dbLoadSession(sessionId: string) {
  if (!_sbClient) return;
  try {
    const { data, error } = await _sbClient
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Load session error:', error); return; }
    started = false; chatHistory = [];
    const m = document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML = '<div class="msgs-inner" id="msgsInner"></div>';
    const msgs = data || [];
    if (msgs.length > 0) {
      started = true;
      appendDivider('Restored conversation');
      for (const msg of msgs) {
        if (msg.role === 'user') {
          appendUser(msg.content, formatTime(msg.created_at), false);
        } else {
          let resp: any;
          try { resp = JSON.parse(msg.content); } catch { resp = { text: msg.content, points: [] }; }
          if (!resp.urduTtsText && msg.urdu_audio_text) resp.urduTtsText = msg.urdu_audio_text;
          appendAI(resp, formatTime(msg.created_at), false);
        }
      }
      scrollDn(true);
    } else {
      showWelcome();
    }
    _currentSessionId = sessionId;
    _sessionHasTitle = true;
    if (_setActiveSessionId) _setActiveSessionId(sessionId);
    if (typeof window !== 'undefined')
      window.history.pushState({}, '', '/chat?session=' + sessionId);
    closeSb();
  } catch (e) { console.error('dbLoadSession error:', e); }
}

async function dbDeleteSession(sessionId: string, e: any) {
  e?.stopPropagation?.();
  if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
  if (!_sbClient) return;
  try {
    await _sbClient.from('chat_messages').delete().eq('session_id', sessionId);
    await _sbClient.from('chat_sessions').delete().eq('id', sessionId);
    if (_currentSessionId === sessionId) {
      _currentSessionId = null;
      if (_setActiveSessionId) _setActiveSessionId(null);
      showWelcome();
      if (typeof window !== 'undefined') window.history.pushState({}, '', '/chat');
    }
    await dbLoadHistory();
  } catch (err) { console.error('dbDeleteSession error:', err); }
}

`;

src = src.replace('function newChat(){', supabaseFunctions + 'function newChat(){');

// ─── PATCH E: expose new fns in initApp ─────────────────────────────────────
src = src.replace(
  '  w.scrollDn = scrollDn;',
  '  w.scrollDn = scrollDn;\n  w.dbLoadSession = dbLoadSession;\n  w.dbDeleteSession = dbDeleteSession;'
);

// ─── PATCH F: newChat — reset session state ──────────────────────────────────
src = src.replace(
  'function newChat(){\n  if(sendTimeout){ clearTimeout(sendTimeout); sendTimeout=null; }',
  'function newChat(){\n  _currentSessionId = null;\n  _sessionHasTitle = false;\n  if (_setActiveSessionId) _setActiveSessionId(null);\n  if (typeof window !== \'undefined\') window.history.pushState({}, \'\', \'/chat\');\n  if(sendTimeout){ clearTimeout(sendTimeout); sendTimeout=null; }'
);

// ─── PATCH G: send() — auto-create session + save user message ──────────────
const oldStartedBlock = `  if(!started){
    const m=document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
    appendDivider('Today');
    started=true;
    userScrolled=false;
  }

  lastQuestion=txt;
  inp.value=''; resize(inp); updateSendBtn();
  appendUser(txt, ts(), true);`;

const newStartedBlock = `  if(!started){
    const m=document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
    appendDivider('Today');
    started=true;
    userScrolled=false;
  }

  if (!_currentSessionId) { await dbCreateSession(); }

  lastQuestion=txt;
  inp.value=''; resize(inp); updateSendBtn();
  appendUser(txt, ts(), true);
  if (_currentSessionId) { dbSaveMessage(_currentSessionId, 'user', txt).catch(console.error); }`;

src = src.replace(oldStartedBlock, newStartedBlock);

// ─── PATCH G2: save AI response after appendAI ──────────────────────────────
src = src.replace(
  '  appendAI(resp, ts(), true);\n}\n\nfunction ask(q){',
  `  appendAI(resp, ts(), true);
  if (_currentSessionId) {
    const aiContent = JSON.stringify(resp);
    const urduText = String(resp.urduSummary || resp.urduTtsText || '');
    dbSaveMessage(_currentSessionId, 'assistant', aiContent, urduText).catch(console.error);
  }
}

function ask(q){`
);

// ─── PATCH H: React component — add supabase + useState ──────────────────────
src = src.replace(
  "export default function ChatPage() {\n  const router = useRouter();\n  const { user, profile } = useAuth();",
  "export default function ChatPage() {\n  const router = useRouter();\n  const { user, profile } = useAuth();\n  const supabaseRef = useRef(\n    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)\n  );\n  const [sessions, setSessions] = useState<any[]>([]);\n  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);"
);

// ─── PATCH H2: add useEffect for Supabase init + URL session ────────────────
src = src.replace(
  "  useEffect(() => {\n    initApp();",
  `  useEffect(() => {
    _sbClient = supabaseRef.current;
    _currentUserId = user?.id || null;
    _setSessions = setSessions;
    _setActiveSessionId = (id) => { _currentSessionId = id; setActiveSessionId(id); };
    if (user?.id) {
      dbLoadHistory();
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('session');
      if (sid) setTimeout(() => dbLoadSession(sid), 300);
    }
  }, [user?.id]);

  useEffect(() => {
    initApp();`
);

// ─── PATCH I: sidebar JSX — replace old Chats section ────────────────────────
src = src.replace(
  `        <div className="sb-sec">Chats</div>
        <div className="sb-prev-list" id="sbPrevList"></div>`,
  `        <div className="sb-sec">Chats</div>
        <div style={{ overflowY: 'auto', maxHeight: '38vh', paddingBottom: '4px' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: '16px 12px', fontSize: '12.5px', color: '#64748b', textAlign: 'center', lineHeight: '1.6' }}>
              No previous chats yet.<br/>Start a new conversation!
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                className="session-item"
                onClick={() => dbLoadSession(session.id)}
                style={{
                  padding: '10px 12px', borderRadius: '9px', marginBottom: '3px',
                  cursor: 'pointer', position: 'relative',
                  background: activeSessionId === session.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                  border: activeSessionId === session.id ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: '600', color: activeSessionId === session.id ? '#22c55e' : '#f1f5f9', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as any, marginBottom: '3px' }}>
                  {'\u{1F4AC}'} {session.title || 'New Conversation'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as any }}>
                  {session.last_message || 'No messages yet'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '3px' }}>
                  {getTimeAgo(session.updated_at)}
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => dbDeleteSession(session.id, e)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '3px 7px', fontSize: '11px', color: '#ef4444', cursor: 'pointer' }}
                >
                  {'\uD83D\uDDD1'}
                </button>
              </div>
            ))
          )}
        </div>`
);

fs.writeFileSync('./app/chat/page.tsx', src, 'utf8');
console.log('All patches applied. Lines:', src.split('\n').length);

// Verify key patches
const checks = [
  ['imports: useState,useRef', src.includes("useState, useRef")],
  ['imports: createBrowserClient', src.includes("createBrowserClient")],
  ['imports: getTimeAgo', src.includes("getTimeAgo")],
  ['module vars: _sbClient', src.includes('let _sbClient')],
  ['module vars: _currentSessionId', src.includes('let _currentSessionId')],
  ['buildPrevChats stubbed', src.includes('Sidebar history managed by Supabase')],
  ['dbLoadHistory', src.includes('async function dbLoadHistory()')],
  ['dbCreateSession', src.includes('async function dbCreateSession()')],
  ['dbSaveMessage', src.includes('async function dbSaveMessage(')],
  ['dbLoadSession', src.includes('async function dbLoadSession(')],
  ['dbDeleteSession', src.includes('async function dbDeleteSession(')],
  ['initApp: dbLoadSession exposed', src.includes('w.dbLoadSession = dbLoadSession')],
  ['newChat resets session', src.includes('_currentSessionId = null;\n  _sessionHasTitle = false')],
  ['send: auto-create session', src.includes('if (!_currentSessionId) { await dbCreateSession(); }')],
  ['send: save user msg', src.includes("dbSaveMessage(_currentSessionId, 'user', txt)")],
  ['send: save AI response', src.includes("dbSaveMessage(_currentSessionId, 'assistant'")],
  ['component: supabaseRef', src.includes('supabaseRef = useRef')],
  ['component: sessions state', src.includes('[sessions, setSessions]')],
  ['component: Supabase useEffect', src.includes('_sbClient = supabaseRef.current')],
  ['sidebar: session list', src.includes('sessions.map(session =>')],
  ['sidebar: delete button', src.includes('dbDeleteSession(session.id, e)')],
];
console.log('\n=== Verification ===');
let allOk = true;
checks.forEach(([name, ok]) => { console.log((ok?'✓':'✗') + ' ' + name); if (!ok) allOk = false; });
if (!allOk) process.exit(1);
console.log('\nAll checks passed!');
