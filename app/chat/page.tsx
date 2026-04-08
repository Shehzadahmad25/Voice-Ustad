/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// @ts-nocheck
'use client';
import './chat.css';
import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { getTimeAgo } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
// CHAPTER DATA WILL BE LOADED FROM SUPABASE
const CHS: Array<{p:number; n:string; t:string; chips:string[]; followups:string[]; on?:boolean}> = [];

// Chapter scope topics per chapter index (0-based)
const CHAPTER_SCOPE_DATA: Record<number, string[]> = {
  0: [
    '1.1 Mole and Avogadro\'s Number (p.1)',
    '1.2 Mole Calculation (p.5)',
    '1.2.1 Mole and Chemical Equations (p.8)',
    '1.2.2 Calculations Involving Gases (p.12)',
    '1.3 Percentage Composition (p.14)',
    '1.4 Excess and Limiting Reagents (p.17)',
    '1.5 Theoretical Yield and Percent Yield (p.19)',
    'Exercise MCQs — 12 Questions (End of Chapter)',
  ],
};

let _setScopeTopics: ((t: string[]) => void) | null = null;

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
let started=false, busy=false, ri=0, micOn=false;
let activeCh='';
let activeChIdx=0;
const ENABLED_CHAPTERS: Set<number> = new Set(); // Populated from Supabase
const timers={};
const audioPlayers: any = {};
const audioUrls: any = {};
const audioCacheKeys: any = {};
const ttsLoading: any = {};
const ttsReady: any = {};
const audioErrors: any = {};
const urduSummaries: any = {};
const voiceSources: any = {};
const cacheIdForId: any = {};     // DB row UUID for semantic-match cache hits
const questionForId: any = {};    // original question, sent with mode=audio to enable storage save
let userScrolled=false;
let lastQuestion='';
let sendTimeout: number | null = null;
let _currentRequestId = 0;  // incremented on every send; stale responses are dropped
const TRIAL_DAYS=7;
const SEND_TIMEOUT_MS=45000;
let viewerName='Student';
let viewerInitial='S';
let viewerEmail='';
let viewerFocus='Chemistry focus';
let viewerTrial='Trial active';

/* ─── Supabase session state (set by ChatPage component) ─── */
let _sbClient: any = null;
let _currentUserId: string | null = null;
let _currentSessionId: string | null = null;
let _sessionHasTitle = false;
let _setSessions: ((s: any[]) => void) | null = null;
let _setActiveSessionId: ((id: string | null) => void) | null = null;

function computeViewerInitial(name: string){
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return 'S';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function updateViewerUi(){
  const nameEl = document.getElementById('sbUserName');
  if (nameEl) nameEl.textContent = viewerName;

  const avatarEl = document.getElementById('sbUserAvatar');
  if (avatarEl) avatarEl.textContent = viewerInitial;

  const planEl = document.getElementById('planLabel');
  if (planEl) planEl.textContent = viewerFocus;

  const trialEl = document.getElementById('trialBarSub');
  if (trialEl) trialEl.textContent = viewerTrial;

  const topbarMetaEl = document.getElementById('tbMeta');
  if (topbarMetaEl) topbarMetaEl.textContent = viewerEmail || viewerFocus;

  const welcomeEyebrowEl = document.getElementById('wlEyebrow');
  if (welcomeEyebrowEl) welcomeEyebrowEl.textContent = `Welcome back, ${viewerName}`;

  const welcomeBodyEl = document.getElementById('wlBody');
  if (welcomeBodyEl) {
    welcomeBodyEl.textContent =
      'Ask in English. Get a clear chemistry explanation with optional Urdu audio.';
  }

  const welcomeMetaEl = document.getElementById('wlMeta');
  if (welcomeMetaEl) welcomeMetaEl.textContent = `${viewerFocus} - ${viewerTrial}`;
}

function setViewerContext(next: {
  name?: string;
  email?: string;
  focus?: string;
  trial?: string;
}){
  viewerName = String(next.name || viewerName || 'Student').trim() || 'Student';
  viewerInitial = computeViewerInitial(viewerName);
  viewerEmail = String(next.email || '').trim();
  viewerFocus = String(next.focus || viewerFocus || 'Chemistry focus').trim();
  viewerTrial = String(next.trial || viewerTrial || 'Trial active').trim();
  updateViewerUi();
}

function isChapterAvailable(i: number){
  return ENABLED_CHAPTERS.has(i);
}

function chapterSoonResponse(i: number){
  const ch = CHS[i];
  return {
    definition:  `${ch?.t || 'This chapter'} is not available yet.`,
    explanation: 'This chapter has not been enabled. Please select an available chapter from the sidebar.',
    example:     '',
    formula:     '',
    flabel:      '',
    dur:         18,
    urduTtsText: 'Yeh chapter abhi available nahin hai. Sidebar se koi available chapter select karein.',
  };
}

/* â”€â”€â”€ localStorage conversation history â”€â”€â”€ */
const STORAGE_KEY='voiceustad_history';
const AUDIO_CACHE_KEY='voiceustad_audio_cache_v1';
const AUDIO_CACHE_MAX=24;
function loadHistory(){
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }
  catch(e){ return {}; }
}

function loadAudioCache(){
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(AUDIO_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function saveAudioCache(cache: any){
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(AUDIO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}
function hashText(input: string){
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function makeAudioCacheKey(text: string){
  const t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 1400);
  return t ? `ur_${hashText(t)}` : '';
}
function getCachedAudio(text: string){
  const key = makeAudioCacheKey(text);
  if (!key) return null;
  const cache = loadAudioCache();
  const val = cache[key];
  return typeof val === 'string' && val ? { key, audioBase64: val } : null;
}
function putCachedAudio(text: string, audioBase64: string){
  const key = makeAudioCacheKey(text);
  const audio = String(audioBase64 || '').trim();
  if (!key || !audio) return '';
  const cache = loadAudioCache();
  const next = { ...cache, [key]: audio };
  const keys = Object.keys(next);
  if (keys.length > AUDIO_CACHE_MAX) {
    const keep = keys.slice(keys.length - AUDIO_CACHE_MAX);
    const pruned: any = {};
    keep.forEach((k) => { pruned[k] = next[k]; });
    saveAudioCache(pruned);
  } else {
    saveAudioCache(next);
  }
  return key;
}

/**
 * Clears the browser-side audio blob cache from localStorage.
 * Exposed as window.clearBrowserAudioCache() for console access.
 * Also callable via the Clear Cache button in the sidebar (dev mode).
 */
function clearBrowserAudioCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUDIO_CACHE_KEY);
    console.log('[VoiceUstad] Browser audio cache cleared (localStorage)');
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  (window as any).clearBrowserAudioCache = clearBrowserAudioCache;
}

/**
 * Calls the server-side clear-cache API then clears the browser cache.
 * Exposed as window.__devClearCache() for console access.
 */
async function devClearAllCache(): Promise<void> {
  try {
    const key = new URLSearchParams(window.location.search).get('key') || '';
    const url  = `/api/admin/clear-cache${key ? `?key=${encodeURIComponent(key)}` : ''}`;
    const res  = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      clearBrowserAudioCache();
      const msg = `Cache cleared: ${data.qaCacheAudioFieldsCleared ?? 0} qa_cache rows, ${data.storageFilesDeleted ?? 0} storage files`;
      console.log('[VoiceUstad]', msg);
      showToast('Cache cleared', 'TTS audio cache cleared. Re-ask to regenerate.');
    } else {
      console.error('[VoiceUstad] clear-cache error:', data.error);
      showToast('Error', data.error || 'Cache clear failed');
    }
  } catch (e) {
    console.error('[VoiceUstad] devClearAllCache error:', e);
  }
}
if (typeof window !== 'undefined') {
  (window as any).__devClearCache = devClearAllCache;
}
function saveHistory(chIdx: number, msgs: any[]){
  if (typeof window === 'undefined') return;
  try {
    const h=loadHistory();
    h[chIdx]=msgs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch(e){}
}
function getChHistory(chIdx: number){
  return loadHistory()[chIdx]||[];
}
function getSavedChatIndexes(){
  const h = loadHistory();
  return Object.keys(h)
    .map((k) => Number(k))
    .filter((i) => Number.isInteger(i) && i >= 0 && Array.isArray(h[i]) && h[i].length > 0)
    .sort((a, b) => {
      const aLen = (h[a] || []).length;
      const bLen = (h[b] || []).length;
      return bLen - aLen;
    });
}
/* Each history item: {type:'user'|'ai', text, time, response?} */
let chatHistory: any[] = []; // in-memory for current chapter

/* â”€â”€â”€ Web Speech API â”€â”€â”€ */
let recognition: any = null;
function setupSpeechRecognition(){
  if (typeof window === 'undefined' || recognition) return;
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if(SpeechRecognition){
    recognition = new SpeechRecognition();
    recognition.lang='en-US';
    recognition.interimResults=true;
    recognition.maxAlternatives=1;
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INIT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function initApp(){
  if (typeof window === 'undefined') return;
  setupSpeechRecognition();
  setupMobileEnhancements();
  const w = window as any;
  w.openSb = openSb;
  w.closeSb = closeSb;
  w.openUpgrade = openUpgrade;
  w.closeUpgrade = closeUpgrade;
  w.openScope = openScope;
  w.closeScope = closeScope;
  w.newChat = newChat;
  w.send = send;
  w.ask = ask;
  w.viewTopic = viewTopic;
  w.retryLast = retryLast;
  w.editMsg = editMsg;
  w.copyAnswer = copyAnswer;
  w.feedback = feedback;
  w.togglePlay = togglePlay;
  w.retryAudio = retryAudio;
  w.toggleMic = toggleMic;
  w.selCh = selCh;
  w.toggleChapterPanel = toggleChapterPanel;
  w.openPrevChat = openPrevChat;
  w.filterChs = filterChs;
  w.scrollDn = scrollDn;
  w.dbLoadSession = dbLoadSession;
  w.dbDeleteSession = dbDeleteSession;
  w.goToSettings = () => {
    window.location.href = '/settings';
  };

  buildSb();
  buildPrevChats();
  showWelcome();
  updateInputPlaceholder(activeChIdx);
  updateSendBtn();
  buildChips(activeChIdx);
  updateTopbarSub(activeChIdx);
  sanitizeVisibleUiText();
  const tbSub = document.getElementById('tbSub');
  if (tbSub) tbSub.textContent = tbSub.textContent?.replace('Aú', '•') || '';

  // NOTE: sendBtn click is handled by React onClick in JSX — no addEventListener needed.
  // Adding another listener here causes the duplicate-response bug (both fire on click).
  const msg = document.getElementById('msg');
  if (msg) {
    msg.addEventListener('keyup', () => updateSendBtn());
  }

  const msgs = document.getElementById('msgs') as HTMLElement;
  if (msgs) {
    msgs.addEventListener('scroll',()=>{
      const distFromBottom=msgs.scrollHeight-msgs.scrollTop-msgs.clientHeight;
      userScrolled=distFromBottom>120;
      const scrollBtn = document.getElementById('scrollBtn');
      if (scrollBtn) scrollBtn.classList.toggle('show', userScrolled);
  });
  }

  // Escape key closes sidebar + modal
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      closeSb();
      closeUpgrade();
      closeScope();
    }
  });

  // Trap focus inside upgrade modal when open
  const upgradeBg = document.getElementById('upgradeBg');
  if (upgradeBg) upgradeBg.addEventListener('keydown', trapFocus);
}

function sanitizeVisibleUiText(){
  // Clean a few known mojibake UI strings without touching answer content.
  const plan = document.getElementById('planLabel');
  if (plan && plan.textContent) {
    plan.textContent = plan.textContent.replace(/\s+ú\s+/g, ' - ');
  }
  const badge = document.querySelector('.modal-badge');
  if (badge && badge.textContent && badge.textContent.includes('? Upgrade')) {
    badge.textContent = 'Pro Upgrade';
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FOCUS TRAP (upgrade modal)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function trapFocus(e: KeyboardEvent){
  if(e.key!=='Tab') return;
  const modal=document.querySelector('#upgradeBg .modal') as HTMLElement;
  if (!modal) return;
  const focusable=[...modal.querySelectorAll('button,[tabindex]:not([tabindex="-1"])')] as HTMLElement[];
  const first=focusable[0], last=focusable[focusable.length-1];
  if(e.shiftKey){ if(document.activeElement===first){ e.preventDefault(); last.focus(); } }
  else { if(document.activeElement===last){ e.preventDefault(); first.focus(); } }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SIDEBAR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function buildSb(filter=''){
  const q=filter.trim().toLowerCase();
  let h='', lp=0;
  CHS.forEach((c,i)=>{
    if(q && !c.t.toLowerCase().includes(q) && !c.n.includes(q)) return;
    if(c.p!==lp){ h+=`<div class="sb-part">Part ${c.p}</div>`; lp=c.p; }
    const hasSaved = getChHistory(i).length>0;
    h+=`<div class="sb-ch-wrap" id="sb-ch-wrap-${i}">
      <div class="sb-ch${c.on?' on':''}" role="button" tabindex="0"
            aria-label="Chapter ${c.n}: ${c.t}${hasSaved?' - has saved history':''}"
            onclick="selCh(${i})" onkeydown="if(event.key==='Enter')selCh(${i})">
        <div class="sb-ch-dot"></div>
        <div class="sb-ch-label">${esc(c.t)}</div>
        <div class="sb-ch-n">${c.n}${hasSaved?'<span style="color:var(--brand);margin-left:3px">·</span>':''}</div>
        <button class="sb-ch-expand" onclick="event.stopPropagation();toggleChapterPanel(${i},${c.id||0})" aria-label="Show topics for chapter ${c.n}" title="Topics &amp; resources">&#9656;</button>
      </div>
      <div class="sb-ch-panel" id="sb-ch-panel-${i}"></div>
    </div>`;
  });
  h = h.replace(
    /<span style="color:var\(--brand\);margin-left:3px">.*?<\/span>/g,
    '<span style="color:var(--brand);margin-left:3px" aria-label="Saved history">•</span>',
  );
  if(!h) h=`<div style="padding:16px;text-align:center;font-size:.78rem;color:var(--t3)">No chapters found</div>`;
  const sbList = document.getElementById('sbList');
  if (sbList) sbList.innerHTML = h;
}

function buildPrevChats(){ /* Sidebar history managed by Supabase — see dbLoadHistory */ }

async function toggleChapterPanel(idx, chId) {
  const panelEl = document.getElementById('sb-ch-panel-'+idx);
  const btnEl = document.querySelector('#sb-ch-wrap-'+idx+' .sb-ch-expand');
  if (!panelEl) return;
  if (panelEl.dataset.open === '1') {
    panelEl.innerHTML = '';
    panelEl.dataset.open = '0';
    if (btnEl) btnEl.classList.remove('open');
    return;
  }
  panelEl.innerHTML = '<div class="sb-panel-loading">Loading topics…</div>';
  panelEl.dataset.open = '1';
  if (btnEl) btnEl.classList.add('open');
  if (!_sbClient || !chId) {
    panelEl.innerHTML = '<div class="sb-panel-err">Not available</div>';
    return;
  }
  try {
    const [topicsRes, mcqRes, exRes, sqRes, nqRes, dqRes] = await Promise.all([
      _sbClient.from('topics').select('section, title').eq('chapter_id', chId).order('section'),
      _sbClient.from('mcqs').select('id', { count: 'exact', head: true }).eq('chapter_id', chId),
      _sbClient.from('examples').select('id', { count: 'exact', head: true }).eq('chapter_id', chId),
      _sbClient.from('short_questions').select('id', { count: 'exact', head: true }).eq('chapter_id', chId),
      _sbClient.from('numerical_questions').select('id', { count: 'exact', head: true }).eq('chapter_id', chId),
      _sbClient.from('descriptive_questions').select('id', { count: 'exact', head: true }).eq('chapter_id', chId),
    ]);
    const topics = topicsRes.data || [];
    const mcqCount = mcqRes.count || 0;
    const exCount = exRes.count || 0;
    const exerciseCount = (sqRes.count || 0) + (nqRes.count || 0) + (dqRes.count || 0);
    const chN = CHS[idx]?.n || String(idx + 1);
    let html = '<div class="sb-panel">';
    if (topics.length > 0) {
      html += '<div class="sb-panel-topics">';
      window.__topicData = window.__topicData || {};
      topics.forEach(function(t, ti) {
        const key = 'tp_'+idx+'_'+ti;
        window.__topicData[key] = { title: String(t.title || '').replace(/\s+/g, ' ').trim(), chN: Number(CHS[idx]?.n ?? 0) };
        html += '<div class="sb-panel-topic" role="button" tabindex="0"'
          +' onclick="viewTopic(window.__topicData[\''+key+'\'].title,window.__topicData[\''+key+'\'].chN);closeSb()"'
          +' onkeydown="if(event.key===\'Enter\'){viewTopic(window.__topicData[\''+key+'\'].title,window.__topicData[\''+key+'\'].chN);closeSb()}">'
          +'<span class="sb-panel-sec">'+esc(t.section)+'</span>'
          +'<span class="sb-panel-ttl">'+esc(t.title)+'</span>'
          +'</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="sb-panel-loading">No topics found</div>';
    }
    if (mcqCount || exCount || exerciseCount) {
      html += '<div class="sb-panel-badges">';
      if (mcqCount) html += '<span class="sb-panel-badge">'+mcqCount+' MCQs</span>';
      if (exCount) html += '<span class="sb-panel-badge">'+exCount+' Examples</span>';
      if (exerciseCount) html += '<span class="sb-panel-badge">'+exerciseCount+' Exercises</span>';
      html += '</div>';
    }
    html += '</div>';
    panelEl.innerHTML = html;
  } catch (e) {
    panelEl.innerHTML = '<div class="sb-panel-err">Failed to load</div>';
    console.error('toggleChapterPanel error:', e);
  }
}

function openPrevChat(i: number){
  selCh(i);
}

function filterChs(val: string){ buildSb(val); }

function selCh(i: number){
  if(!isChapterAvailable(i)){
    showToast('Soon', `${CHS[i]?.t || 'This chapter'} will be available shortly`);
    return;
  }
  CHS.forEach((c,j)=>c.on=j===i);
  activeChIdx=i;
  ri=0;
  // Immediately populate scope from static data (may be empty for most chapters)
  if (_setScopeTopics) _setScopeTopics(CHAPTER_SCOPE_DATA[i] || []);
  // Fire-and-forget: load topics from DB and refresh scope modal for this chapter
  const _scopeChId = (CHS[i] as any)?.id;
  if (_sbClient && _scopeChId && _setScopeTopics) {
    _sbClient
      .from('topics')
      .select('section, title')
      .eq('chapter_id', _scopeChId)
      .order('section')
      .then(({ data }: { data: Array<{ section: string; title: string }> | null }) => {
        if (data && data.length > 0 && _setScopeTopics) {
          const dbTopics = data.map((t) =>
            t.section ? `${t.section} ${t.title}` : t.title,
          );
          _setScopeTopics(dbTopics);
        }
      })
      .catch(() => {/* non-fatal */});
  }
  const sbSearch = document.getElementById('sbSearch') as HTMLInputElement;
  buildSb(sbSearch?.value || '');
  activeCh=`Chapter ${CHS[i]?.n || String(i+1)} - ${CHS[i]?.t || ''}`;
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) tbTitle.textContent=activeCh;
  updateTopbarSub(i);
  updateInputPlaceholder(i);
  sanitizeVisibleUiText();
  const tbSub2 = document.getElementById('tbSub');
  if (tbSub2) tbSub2.textContent = tbSub2.textContent?.replace('Aú', '•') || '';
  buildChips(i);
  closeSb();
  // Load saved history for this chapter, or show welcome
  chatHistory=getChHistory(i);
  if(chatHistory.length>0){
    restoreHistory();
  } else {
    if(started) appendDivider('Switched to '+(CHS[i]?.t || 'chapter'));
  }
}

function updateTopbarSub(i: number){
  const part = CHS[i]?.p;
  const tbSub = document.getElementById('tbSub');
  if (tbSub) tbSub.textContent = part ? `FSc Chemistry · Part ${part}` : 'FSc Chemistry';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HISTORY â€” localStorage restore
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function restoreHistory(){
  started=true;
  const m=document.getElementById('msgs') as HTMLElement;
  if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
  appendDivider('Restored - '+activeCh);
  chatHistory.forEach(item=>{
    if(item.type==='user') appendUser(item.text, item.time, false);
    else if(item.type==='ai') appendAI(item.response, item.time, false);
  });
  buildPrevChats();
  scrollDn(true);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CHIPS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function buildChips(_i: number){ /* chips removed */ }

function openSb(){
  const sb=document.getElementById('sb') as HTMLElement;
  const ov=document.getElementById('ov') as HTMLElement;
  if (sb) sb.classList.add('on');
  if (ov) ov.classList.add('on');
  // Move focus into sidebar for keyboard users
  setTimeout(()=>sb?.querySelector('[tabindex="0"]')?.focus(), 50);
}
function closeSb(){
  const sb = document.getElementById('sb');
  const ov = document.getElementById('ov');
  if (sb) sb.classList.remove('on');
  if (ov) ov.classList.remove('on');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   UPGRADE MODAL
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function openUpgrade(){
  const bg=document.getElementById('upgradeBg') as HTMLElement;
  if (bg) {
    bg.classList.add('on');
    setTimeout(()=>bg.querySelector('.modal-close')?.focus(), 50);
  }
}
function closeUpgrade(){
  const bg = document.getElementById('upgradeBg');
  if (bg) bg.classList.remove('on');
}

function openScope(){
  const bg=document.getElementById('scopeBg') as HTMLElement;
  if (bg) {
    bg.classList.add('on');
    setTimeout(()=>bg.querySelector('.modal-close')?.focus(), 50);
  }
}
function closeScope(){
  const bg=document.getElementById('scopeBg');
  if (bg) bg.classList.remove('on');
}

function askScopeTopic(topic: string){
  // Strip section number (e.g. "1.1 ") and page ref (e.g. " (p.1)")
  const clean = String(topic || '')
    .replace(/^\d+\.\d+\s+/, '')           // strip leading "1.1 "
    .replace(/\s*[\((]p\.\d+[)\)].*$/i, '') // strip "(p.5)" suffix
    .replace(/\s*—.*$/, '')                 // strip " — ..." suffix
    .trim();
  closeScope();
  viewTopic(clean, Number(CHS[activeChIdx]?.n ?? 0));
}

/* ═══════════════════════════════════════════════════════════════
   TOPIC VIEW MODE
   Called when a topic is clicked in sidebar panel or scope modal.
   Uses /api/topic-view — completely separate from question mode.
═══════════════════════════════════════════════════════════════ */
async function viewTopic(topicTitle: string, chN: number){
  if (busy) return;
  const title = String(topicTitle || '').replace(/\s+/g, ' ').trim();
  console.log("VIEW TOPIC CALLED:", title);
  if (!title) return;

  if (!started){
    const m = document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML = '<div class="msgs-inner" id="msgsInner"></div>';
    appendDivider('Today');
    started = true;
    userScrolled = false;
  }

  if (!_currentSessionId) { await dbCreateSession(); }

  appendUser('\uD83D\uDCCB Topic: ' + title, ts(), true);
  if (_currentSessionId) {
    dbSaveMessage(_currentSessionId, 'user', '\uD83D\uDCCB Topic: ' + title).catch(console.error);
  }

  busy = true; setSpin(true); showTyping();

  let timedOut = false;
  const controller = new AbortController();
  sendTimeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
    hideTyping(); busy = false; setSpin(false); updateSendBtn();
    clearTimeout(sendTimeout);
    appendError();
  }, SEND_TIMEOUT_MS);

  try {
    const apiRes = await fetch('/api/topic-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ topicTitle: title, chapterNumber: chN }),
    });

    if (timedOut) return;
    clearTimeout(sendTimeout);
    hideTyping(); busy = false; setSpin(false); updateSendBtn();

    if (!apiRes.ok) {
      let errData: any = null;
      try { errData = await apiRes.json(); } catch {}
      appendError('Topic error', String(errData?.error || 'Could not load topic'));
      return;
    }

    const data = await apiRes.json();
    if (!data?.ok || !data?.result) {
      appendError('Topic not found', 'Content for this topic is not yet available in the database.');
      return;
    }

    appendTopicView(data.result);
    if (_currentSessionId) {
      dbSaveMessage(
        _currentSessionId,
        'assistant',
        JSON.stringify(data.result),
        String(data.result?.urduTtsText || ''),
      ).catch(console.error);
    }
  } catch (e: any) {
    if (timedOut) return;
    clearTimeout(sendTimeout);
    hideTyping(); busy = false; setSpin(false); updateSendBtn();
    appendError('AI error', e?.message || 'AI provider unavailable');
  }
}

function appendTopicView(r: any){
  const id = 'v' + Date.now();

  const urduSummary = String(r?.urduTtsText || '').trim();
  urduSummaries[id] = urduSummary;

  if (r?.audioBase64) {
    audioUrls[id] = `data:audio/mpeg;base64,${r.audioBase64}`;
    audioCacheKeys[id] = putCachedAudio(urduSummary, String(r.audioBase64));
    ttsReady[id] = true;
    setVoiceSource(id, 'openai');
  } else {
    const cached = getCachedAudio(urduSummary);
    if (cached) {
      audioUrls[id] = `data:audio/mpeg;base64,${cached.audioBase64}`;
      audioCacheKeys[id] = cached.key;
      ttsReady[id] = true;
      setVoiceSource(id, 'openai');
    } else {
      setVoiceSource(id, 'unknown');
    }
  }

  // Page label
  const pageLabel = (() => {
    if (r.page_start && r.page_end && r.page_start !== r.page_end)
      return `Pages \u00A0${r.page_start}\u2013${r.page_end}`;
    if (r.page_start) return `Page\u00A0${r.page_start}`;
    return '';
  })();

  // Duration
  const allText = [r.definition, r.explanation, r.example].filter(Boolean).join(' ');
  const wordCount = allText.split(/\s+/).filter(Boolean).length;
  const dur = Math.max(r.dur || 0, Math.round(wordCount / 2.8), 30);
  const mm = Math.floor(dur / 60);
  const ss = String(dur % 60).padStart(2, '0');
  const ttsUrText = encodeURIComponent(urduSummary);

  // Content sections
  let sectionsHtml = '';
  if (r.definition)
    sectionsHtml += `<div class="tv-section tv-section--definition"><div class="tv-sec-lbl">Definition</div><div class="tv-sec-body">${esc(r.definition)}</div></div>`;
  if (r.explanation)
    sectionsHtml += `<div class="tv-section tv-section--explanation"><div class="tv-sec-lbl">Explanation</div><div class="tv-sec-body">${esc(r.explanation)}</div></div>`;
  if (r.formula)
    sectionsHtml += `<div class="tv-section tv-formula-sec"><div class="tv-sec-lbl">${esc(r.flabel || 'Formula')}</div><div class="tv-formula-body">${fmtBody(r.formula)}</div></div>`;
  if (r.example)
    sectionsHtml += `<div class="tv-section tv-section--example"><div class="tv-sec-lbl">Example</div><div class="tv-sec-body">${fmtExample(r.example)}</div></div>`;
  if (!sectionsHtml)
    sectionsHtml = '<div class="tv-empty">No textbook content available for this topic yet.</div>';

  const copyText = [r.definition, r.explanation, r.formula, r.example]
    .filter(Boolean).join('\n\n');

  // Store copy text out of band — avoids JSON.stringify double-quotes breaking onclick="..."
  const w2 = (window as any);
  w2.__copyData = w2.__copyData || {};
  w2.__copyData[id] = copyText;

  const voiceHtml = urduSummary ? `
    <div class="voice-card" role="region" aria-label="Urdu voice explanation">
      <div class="vc-top-row">
        <div class="vc-icon" aria-hidden="true">&#128266;</div>
        <div class="vc-info">
          <div class="vc-label">Urdu audio</div>
          <div class="vc-sub" lang="ur" dir="ltr">Play &#8212; ${dur}s</div>
          <div class="vc-loading" id="vcload_${id}" aria-live="polite">
            <span class="vc-dot"></span><span class="vc-dot"></span><span class="vc-dot"></span>
            Preparing audio...
          </div>
        </div>
        <span class="vc-badge src-unknown" id="badge_${id}" aria-label="Urdu voice source">Urdu</span>
        <div class="vc-wave" id="wv_${id}" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="vc-timer" id="tm_${id}" aria-live="polite">${mm}:${ss}</div>
        <button class="vc-play" id="btn_${id}" data-dur="${dur}" data-tts="" data-tts-ur="${ttsUrText}"
          aria-label="Play Urdu audio" aria-pressed="false" onclick="togglePlay('${id}')">
          <svg class="ico-play" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3l14 9L5 21V3z"/></svg>
          <svg class="ico-stop" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </button>
        <button class="vc-retry" id="retry_${id}" type="button" aria-label="Retry Urdu voice" onclick="retryAudio('${id}')">
          Retry audio
        </button>
      </div>
      <div class="vc-progress" id="prog_${id}" role="progressbar" aria-valuemin="0" aria-valuemax="${dur}" aria-valuenow="0">
        <div class="vc-progress-bar" id="progbar_${id}"></div>
      </div>
    </div>` : '';

  const w = document.createElement('div');
  w.innerHTML = `
    <div class="msg-ai msg-topic-view" role="log" aria-label="Topic view: ${esc(r.topic || '')}">
      <div class="ai-av tv-av" aria-hidden="true">T</div>
      <div class="ai-col">

        <div class="tv-header">
          <div class="tv-mode-badge">Topic View</div>
          <div class="tv-title">${esc(r.topic || r.chapter || '')}</div>
          <div class="tv-meta-row">
            <span class="tv-chapter-lbl">${esc(r.chapter || '')}</span>
            ${pageLabel ? `<span class="tv-page-badge">${esc(pageLabel)}</span>` : ''}
          </div>
        </div>

        <div class="tv-sections">${sectionsHtml}</div>

        ${voiceHtml}

        <div class="ai-actions" role="toolbar" aria-label="Topic actions">
          <button class="ai-action-btn" id="copy_${id}" aria-label="Copy topic content"
            onclick="copyAnswer('${id}')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </button>
        </div>

        <div class="ai-time">${ts()}</div>
      </div>
    </div>`;

  getInner().appendChild(w);
  scrollDn();
  setVoiceSource(id, voiceSources[id] || 'unknown');
  prefetchUrduAudio(id);
  const retryBtn = document.getElementById('retry_' + id) as HTMLButtonElement | null;
  if (retryBtn) retryBtn.style.display = audioUrls[id] ? 'none' : 'inline-flex';
}

function updateInputPlaceholder(chIdx: number){
  const msg = document.getElementById('msg') as HTMLTextAreaElement | null;
  if (!msg) return;
  const ch = CHS[chIdx];
  msg.placeholder = ch ? `Ask anything from ${ch.t}...` : 'Ask your chemistry question...';
}

function isOutOfScopeAtomicResponse(text: string){
  const t = String(text || '').toLowerCase();
  return t.includes('this topic is not included in the current lesson');
}

function scopeGuardResponse(userText: string){
  return {
    definition:  'This question is outside the current chapter scope.',
    explanation: 'AI answers are limited to the current chapter topics. Use the "What can I ask?" button to see allowed topics.',
    example:     `Your question: "${String(userText || '').slice(0, 90)}"`,
    formula:     '',
    flabel:      '',
    dur:         24,
    urduTtsText: 'Yeh sawal is chapter ki scope se bahar hai. Meherbani kar ke allowed topics mein se poochhein.',
  };
}

function cleanLooseValue(v: string){
  return String(v || '')
    .trim()
    .replace(/^[,\s]+/, '')
    .replace(/[,\s]+$/, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}

function recoverLabelledResponse(rawText: string){
  const input = String(rawText || '').trim();
  if (!/\btext\s*:/.test(input) || !/\bpoints\s*:/.test(input)) return null;

  const keyRe = /\b(text|points|formula|flabel|dur|tip|urduTtsText|mcq)\s*:/gi;
  const hits: Array<{ key: string; idx: number; valueStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(input)) !== null) {
    hits.push({ key: String(m[1] || '').toLowerCase(), idx: m.index, valueStart: keyRe.lastIndex });
  }
  if (!hits.length) return null;

  const out: any = {};
  for (let i = 0; i < hits.length; i += 1) {
    const cur = hits[i];
    const next = hits[i + 1];
    const value = cleanLooseValue(input.slice(cur.valueStart, next ? next.idx : input.length));
    if (!value) continue;

    if (cur.key === 'text') out.text = value;
    else if (cur.key === 'points') {
      const pts = value
        .split(/,\s*(?=[A-Z][a-z]|[A-Z][a-z]+ quantum|\d+\.)/)
        .map((p) => cleanLooseValue(p))
        .filter(Boolean)
        .slice(0, 6);
      out.points = pts;
    } else if (cur.key === 'formula') out.formula = value;
    else if (cur.key === 'flabel') out.flabel = value;
    else if (cur.key === 'tip') out.tip = value;
    else if (cur.key === 'urduttstext') out.urduTtsText = value;
    else if (cur.key === 'dur') {
      const n = Number(String(value).match(/\d+/)?.[0] || '');
      if (Number.isFinite(n)) out.dur = n;
    } else if (cur.key === 'mcq') {
      const q = cleanLooseValue(String(value.match(/question\s*:\s*([\s\S]*?)(?=,\s*options\s*:|,\s*correct\s*:|$)/i)?.[1] || ''));
      const optRaw = cleanLooseValue(String(value.match(/options\s*:\s*([\s\S]*?)(?=,\s*correct\s*:|$)/i)?.[1] || ''));
      const c = cleanLooseValue(String(value.match(/correct\s*:\s*([\s\S]*)$/i)?.[1] || ''));
      const options = optRaw
        ? optRaw
            .split(/,\s*(?=[A-D][\.\):]\s*)/)
            .map((o) => cleanLooseValue(o.replace(/^[A-D][\.\):]\s*/i, '')))
            .filter(Boolean)
            .slice(0, 4)
        : [];
      if (q || options.length || c) out.mcq = { question: q, options, correct: c };
    }
  }

  if (!out.text) return null;
  if (!Array.isArray(out.points) || !out.points.length) {
    out.points = ['Key idea', 'Important detail', 'Example'];
  }
  return out;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOAST
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function showToast(icon: string, msg: string, duration: number = 2400){
  const wrap=document.getElementById('toastWrap') as HTMLElement;
  if (!wrap) return;
  const safeIcon = (() => {
    const raw = String(icon || '').trim();
    if (!raw) return 'Info';
    if (['Soon','Note','Audio','Edit','Copy','OK'].includes(raw)) return raw;
    if (/copy/i.test(msg)) return 'Copy';
    if (/feedback|thanks/i.test(msg)) return 'OK';
    if (/edit/i.test(msg)) return 'Edit';
    return 'Info';
  })();
  const t=document.createElement('div');
  t.className='toast';
  t.innerHTML=`<span class="toast-icon">${esc(safeIcon)}</span><span>${esc(msg)}</span>`;
  wrap.appendChild(t);
  setTimeout(()=>{
    t.classList.add('fade-out');
    setTimeout(()=>t.remove(), 350);
  }, duration);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   WELCOME
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function showWelcome(){
  started=false; ri=0; chatHistory=[];
  const m=document.getElementById('msgs') as HTMLElement;
  if (m) m.innerHTML=`<div class="msgs-inner" id="msgsInner">
    <div class="welcome">
      <div class="wl-eyebrow" id="wlEyebrow">Welcome back, ${esc(viewerName)}</div>
      <div class="wl-logo" aria-hidden="true">V</div>
      <h2 class="wl-h"><span>Welcome to VoiceUstad</span></h2>
      <p class="wl-p" id="wlBody">Ask in English. Get a clear explanation with optional Urdu audio.</p>
      <div class="wl-meta" id="wlMeta">${esc(viewerFocus)} - ${esc(viewerTrial)}</div>
      <button class="wl-scope-btn" type="button" aria-label="Show current chapter topics" onclick="openScope()">What can I ask?</button>
      <div class="wl-grid" id="wlGrid" role="list"></div>
    </div>
  </div>`;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SEND
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function send(){
  const inp=document.getElementById('msg') as HTMLInputElement;
  if (!inp) return;
  const txt=inp.value.trim();
  if(!txt||busy) return;

  // ── Lock immediately (before any await) ──────────────────────────────────────
  // This prevents double-sends from the double-wired button click and from rapid
  // Enter key + button click combinations.
  busy=true;
  const reqId = ++_currentRequestId;
  console.log('[send] start reqId:', reqId);

  if(!isChapterAvailable(activeChIdx)){
    if(!started){
      const m=document.getElementById('msgs') as HTMLElement;
      if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
      appendDivider('Today');
      started=true;
      userScrolled=false;
    }
    lastQuestion=txt;
    inp.value=''; resize(inp); updateSendBtn();
    appendUser(txt, ts(), true);
    appendAI(chapterSoonResponse(activeChIdx), ts(), true);
    busy=false;  // sync-only path: release lock here
    return;
  }

  if(!started){
    const m=document.getElementById('msgs') as HTMLElement;
    if (m) m.innerHTML='<div class="msgs-inner" id="msgsInner"></div>';
    appendDivider('Today');
    started=true;
    userScrolled=false;
  }

  // Session creation is async — check reqId after it resolves so a stale concurrent
  // call (which should never happen now that busy=true is set first) is still dropped.
  if (!_currentSessionId) { await dbCreateSession(); }
  if (reqId !== _currentRequestId) { busy=false; return; }  // stale: newer send started

  lastQuestion=txt;
  inp.value=''; resize(inp); updateSendBtn();
  appendUser(txt, ts(), true);
  if (_currentSessionId) { dbSaveMessage(_currentSessionId, 'user', txt).catch(console.error); }
  setSpin(true); showTyping();

  // ── Timeout — use a local variable so concurrent stale timers can't cross-cancel ──
  let timedOut=false;
  const controller = new AbortController();
  const localTimeout = window.setTimeout(()=>{
    if (reqId !== _currentRequestId) return;  // stale timer, ignore
    timedOut=true;
    controller.abort();
    hideTyping(); busy=false; setSpin(false); updateSendBtn();
    console.log('[send] timeout reqId:', reqId);
    appendError();
  }, SEND_TIMEOUT_MS);
  sendTimeout = localTimeout;  // keep global reference so newChat() can cancel it

  let resp: any = null;
  let rateLimitMsg = '';
  let rateLimitRetryMs = 0;
  try {
    const apiRes = await fetch('/api/chat2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: txt,
        chapter: CHS[activeChIdx]?.t ?? '',
        chapterNumber: Number(CHS[activeChIdx]?.n ?? 0),
        history: chatHistory.slice(-6),
      }),
    });

    if (!apiRes.ok) {
      let errData: any = null;
      try { errData = await apiRes.json(); } catch {}
      if (apiRes.status === 429) {
        const retryMs = Number(errData?.retryAfterMs || 0);
        rateLimitRetryMs = retryMs > 0 ? retryMs : 0;
        const retrySec = retryMs > 0 ? Math.ceil(retryMs / 1000) : 0;
        rateLimitMsg = retrySec
          ? `Too many requests. Please wait ${retrySec}s and try again.`
          : 'Too many requests. Please wait a moment and try again.';
      }
      throw new Error(String(errData?.error || 'API request failed'));
    }
    const data = await apiRes.json();
    if (data?.ok === false) {
      throw new Error(String(data?.error || 'API request failed'));
    }
    resp = data?.answer ?? null;
    if (resp) {
      if (data?.urduSummary)    resp.urduSummary = data.urduSummary;
      if (data?.audioBase64)    resp.audioBase64 = data.audioBase64;
      if (data?.audioError)     resp.audioError  = data.audioError;
      if (data?.audioUrl)       resp.audioUrl    = data.audioUrl;
      if (data?.cacheId)        resp.cacheId     = data.cacheId;
      if (data?.responseSource) resp._source     = data.responseSource;
    }
    console.log('[send] response reqId:', reqId, '| source:', data?.responseSource || 'unknown', '| cacheHit:', !!data?.cacheHit);
  } catch (e) {
    // Stale request — a newer send already owns the UI
    if (reqId !== _currentRequestId) { clearTimeout(localTimeout); busy=false; return; }
    if (rateLimitMsg) {
      if(timedOut) return;
      clearTimeout(localTimeout);
      hideTyping(); busy=false; setSpin(false); updateSendBtn();
      appendError('Rate limit reached', rateLimitMsg, rateLimitRetryMs);
      return;
    }
    if(timedOut) return;
    clearTimeout(localTimeout);
    hideTyping(); busy=false; setSpin(false); updateSendBtn();
    appendError('AI error', (e as any)?.message || 'AI provider unavailable');
    return;
  }

  // ── Drop stale response (reqId mismatch means a newer request already rendered) ──
  if (reqId !== _currentRequestId) { clearTimeout(localTimeout); busy=false; return; }
  // ── Cancel timeout — response arrived successfully ────────────────────────────
  if(timedOut) return;
  clearTimeout(localTimeout);
  hideTyping(); busy=false; setSpin(false); updateSendBtn();
  console.log('[send] appending response reqId:', reqId);

  // New structured format: at least one of definition/explanation/example must be set.
  // Legacy {text,points} format still accepted for old stored history items.
  const hasNewFormat    = resp && (resp.definition || resp.explanation || resp.example);
  const hasLegacyFormat = resp && resp.text && Array.isArray(resp.points);
  if (!resp || (!hasNewFormat && !hasLegacyFormat)) {
    appendError('AI error', 'Invalid AI response');
    return;
  }

  // Legacy fallback for very old stored responses where the AI returned labelled text
  const defaultPoints =
    Array.isArray(resp.points) &&
    resp.points.length === 3 &&
    String(resp.points[0]) === 'Key idea' &&
    String(resp.points[1]) === 'Important detail' &&
    String(resp.points[2]) === 'Example';
  if (defaultPoints && /\btext\s*:/.test(String(resp.text || ''))) {
    const recovered = recoverLabelledResponse(resp.text);
    if (recovered) {
      resp = { ...resp, ...recovered };
      if (!resp.urduSummary && recovered.urduTtsText) resp.urduSummary = recovered.urduTtsText;
    }
  }

  // Out-of-scope guard
  if (isOutOfScopeAtomicResponse(resp.definition || resp.text || '')) {
    resp = { ...scopeGuardResponse(txt), refPageNo: resp.refPageNo, refLabel: resp.refLabel };
  }
  appendAI(resp, ts(), true);
  if (_currentSessionId) {
    const aiContent = JSON.stringify(resp);
    const urduText = String(resp.urduSummary || resp.urduTtsText || '');
    dbSaveMessage(_currentSessionId, 'assistant', aiContent, urduText).catch(console.error);
  }
}

function ask(q){
  document.getElementById('msg').value=q;
  resize(document.getElementById('msg'));
  updateSendBtn();
  send();
}

function retryLast(){
  if(!lastQuestion) return;
  document.getElementById('msg').value=lastQuestion;
  resize(document.getElementById('msg'));
  updateSendBtn();
  send();
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RENDER â€” User message
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function appendUser(t, time, save=true){
  const w=document.createElement('div');
  w.innerHTML=`<div class="msg-user" role="log" aria-label="You said: ${esc(t)}">
    <div>
      <div class="u-bub">${esc(t)}</div>
      <div class="u-actions">
        <button class="u-action-btn" aria-label="Edit and resend this question" onclick="editMsg(this,'${esc(t).replace(/'/g,'&#39;')}')">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </div>
      <div class="u-time" aria-label="Sent at ${time}">${time}</div>
    </div>
  </div>`;
  getInner().appendChild(w); scrollDn();
  if(save){
    chatHistory.push({type:'user',text:t,time});
    saveHistory(activeChIdx, chatHistory);
    buildPrevChats();
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RENDER â€” AI message
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function appendAI(r, time, save=true){
  const id='v'+Date.now();
  const dur=r.dur;
  // Dynamic duration based on text length (item 16)
  const allText = [r.definition, r.explanation, r.example, r.text, ...(Array.isArray(r.points)?r.points:[])].filter(Boolean).join(' ');
  const wordCount = allText.split(/\s+/).length;
  const computedDur = Math.round(wordCount / 2.8); // ~2.8 Urdu words/sec
  const actualDur = Math.max(dur, computedDur);
  const mm=Math.floor(actualDur/60), ss=String(actualDur%60).padStart(2,'0');

  const urduSummary = String(r?.urduSummary || r?.urduTtsText || '').trim();
  urduSummaries[id] = urduSummary;
  cacheIdForId[id]  = r?.cacheId  || null;
  questionForId[id] = r?.question || lastQuestion || '';

  if (r?.audioBase64) {
    audioUrls[id] = `data:audio/mpeg;base64,${r.audioBase64}`;
    audioCacheKeys[id] = putCachedAudio(urduSummary, String(r.audioBase64));
    ttsReady[id] = true;
    setVoiceSource(id, 'openai');
  } else if (r?.audioUrl) {
    // Cached audio served directly from Supabase Storage CDN.
    // Append ?v= timestamp so the browser re-fetches after a cache clear + re-upload.
    const sep = String(r.audioUrl).includes('?') ? '&' : '?';
    audioUrls[id] = `${r.audioUrl}${sep}v=${Date.now()}`;
    ttsReady[id] = true;
    setVoiceSource(id, 'openai');
  } else {
    const cached = getCachedAudio(urduSummary);
    if (cached) {
      audioUrls[id] = `data:audio/mpeg;base64,${cached.audioBase64}`;
      audioCacheKeys[id] = cached.key;
      ttsReady[id] = true;
      setVoiceSource(id, 'openai');
    } else {
      setVoiceSource(id, 'unknown');
    }
  }
  if (r?.audioError) {
    audioErrors[id] = String(r.audioError);
  }

  const _pageRefVal = String(r.refPageNo || '').trim();
  const topPageRefHtml = (_pageRefVal && _pageRefVal !== 'TBD')
    ? `<span class="ai-page-ref" aria-label="Book page reference">Page ${esc(_pageRefVal)}</span>`
    : '';

  // ── New strict format: definition / explanation / example as clean text blocks ──
  const hasNewFormat = !!(r.definition || r.explanation || r.example);

  const contentHtml = hasNewFormat ? (() => {
    let html = '';
    if (r.definition) html += `<div class="ai-field"><div class="ai-field-lbl">Definition</div><div class="ai-field-body">${esc(r.definition)}</div></div>`;
    if (r.explanation) html += `<div class="ai-field"><div class="ai-field-lbl">Explanation</div><div class="ai-field-body">${esc(r.explanation)}</div></div>`;
    if (r.example) html += `<div class="ai-field"><div class="ai-field-lbl">Example</div><div class="ai-field-body">${esc(r.example)}</div></div>`;
    return `<div class="ai-card">${html}</div>`;
  })() : (() => {
    // Legacy format fallback for stored history
    const kp = (Array.isArray(r.points) ? r.points : []).map((p, i) => {
      const m = String(p).match(/^([A-Za-z][^:]{1,25}):\s*([\s\S]*)$/);
      const html = m ? '<strong>' + esc(m[1]) + ':</strong> ' + esc(m[2]) : esc(p);
      return `<div class="ai-pt"><div class="pt-num" aria-hidden="true">${i+1}</div><span>${html}</span></div>`;
    }).join('');
    return `<div class="ai-card"><div class="ai-intro">${esc(r.text||'')}</div><div class="ai-pts">${kp}</div></div>`;
  })();

  const formulaHtml = (r.formula??'') ? `
    <div class="ai-formula" lang="en">
      <div class="formula-lbl">${esc(r.flabel??'FORMULA')}</div>
      <div class="formula-body">${esc(r.formula)}</div>
    </div>` : '';

  const mcq = r.mcq;
  const mcqOptions = Array.isArray(mcq?.options) ? mcq.options : [];
  const mcqHtml = (mcq?.question && mcqOptions.length >= 2) ? `
    <div class="ai-mcq" role="group" aria-label="Related MCQ">
      <div class="mcq-title">Quick MCQ</div>
      <div class="mcq-q">${esc(mcq.question)}</div>
      <div class="mcq-opts">
        ${mcqOptions.map((o, i)=>`<div class="mcq-opt"><span class="mcq-opt-key">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></div>`).join('')}
      </div>
      ${mcq?.correct ? `<div class="mcq-ans">Correct: ${esc(mcq.correct)}</div>` : ''}
    </div>` : '';

  // Plain text for copy
  const copyText = [r.definition, r.explanation, r.example, r.formula??'']
    .filter(Boolean).join('\n') || [r.text, ...(Array.isArray(r.points)?r.points:[]), r.formula??''].filter(Boolean).join('\n');
  const ttsText = encodeURIComponent([r.text, ...(Array.isArray(r.points)?r.points:[])].filter(Boolean).join('. '));
  const ttsUrText = encodeURIComponent(r.urduTtsText || '');

  // Store copy text out of band — same fix as appendTopicView
  const _wcd = (window as any);
  _wcd.__copyData = _wcd.__copyData || {};
  _wcd.__copyData[id] = copyText;

  const w=document.createElement('div');
  w.innerHTML=`
    <div class="msg-ai" role="log" aria-label="VoiceUstad answer">
      <div class="ai-av" aria-hidden="true">V</div>
      <div class="ai-col">
        <div class="ai-ch-label" aria-label="Chapter: ${esc(activeCh)}">
          <span class="ai-ch-dot" aria-hidden="true"></span>${esc(activeCh)}${topPageRefHtml}
        </div>

        ${contentHtml}

        ${formulaHtml}
        ${mcqHtml}

        <div class="voice-card" role="region" aria-label="Urdu voice explanation">
          <div class="vc-top-row">
            <div class="vc-icon" aria-hidden="true">ðŸ”Š</div>
            <div class="vc-info">
              <div class="vc-label">Urdu audio</div>
              <div class="vc-sub" lang="ur" dir="ltr">Play - ${actualDur}s</div>
              <div class="vc-loading" id="vcload_${id}" aria-live="polite">
                <span class="vc-dot"></span>
                <span class="vc-dot"></span>
                <span class="vc-dot"></span>
                Preparing audio...
              </div>
            </div>
            <span class="vc-badge src-unknown" id="badge_${id}" aria-label="Urdu voice source">Urdu</span>
            <div class="vc-wave" id="wv_${id}" aria-hidden="true">
              <span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="vc-timer" id="tm_${id}" aria-live="polite">${mm}:${ss}</div>
            <button class="vc-play" id="btn_${id}" data-dur="${actualDur}" data-tts="${ttsText}" data-tts-ur="${ttsUrText}" aria-label="Play Urdu audio" aria-pressed="false" onclick="togglePlay('${id}')">
              <svg class="ico-play" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3l14 9L5 21V3z"/></svg>
              <svg class="ico-stop" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
            <button class="vc-retry" id="retry_${id}" type="button" aria-label="Retry Urdu voice" onclick="retryAudio('${id}')">
              Retry audio
            </button>
          </div>
          <div class="vc-progress" id="prog_${id}" role="progressbar" aria-valuemin="0" aria-valuemax="${actualDur}" aria-valuenow="0">
            <div class="vc-progress-bar" id="progbar_${id}"></div>
          </div>
        </div>

        <div class="ai-actions" role="toolbar" aria-label="Response actions">
          <button class="ai-action-btn" id="copy_${id}" aria-label="Copy answer to clipboard" onclick="copyAnswer('${id}')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </button>
          <div class="ai-action-sep" aria-hidden="true"></div>
          <button class="ai-action-btn thumb-up" id="up_${id}" aria-label="This answer was helpful" onclick="feedback('${id}','up')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path stroke-linecap="round" d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
            Good
          </button>
          <button class="ai-action-btn thumb-down" id="dn_${id}" aria-label="This answer was not helpful" onclick="feedback('${id}','down')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path stroke-linecap="round" d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
            Weak
          </button>
          <div class="ai-action-sep" aria-hidden="true"></div>
          <button class="ai-action-btn" aria-label="Regenerate this answer" onclick="retryLast()">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M1 4v6h6"/><path stroke-linecap="round" d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Retry
          </button>
        </div>

        <div class="ai-time" aria-label="Received at ${time}">${time}</div>
      </div>
    </div>`;

  getInner().appendChild(w); scrollDn();
  setVoiceSource(id, (voiceSources[id] || 'unknown'));
  prefetchUrduAudio(id);
  const retryBtn = document.getElementById('retry_'+id) as HTMLButtonElement | null;
  if (retryBtn) retryBtn.style.display = audioUrls[id] ? 'none' : 'inline-flex';
  if(save){
    chatHistory.push({type:'ai',response:r,time});
    saveHistory(activeChIdx, chatHistory);
    buildSb(document.getElementById('sbSearch').value); // refresh dot indicators
    buildPrevChats();
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RENDER â€” Error message (item 10)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function appendError(
  title='Response timed out',
  body='The server is taking longer than expected to respond. Please try again in a moment.',
  retryAfterMs=0
){
  const w=document.createElement('div');
  const retryId = `err_retry_${Date.now()}`;
  w.innerHTML=`<div class="msg-error" role="alert" aria-label="Error loading response">
    <div class="ai-av" aria-hidden="true" style="background:var(--red)">!</div>
    <div class="err-card">
      <div class="err-title">${esc(title)}</div>
      <div class="err-body">${esc(body)}</div>
      <button id="${retryId}" class="err-retry" aria-label="Retry sending your last question" onclick="retryLast()">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M1 4v6h6"/><path stroke-linecap="round" d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
        Try again
      </button>
    </div>
  </div>`;
  getInner().appendChild(w); scrollDn();
  if(retryAfterMs > 0){
    const btn = document.getElementById(retryId) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = true;
    const base = btn.innerHTML;
    const tick = () => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (secs <= 0) {
        btn.disabled = false;
        btn.innerHTML = base;
        return;
      }
      btn.innerHTML = `${base} (${secs}s)`;
      setTimeout(tick, 1000);
    };
    const endsAt = Date.now() + retryAfterMs;
    tick();
  }
}

function setVoiceSource(id: string, source: 'openai' | 'browser' | 'unknown'){
  voiceSources[id] = source;
  const badge = document.getElementById('badge_'+id);
  if (!badge) return;
  badge.classList.remove('src-openai', 'src-browser', 'src-unknown');
  if (source === 'openai') {
    badge.textContent = 'Urdu Voice';
    badge.classList.add('src-openai');
    return;
  }
  if (source === 'browser') {
    badge.textContent = 'Urdu Voice.';
    badge.classList.add('src-browser');
    return;
  }
  badge.textContent = 'Urdu Voice.';
  badge.classList.add('src-unknown');
}

async function prefetchUrduAudio(id){
  const cached = getCachedAudio(String(urduSummaries[id] || ''));
  if (!audioUrls[id] && cached) {
    audioUrls[id] = `data:audio/mpeg;base64,${cached.audioBase64}`;
    audioCacheKeys[id] = cached.key;
    ttsReady[id] = true;
    setVoiceSource(id, 'openai');
  }
  if (!audioUrls[id] && urduSummaries[id]) {
    retryAudio(id, true);
    return;
  }
  if(!audioUrls[id]) return;
  ttsReady[id]=true;
  setVoiceSource(id, 'openai');
  const btn=document.getElementById('btn_'+id);
  if(btn){
    btn.setAttribute('data-tts-ready','1');
    btn.setAttribute('title','Urdu audio ready');
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COPY ANSWER (item 5)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function copyAnswer(id: string){
  const text: string = (window as any).__copyData?.[id] ?? "";
  const btn=document.getElementById('copy_'+id);
  navigator.clipboard.writeText(text).then(()=>{
    btn.classList.add('copied');
    btn.innerHTML=`<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M20 6L9 17l-5-5"/></svg> Copied!`;
    showToast('ðŸ“‹','Answer copied to clipboard');
    setTimeout(()=>{
      btn.classList.remove('copied');
      btn.innerHTML=`<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
    }, 2200);
  }).catch(()=>{
    showToast('âŒ','Copy not supported in this browser');
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FEEDBACK (item 6)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function feedback(id, type){
  const upBtn=document.getElementById('up_'+id);
  const dnBtn=document.getElementById('dn_'+id);
  upBtn.classList.remove('active');
  dnBtn.classList.remove('active');
  if(type==='up'){
    upBtn.classList.add('active');
    showToast('ðŸ‘','Thanks for your feedback!');
  } else {
    dnBtn.classList.add('active');
    showToast('Note','Feedback noted - we\'ll improve this answer');
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   EDIT MESSAGE (item 7)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function editMsg(btn, originalText){
  const inp=document.getElementById('msg');
  // Decode HTML entities back to plain text
  const txt=originalText.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  inp.value=txt;
  resize(inp); updateSendBtn();
  inp.focus();
  // Position cursor at end
  inp.setSelectionRange(txt.length, txt.length);
  showToast('âœï¸','Edit your question and send again');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   VOICE â€” countdown + progress bar
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function togglePlay(id){
  const btn=document.getElementById('btn_'+id);
  if(!btn) return;
  const tm=document.getElementById('tm_'+id);
  const wv=document.getElementById('wv_'+id);
  const prog=document.getElementById('prog_'+id);
  const progbar=document.getElementById('progbar_'+id);
  const card = btn.closest('.voice-card');
  const sub = card?.querySelector('.vc-sub');
  const setLoading = (on: boolean) => {
    if (card) card.classList.toggle('loading', on);
    if (sub) {
      if (!sub.dataset.default) sub.dataset.default = sub.textContent || '';
      sub.textContent = on ? 'Preparing Urdu audio...' : (sub.dataset.default || '');
    }
  };
  const dur=parseInt(btn.dataset.dur);
  const isOn=timers[id]!=null;
  const isLoading=ttsLoading[id]===true;

  Object.keys(timers).forEach(k=>{ if(timers[k]!=null) stopPlay(k); });
  if(isOn || isLoading) return;

  const ttsText = decodeURIComponent(btn.dataset.tts || '');
  const ttsUrText = decodeURIComponent(btn.dataset.ttsUr || '');
  const hasAudioText = Boolean(urduSummaries[id] || ttsText || ttsUrText);
  if(!hasAudioText){
    showToast('Audio', 'No text available for Urdu audio');
    return;
  }

  ttsLoading[id]=true;
  setLoading(true);
  btn.setAttribute('disabled','true');

  btn.classList.add('playing');
  btn.setAttribute('aria-pressed','true');
  btn.setAttribute('aria-label','Stop Urdu audio');
  wv.classList.add('on');
  tm.classList.add('running');
  prog.classList.add('on');

  try{
    if(audioPlayers[id]){
      try { audioPlayers[id].pause(); } catch(e){}
      audioPlayers[id]=null;
    }

    if(!audioUrls[id]){
      const ok = await retryAudio(id, true);
      if (ok && audioUrls[id]) {
        const audio = new Audio(audioUrls[id]);
        audioPlayers[id]=audio;
        audio.onended=()=>stopPlay(id);
        audio.onerror=()=>stopPlay(id);
        await audio.play();
        setLoading(false);
      } else {
        const summary = String(urduSummaries[id] || '').trim();
        if (summary && speakUrdu(summary)) {
          setVoiceSource(id, 'browser');
          setLoading(false);
          return;
        }
        const errMsg = audioErrors[id] || 'Voice unavailable — Retry';
        throw new Error(errMsg);
      }
    } else {
      const audio = new Audio(audioUrls[id]);
      audioPlayers[id]=audio;
      audio.onended=()=>stopPlay(id);
      audio.onerror=()=>stopPlay(id);
      await audio.play();
      setVoiceSource(id, 'openai');
      setLoading(false);
    }
  } catch(e){
    // Fallback to browser speech so the UI still works if API TTS fails.
    if(window.speechSynthesis){
      window.speechSynthesis.cancel();
      const utter=new SpeechSynthesisUtterance(ttsUrText || ttsText);
      utter.lang='ur-PK'; utter.rate=0.9;
      window.speechSynthesis.speak(utter);
      setVoiceSource(id, 'browser');
      setLoading(false);
    } else {
      stopPlay(id);
      showToast('Audio', (e as any)?.message || 'Urdu TTS failed');
      ttsLoading[id]=false;
      btn.removeAttribute('disabled');
      return;
    }
  } finally {
    ttsLoading[id]=false;
    btn.removeAttribute('disabled');
    setLoading(false);
  }

  const startAt=Date.now();
  function tick(){
    const elapsed=(Date.now()-startAt)/1000;
    const rem=Math.max(0, dur-elapsed);
    const pct=Math.min(100,(elapsed/dur)*100);
    const m=Math.floor(rem/60), s=Math.floor(rem%60);
    tm.textContent=`${m}:${String(s).padStart(2,'0')}`;
    progbar.style.width=pct+'%';
    prog.setAttribute('aria-valuenow',Math.floor(elapsed));
    if(elapsed>=dur){ stopPlay(id); return; }
    timers[id]=requestAnimationFrame(tick);
  }
  timers[id]=requestAnimationFrame(tick);
}

function stopPlay(id){
  if(timers[id]){ cancelAnimationFrame(timers[id]); timers[id]=null; }
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  if(audioPlayers[id]){
    try { audioPlayers[id].pause(); } catch(e){}
    audioPlayers[id].currentTime=0;
    audioPlayers[id]=null;
  }
  const btnForStop=document.getElementById('btn_'+id);
  const cardForStop = btnForStop?.closest('.voice-card');
  const subForStop = cardForStop?.querySelector('.vc-sub');
  if (cardForStop) cardForStop.classList.remove('loading');
  if (subForStop && subForStop.dataset?.default) {
    subForStop.textContent = subForStop.dataset.default;
  }
  // Keep the generated audio blob URL cached for replaying the same response.
  ttsReady[id]=Boolean(audioUrls[id]);
  ttsLoading[id]=false;
  const btn=document.getElementById('btn_'+id);
  if(!btn) return;
  const tm=document.getElementById('tm_'+id);
  const wv=document.getElementById('wv_'+id);
  const prog=document.getElementById('prog_'+id);
  const progbar=document.getElementById('progbar_'+id);
  const dur=parseInt(btn.dataset.dur);
  btn.classList.remove('playing');
  btn.removeAttribute('disabled');
  if (audioUrls[id]) {
    btn.setAttribute('data-tts-ready','1');
    btn.setAttribute('title','Urdu audio ready');
  }
  btn.setAttribute('aria-pressed','false');
  btn.setAttribute('aria-label','Play Urdu audio');
  wv.classList.remove('on');
  tm.classList.remove('running');
  prog.classList.remove('on');
  progbar.style.width='0%';
  const m=Math.floor(dur/60), s=String(dur%60).padStart(2,'0');
  tm.textContent=`${m}:${s}`;
}

function speakUrdu(text: string){
  if (!text || !window.speechSynthesis) return false;
  const utter=new SpeechSynthesisUtterance(text);
  utter.lang='ur-PK';
  const voices = window.speechSynthesis.getVoices();
  const urVoice = voices.find(v => (v.lang || '').toLowerCase().includes('ur'));
  if (!urVoice) return false;
  utter.voice = urVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return true;
}

async function retryAudio(id, silent=false){
  const btn=document.getElementById('btn_'+id);
  const ttsUrText = decodeURIComponent(String(btn?.getAttribute('data-tts-ur') || ''));
  const ttsText = decodeURIComponent(String(btn?.getAttribute('data-tts') || ''));
  let summary = String(urduSummaries[id] || ttsUrText || ttsText || '').trim();
  if (summary.length > 1100) summary = summary.slice(0, 1100);
  if(!summary){
    showToast('Audio', 'Urdu summary unavailable');
    return;
  }
  const card = btn?.closest('.voice-card');
  const sub = card?.querySelector('.vc-sub');
  if (card) card.classList.add('loading');
  if (sub) {
    if (!sub.dataset.default) sub.dataset.default = sub.textContent || '';
    sub.textContent = 'Preparing Urdu audio...';
  }
  try{
    // silent=true (auto-prefetch on render): 1 attempt only — prevent 3x TTS calls per message
    // silent=false (user clicks Retry): 2 attempts with a delay
    const attempts = silent ? [0] : [0, 1200];
    let data: any = null;
    let lastErr = 'TTS generation failed';
    for (let i = 0; i < attempts.length; i += 1) {
      if (attempts[i] > 0) await new Promise((r) => setTimeout(r, attempts[i]));
      try {
        const res = await fetch('/api/chat2', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({
            mode: 'audio',
            urduSummary: summary,
            cacheId: cacheIdForId[id] || null,
            question: questionForId[id] || lastQuestion || '',
            chapterNumber: Number((CHS as any)[activeChIdx]?.n ?? 0),
          }),
        });
        data = await res.json();
        if(!res.ok || data?.ok === false){
          throw new Error(String(data?.error || 'TTS generation failed'));
        }
        break;
      } catch (e) {
        lastErr = (e as any)?.message || 'TTS generation failed';
      }
    }
    if(!data?.audioBase64) throw new Error(lastErr || 'Empty audio response');
    audioUrls[id] = `data:audio/mpeg;base64,${data.audioBase64}`;
    audioCacheKeys[id] = putCachedAudio(summary, String(data.audioBase64 || ''));
    ttsReady[id] = true;
    setVoiceSource(id, 'openai');
    const retryBtn = document.getElementById('retry_'+id) as HTMLButtonElement | null;
    if (retryBtn) retryBtn.style.display = 'none';
    if (!silent) showToast('Audio', 'Urdu voice ready');
    return true;
  } catch(e){
    audioErrors[id] = (e as any)?.message || 'Urdu TTS failed';
    if (!silent) showToast('Audio', (e as any)?.message || 'Urdu TTS failed');
    return false;
  } finally {
    if (card) card.classList.remove('loading');
    if (sub && sub.dataset?.default) sub.textContent = sub.dataset.default;
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TYPING INDICATOR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
let typingProgressTimer: ReturnType<typeof setInterval> | null = null;
function showTyping(){
  const w=document.createElement('div'); w.id='typi';
  w.innerHTML=`
    <div class="typing-row" aria-live="polite" aria-label="VoiceUstad is generating an answer">
      <div class="ai-av" aria-hidden="true">V</div>
      <div>
        <div class="typing-bub" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="typing-note" id="typingNote">Generating answer...</div>
      </div>
    </div>`;
  getInner().appendChild(w); scrollDn();
  const msgs = ['Generating answer...', 'Still thinking...', 'Almost ready...', 'Hang tight...'];
  let idx = 0;
  typingProgressTimer = setInterval(() => {
    idx = Math.min(idx + 1, msgs.length - 1);
    const note = document.getElementById('typingNote');
    if (note) note.textContent = msgs[idx];
  }, 5000);
}
function hideTyping(){
  if (typingProgressTimer) { clearInterval(typingProgressTimer); typingProgressTimer = null; }
  const e=document.getElementById('typi'); if(e)e.remove();
}

function appendDivider(label){
  const w=document.createElement('div');
  w.innerHTML=`<div class="date-stamp"><span>${esc(label)}</span></div>`;
  getInner().appendChild(w);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MIC â€” Web Speech API
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function toggleMic(){
  const micBtn=document.getElementById('micBtn');
  const inp=document.getElementById('msg');

  if(!recognition){
    micOn=!micOn;
    micBtn.classList.toggle('rec',micOn);
    micBtn.setAttribute('aria-pressed',micOn?'true':'false');
    if(micOn){
      setTimeout(()=>{
        if(!micOn) return;
        micOn=false;
        micBtn.classList.remove('rec');
        micBtn.setAttribute('aria-pressed','false');
        inp.value='';
        resize(inp); updateSendBtn();
      },3000);
    }
    return;
  }

  if(micOn){
    recognition.stop(); micOn=false;
    micBtn.classList.remove('rec');
    micBtn.setAttribute('aria-pressed','false');
    return;
  }

  micOn=true;
  micBtn.classList.add('rec');
  micBtn.setAttribute('aria-pressed','true');
  recognition.start();

  recognition.onresult=(event)=>{
    let transcript='';
    for(let i=event.resultIndex;i<event.results.length;i++) transcript+=event.results[i][0].transcript;
    inp.value=transcript;
    resize(inp); updateSendBtn();
  };
  recognition.onend=()=>{
    micOn=false;
    micBtn.classList.remove('rec');
    micBtn.setAttribute('aria-pressed','false');
    if(inp.value.trim()) send();
  };
  recognition.onerror=(e)=>{
    console.warn('Speech recognition error:',e.error);
    micOn=false;
    micBtn.classList.remove('rec');
    micBtn.setAttribute('aria-pressed','false');
    showToast('Mic','Microphone unavailable - type your question');
  };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NEW CHAT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* ═══════════════════════════════════════════════
   SUPABASE — Session & History helpers
═══════════════════════════════════════════════ */

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

async function fetchChapters() {
  if (!_sbClient) return;
  try {
    const { data, error } = await _sbClient
      .from('chapters')
      .select('id, unit_number, title')
      .eq('subject', 'Chemistry')
      .eq('class', 11)
      .eq('board', 'KPK')
      .order('unit_number', { ascending: true });
    if (error) { console.error('fetchChapters error:', error.message); return; }
    if (!data?.length) { console.warn('fetchChapters: no chapters returned (check RLS or filters)'); return; }
    CHS.length = 0;
    ENABLED_CHAPTERS.clear();
    data.forEach((ch: any, idx: number) => {
      CHS.push({ p: 1, n: String(ch.unit_number), t: ch.title, chips: [], followups: [], on: false, id: ch.id });
      ENABLED_CHAPTERS.add(idx);
    });
    buildSb();
  } catch (e) { console.error('fetchChapters error:', e); }
}

function newChat(){
  _currentSessionId = null;
  _sessionHasTitle = false;
  if (_setActiveSessionId) _setActiveSessionId(null);
  if (typeof window !== 'undefined') window.history.pushState({}, '', '/chat');
  if(sendTimeout){ clearTimeout(sendTimeout); sendTimeout=null; }
  Object.keys(timers).forEach(k=>{ if(timers[k]) stopPlay(k); });
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  chatHistory=[];
  buildPrevChats();
  showWelcome(); closeSb();
  document.getElementById('scrollBtn').classList.remove('show');
  document.getElementById('msg').value='';
  resize(document.getElementById('msg'));
  updateSendBtn();
  document.getElementById('sbSearch').value='';
  buildSb();
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPERS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function getInner(){ return document.getElementById('msgsInner'); }
function onInput(el){
  if(!el) return;
  resize(el);
  updateSendBtn();
}
function resize(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,130)+'px';
}
function onKey(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }
function updateSendBtn(){
  const msgEl = document.getElementById('msg') as HTMLTextAreaElement | null;
  const btn = document.getElementById('sendBtn') as HTMLButtonElement | null;
  if (!msgEl || !btn) return;
  const val = msgEl.value.trim();
  btn.disabled = !val || busy;
  btn.setAttribute('aria-disabled',(!val||busy)?'true':'false');
}
function setSpin(on){
  const b=document.getElementById('sendBtn');
  b.disabled=on;
  b.className=on?'send-btn spin':'send-btn';
  b.setAttribute('aria-label',on?'Sending...':'Send message');
  b.innerHTML=on
    ?`<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`
    :`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>`;
}
function scrollDn(force=false){
  const m=document.getElementById('msgs');
  if(force||!userScrolled){
    requestAnimationFrame(()=>{
      m.scrollTop=m.scrollHeight;
      document.getElementById('scrollBtn').classList.remove('show');
      userScrolled=false;
    });
  }
}
function ts(){ return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function esc(s=''){
  return String(s??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/** Like esc() but also renders scientific notation superscripts and Avogadro Nₐ */
function fmtBody(s=''){
  return esc(s)
    // 1.204x10^22 → 1.204×10<sup>22</sup>
    .replace(/(\d[\d.]*)[xX×]10\^(\d+)/g, '$1×10<sup>$2</sup>')
    // standalone ^N not caught above (e.g. 10^23 without leading ×)
    .replace(/10\^(\d+)/g, '10<sup>$1</sup>')
    // Avogadro's number symbol: " Na" or "/Na" in formula context → Nₐ
    .replace(/\bNa\b(?=\s*$|\s*\n|\s*[=\/*])/gm, 'N\u2090');
}

/**
 * Renders an example field as numbered steps when "Step N:" patterns are found.
 * Falls back to fmtBody() for non-stepped content.
 */
function fmtExample(s=''){
  const raw = String(s ?? '').trim();
  if (!raw) return '';

  // Detect stepped format: "Step 1:", "Step 2:", etc.
  const stepRe = /(?:^|\n)\s*(Step\s+\d+\s*:)/i;
  if (!stepRe.test(raw)) return fmtBody(raw);

  // Split into: intro (before Step 1) + step chunks
  const parts = raw.split(/\n(?=\s*Step\s+\d+\s*:)/i);
  let html = '';

  for (const part of parts) {
    const m = part.match(/^(\s*Step\s+(\d+)\s*:)([\s\S]*)$/i);
    if (m) {
      const num   = esc(m[2]);
      const label = esc(m[1].trim());
      const body  = fmtBody(m[3].trim());
      html += `<div class="tv-step"><span class="tv-step-num">${num}</span><div class="tv-step-body"><span class="tv-step-lbl">${label}</span> ${body}</div></div>`;
    } else {
      // Intro line (question, "Solution:", etc.)
      const intro = part.trim();
      if (intro) html += `<div class="tv-step-intro">${fmtBody(intro)}</div>`;
    }
  }

  return `<div class="tv-steps">${html}</div>`;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MOBILE ENHANCEMENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function setupMobileEnhancements(){
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* Prevent body scroll bounce on iOS (overscroll) */
  document.body.addEventListener('touchmove', e=>{
    if((e.target as Element)?.closest('.msgs,.sb-list,.chips,.ai-followups,.scope-list,.scope-modal')) return;
    e.preventDefault();
  }, { passive: false });

  /* Swipe right (from left edge) to open sidebar
     Swipe left to close sidebar */
  let startX=0, startY=0;
  const THRESHOLD=55, MAX_Y=65;

  document.addEventListener('touchstart', e=>{
    startX=e.touches[0].clientX;
    startY=e.touches[0].clientY;
  }, {passive:true});

  document.addEventListener('touchend', e=>{
    if(window.innerWidth > 720) return;
    const dx=e.changedTouches[0].clientX - startX;
    const dy=Math.abs(e.changedTouches[0].clientY - startY);
    if(dy > MAX_Y) return;
    const sb=document.getElementById('sb');
    if (!sb) return;
    if(dx > THRESHOLD && startX < 44 && !sb.classList.contains('on')) openSb();
    if(dx < -THRESHOLD && sb.classList.contains('on')) closeSb();
  }, {passive:true});

  /* On mobile keyboard open: scroll input into view */
  const msgEl = document.getElementById('msg');
  if (msgEl) {
    msgEl.addEventListener('focus', ()=>{
      if(window.innerWidth <= 720){
        setTimeout(()=>{
          document.querySelector('.input-area')
            ?.scrollIntoView({behavior:'smooth', block:'end'});
        }, 380);
      }
    });
  }
}

export default function ChatPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabaseRef = useRef(
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  );
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scopeTopics, setScopeTopics] = useState<string[]>([]);

  const displayName =
    profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Student';
  const email = profile?.email || user?.email || '';
  const focus = [profile?.board, profile?.goal]
    .filter(Boolean)
    .join(' - ') || 'Chemistry focus';
  const trialStatus = (() => {
    if (!profile?.trial_ends_at) {
      return 'Trial pending';
    }

    const expiresAt = new Date(profile.trial_ends_at);
    const diffMs = expiresAt.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    if (daysLeft > 0) {
      return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in trial`;
    }

    return 'Trial period ended';
  })();

  useEffect(() => {
    _sbClient = supabaseRef.current;
    _currentUserId = user?.id || null;
    _setSessions = setSessions;
    _setActiveSessionId = setActiveSessionId;
    _setScopeTopics = setScopeTopics;
    dbLoadHistory();
    fetchChapters();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      _currentSessionId = sessionId;
      dbLoadSession(sessionId);
    }
    initApp();
    const onOrientationChange = () => {
      setTimeout(()=>scrollDn(true), 350);
    };
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      window.removeEventListener('orientationchange', onOrientationChange);
    };
  }, []);

  useEffect(() => {
    setViewerContext({
      name: displayName,
      email,
      focus,
      trial: trialStatus,
    });
  }, [displayName, email, focus, trialStatus]);

  return (
    <div className="app" style={{ paddingTop: '62px' }}>
      <TopNav user={user} profile={profile} />
      <div className="toast-wrap" id="toastWrap" aria-live="polite" aria-atomic="true"></div>

      <div className="modal-bg" id="upgradeBg" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal">
          <button className="modal-close" aria-label="Close upgrade dialog" onClick={() => closeUpgrade()}>×</button>
          <div className="modal-badge">★ Upgrade</div>
          <h3 id="modalTitle">Unlock Full Access</h3>
          <p>Your free trial ends in <strong id="trialDaysLeft">7 days</strong>. Upgrade to VoiceUstad Pro to keep learning without limits.</p>
          <ul className="modal-features">
            <li>Unlimited questions across all 12 chapters</li>
            <li>Full Urdu voice explanations for every answer</li>
            <li>KPK Board past paper questions with solutions</li>
            <li>Saved conversation history across sessions</li>
            <li>Priority response speed</li>
          </ul>
          <button className="modal-cta" onClick={() => closeUpgrade()}>Start Pro — Rs 499/month</button>
          <button className="modal-skip" onClick={() => closeUpgrade()}>Maybe later</button>
        </div>
      </div>

      <div className="modal-bg" id="scopeBg" role="dialog" aria-modal="true" aria-labelledby="scopeTitle">
        <div className="modal scope-modal">
          <button className="modal-close" aria-label="Close chapter scope dialog" onClick={() => closeScope()}>×</button>
          <div className="modal-badge">Chapter Scope</div>
          <h3 id="scopeTitle">Current Chapter Topics</h3>
          <p>This chapter's AI is focused on the following topics. For best answers, ask directly from this list.</p>
          <ul className="scope-list">
            {scopeTopics.map((topic) => (
              <li key={topic}>
                <button type="button" className="scope-item-btn" onClick={() => askScopeTopic(topic)}>
                  {topic}
                </button>
              </li>
            ))}
          </ul>
          <button className="modal-cta" onClick={() => closeScope()}>Start Asking</button>
          <button className="modal-skip" onClick={() => closeScope()}>Close</button>
        </div>
      </div>

      <aside className="sidebar" id="sb">
        <div className="sb-brand">
          <div className="sb-logo">V</div>
          <span className="sb-name">VoiceUstad</span>
          <div className="sb-pill"><span className="blink-dot"></span>Online</div>
        </div>

        <button className="sb-new" onClick={() => newChat()}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" d="M12 4v16m8-8H4" />
          </svg>
          New Conversation
        </button>

        <div className="sb-sec">Chats</div>
        <div className="sb-prev-list" id="sbPrevList">
          {sessions.length === 0 ? (
            <div className="sb-prev-empty">No previous chats yet</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`session-item${activeSessionId === s.id ? ' active' : ''}`}
                onClick={() => (window as any).dbLoadSession(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && (window as any).dbLoadSession(s.id)}
                aria-label={`Open conversation: ${s.title || 'Untitled'}`}
                aria-current={activeSessionId === s.id ? 'true' : undefined}
              >
                <div className="session-title">{s.title || 'Untitled conversation'}</div>
                <div className="session-meta">
                  <span className="session-last-msg">{s.last_message || 'No messages yet'}</span>
                  <span className="session-time">{getTimeAgo(s.updated_at)}</span>
                </div>
                <button
                  className="session-delete-btn"
                  onClick={(e) => (window as any).dbDeleteSession(s.id, e)}
                  aria-label="Delete conversation"
                  title="Delete"
                >×</button>
              </div>
            ))
          )}
        </div>

        <div className="sb-sec">Chapters</div>

        <div className="sb-search">
          <div className="sb-search-box">
            <button
              type="button"
              className="sb-search-ico-btn"
              aria-label="Search"
              onClick={() => document.getElementById('sbSearch')?.focus()}
            >
              <svg className="sb-search-ico" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <input
              className="sb-search-inp"
              id="sbSearch"
              type="text"
              placeholder="Search chapters..."
              onInput={(e) => filterChs((e.currentTarget as HTMLInputElement).value)}
              onChange={(e) => filterChs(e.currentTarget.value)}
              aria-label="Search chapters"
            />
          </div>
        </div>

        <div className="sb-list" id="sbList"></div>

        <div className="sb-foot">
          {process.env.NODE_ENV === 'development' && (
            <button
              className="sb-dev-clear-btn"
              title="Clear TTS audio cache (dev only)"
              onClick={() => (window as any).__devClearCache?.()}
            >
              ⚡ Clear TTS Cache
            </button>
          )}
          <div
            className="sb-user"
            role="button"
            tabIndex={0}
            aria-label="Open account settings"
            onClick={() => router.push('/settings')}
            onKeyDown={(e) => { if (e.key === 'Enter') router.push('/settings'); }}
          >
            <div className="sb-av" id="sbUserAvatar">S</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-uname" id="sbUserName">Student</div>
              <div className="sb-uplan" id="planLabel">Chemistry focus</div>
            </div>
            <span className="sb-cog" aria-hidden="true">Settings</span>
          </div>
          <div
            className="trial-bar"
            role="button"
            tabIndex={0}
            aria-label="Upgrade to Pro"
            onClick={() => openUpgrade()}
            onKeyDown={(e) => { if (e.key === 'Enter') openUpgrade(); }}
          >
            <div className="trial-info">
              <div className="trial-label">{'\u23F3'} Trial</div>
              <div className="trial-sub" id="trialBarSub">7 days left</div>
            </div>
            <div className="trial-cta">Upgrade {'\u2192'}</div>
          </div>
        </div>
      </aside>

      <div className="overlay" id="ov" onClick={() => closeSb()}></div>

      <main className="main">
        <div className="topbar">
          <button className="mob-btn" id="mobBtn" aria-label="Open sidebar" onClick={() => openSb()}>
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="tb-topic">
            <div className="tb-sub" id="tbSub">FSc Chemistry</div>
            <div className="tb-title" id="tbTitle">Select a Chapter</div>
            <div className="tb-meta" id="tbMeta">Chemistry focus</div>
          </div>
          <div className="tb-right">
            <button className="tb-btn tb-scope" title="What can I ask?" aria-label="Show chapter scope topics" onClick={() => openScope()}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 1.9-2.5 3.6" />
                <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <div className="tb-status" aria-label="AI status: ready">
              <span className="blink-dot" aria-hidden="true"></span>AI Ready
            </div>
            <button className="tb-btn" title="New conversation" aria-label="Start new conversation" onClick={() => newChat()}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        <div className="msgs-wrap">
          <div className="msgs" id="msgs"></div>
          <button className="scroll-btn" id="scrollBtn" onClick={() => scrollDn(true)}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
            </svg>
            Scroll to latest
          </button>
        </div>

        <div className="input-area">
          <div className="input-inner">
            <div className="input-box">
              <textarea
                id="msg"
                placeholder="Ask your chemistry question..."
                rows={1}
                onInput={(e) => onInput(e.currentTarget as HTMLTextAreaElement)}
                onKeyDown={(e) => onKey(e)}
              ></textarea>
              <div className="input-tools">
                <button
                  className="i-btn"
                  id="micBtn"
                  title="Voice input"
                  aria-label="Toggle voice input"
                  aria-pressed="false"
                  onClick={() => toggleMic()}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="11" rx="3" />
                    <path strokeLinecap="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" />
                  </svg>
                </button>
                <button className="send-btn" id="sendBtn" aria-label="Send message" onClick={() => send()}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div style={{
            textAlign: 'center',
            padding: '6px 16px 10px',
            fontSize: '11.5px',
            color: '#64748b',
          }}>
            ⚠️ VoiceUstad AI can make mistakes. Always verify with your textbook.
          </div>
        </div>
      </main>
    </div>
  );
}




