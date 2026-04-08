const fs = require('fs');
let src = fs.readFileSync('./app/chat/page.tsx', 'utf8');
// Normalize to LF for matching, we'll restore CRLF at the end
const hasCRLF = src.includes('\r\n');
if (hasCRLF) src = src.replace(/\r\n/g, '\n');

let ok = true;
function patch(desc, oldStr, newStr) {
  if (!src.includes(oldStr)) {
    console.error('MISS: ' + desc);
    ok = false;
    return;
  }
  src = src.replace(oldStr, newStr);
  console.log('OK:   ' + desc);
}

// ─── PATCH A: imports ───────────────────────────────────────────────────────
patch(
  'imports',
  "import { useEffect } from 'react';",
  "import { useEffect, useState, useRef } from 'react';\nimport { createBrowserClient } from '@supabase/auth-helpers-nextjs';\nimport { getTimeAgo } from '@/lib/utils';"
);

// ─── PATCH C: stub buildPrevChats ───────────────────────────────────────────
const oldBP = `function buildPrevChats(){
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
patch('buildPrevChats stub', oldBP, `function buildPrevChats(){ /* Sidebar history managed by Supabase \u2014 see dbLoadHistory */ }`);

// ─── PATCH F: newChat — reset session state ──────────────────────────────────
patch(
  'newChat reset session',
  'function newChat(){\n  if(sendTimeout){ clearTimeout(sendTimeout); sendTimeout=null; }',
  `function newChat(){
  _currentSessionId = null;
  _sessionHasTitle = false;
  if (_setActiveSessionId) _setActiveSessionId(null);
  if (typeof window !== 'undefined') window.history.pushState({}, '', '/chat');
  if(sendTimeout){ clearTimeout(sendTimeout); sendTimeout=null; }`
);

// ─── PATCH G: send() — auto-create session + save user message ───────────────
const oldSendBlock = `  if(!started){
    const m=document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
    appendDivider('Today');
    started=true;
    userScrolled=false;
  }

  lastQuestion=txt;
  inp.value=''; resize(inp); updateSendBtn();
  appendUser(txt, ts(), true);
  busy=true; setSpin(true); showTyping();`;

const newSendBlock = `  if(!started){
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
  if (_currentSessionId) { dbSaveMessage(_currentSessionId, 'user', txt).catch(console.error); }
  busy=true; setSpin(true); showTyping();`;

patch('send: auto-create session + save user msg', oldSendBlock, newSendBlock);

// ─── PATCH G2: save AI response after appendAI ──────────────────────────────
patch(
  'send: save AI response',
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

// ─── PATCH H: React component — add supabaseRef + useState ───────────────────
patch(
  'component: supabaseRef + sessions state',
  'export default function ChatPage() {\n  const router = useRouter();\n  const { user, profile } = useAuth();',
  `export default function ChatPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabaseRef = useRef(
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  );
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);`
);

// ─── PATCH H2: useEffect for Supabase init + URL session restore ─────────────
patch(
  'useEffect: Supabase init',
  '  useEffect(() => {\n    initApp();',
  `  useEffect(() => {
    _sbClient = supabaseRef.current;
    _currentUserId = user?.id || null;
    _setSessions = setSessions;
    _setActiveSessionId = setActiveSessionId;
    dbLoadHistory();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      _currentSessionId = sessionId;
      dbLoadSession(sessionId);
    }
    initApp();`
);

// ─── PATCH I: Sidebar — replace sbPrevList div with React session list ────────
patch(
  'sidebar: session list',
  '        <div className="sb-sec">Chats</div>\n        <div className="sb-prev-list" id="sbPrevList"></div>',
  `        <div className="sb-sec">Chats</div>
        <div className="sb-prev-list" id="sbPrevList">
          {sessions.length === 0 ? (
            <div className="sb-prev-empty">No previous chats yet</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={\`session-item sb-prev-item \${activeSessionId === s.id ? 'active' : ''}\`}
                style={{ cursor: 'pointer', position: 'relative', display: 'block', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', background: activeSessionId === s.id ? 'rgba(99,102,241,0.12)' : 'transparent' }}
                onClick={() => (window as any).dbLoadSession(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && (window as any).dbLoadSession(s.id)}
              >
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || 'Untitled conversation'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {s.last_message || 'No messages yet'}
                  </span>
                  <span>{getTimeAgo(s.updated_at)}</span>
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => (window as any).dbDeleteSession(s.id, e)}
                  style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px', opacity: 0 }}
                  aria-label="Delete conversation"
                  title="Delete"
                >
                  \u00d7
                </button>
              </div>
            ))
          )}
        </div>`
);

// Restore CRLF if original had it
if (hasCRLF) src = src.replace(/\n/g, '\r\n');

fs.writeFileSync('./app/chat/page.tsx', src, 'utf8');
console.log('\nLines:', src.split('\n').length);
if (!ok) { console.error('\nSome patches missed — check above'); process.exit(1); }
console.log('All patches applied successfully.');
