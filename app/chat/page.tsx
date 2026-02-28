// @ts-nocheck
'use client';
import './chat.css';
import { useEffect } from 'react';
/* â•â•â•â•â•â•â•â•â•â•â• CHAPTER DATA â•â•â•â•â•â•â•â•â•â•â• */
const CHS = [
  {p:1,n:'01',t:'Basic Concepts', chips:['What is a mole?','Define atomic mass','What are isotopes?','Avogadro\'s number'],
   followups:['How do you calculate molar mass?','What is the difference between empirical and molecular formula?','Explain Avogadro\'s hypothesis']},
  {p:1,n:'02',t:'Experimental Techniques', chips:['What is chromatography?','Explain filtration','What is crystallisation?','Types of titration'],
   followups:['How does paper chromatography work?','What is Rf value?','Difference between filtration and crystallisation']},
  {p:1,n:'03',t:'Atomic Structure', chips:['What is electronegativity?','Explain Bohr\'s model','Quantum numbers','Hund\'s rule'], on:true,
   followups:['How do quantum numbers relate to electron configuration?','Compare Bohr\'s model with quantum mechanical model','What is the Pauli Exclusion Principle?']},
  {p:1,n:'04',t:'Chemical Bonding', chips:['Ionic vs covalent bond','What is hybridisation?','VSEPR theory','Hydrogen bonding'],
   followups:['How does hybridisation affect bond angles?','Why is water polar?','Explain sigma and pi bonds']},
  {p:1,n:'05',t:'States of Matter', chips:['Gas laws explained','What is vapor pressure?','Kinetic theory','Intermolecular forces'],
   followups:['Derive the ideal gas equation','What is Boyle\'s Law?','How does temperature affect vapor pressure?']},
  {p:1,n:'06',t:'Chemical Equilibrium', chips:['Le Chatelier\'s principle','What is Kc?','Factors affecting equilibrium','Common ion effect'],
   followups:['How does pressure affect equilibrium?','What is the relationship between Kc and Kp?','Explain the Haber process using Le Chatelier']},
  {p:2,n:'07',t:'Reaction Kinetics', chips:['Rate of reaction','Order of reaction','Activation energy','Arrhenius equation'],
   followups:['How does a catalyst affect activation energy?','What is a rate-determining step?','Explain collision theory']},
  {p:2,n:'08',t:'Thermochemistry', chips:['Hess\'s law','Enthalpy of formation','Bond energy','Entropy and Gibbs'],
   followups:['How do you apply Hess\'s Law to calculate Î”H?','What is the significance of Î”G?','Explain endothermic vs exothermic reactions']},
  {p:2,n:'09',t:'Electrochemistry', chips:['Electrolytic cell','Galvanic cell','Faraday\'s laws','Standard electrode potential'],
   followups:['How does a galvanic cell produce voltage?','What is the standard hydrogen electrode?','Calculate mass deposited using Faraday\'s law']},
  {p:2,n:'10',t:'Transition Elements', chips:['Properties of transition metals','Complex ions','Colour of compounds','Catalytic properties'],
   followups:['Why do transition metals form coloured compounds?','What is a ligand?','Explain variable oxidation states']},
  {p:2,n:'11',t:'Organic Chemistry', chips:['Functional groups','IUPAC naming','Isomerism types','Reaction mechanisms'],
   followups:['What is the difference between structural and stereoisomerism?','Explain SN1 vs SN2 reactions','How do you name an alkane using IUPAC rules?']},
  {p:2,n:'12',t:'Macromolecules', chips:['Polymers and monomers','Addition vs condensation','Proteins and amino acids','Carbohydrates'],
   followups:['What is the difference between addition and condensation polymerisation?','How are proteins structured?','Explain the role of enzymes']},
];

/* â•â•â•â•â•â•â•â•â•â•â• RESPONSE BANK â•â•â•â•â•â•â•â•â•â•â• */
const BANK = [
  {
    text:'Electronegativity is the tendency of an atom to attract a shared pair of electrons towards itself within a covalent bond.',
    points:['Measured on the Pauling scale - Fluorine has the highest value (4.0)','Increases across a period from left to right','Decreases down a group from top to bottom','Determines bond polarity and bond character'],
    formula:'Period â†’  Li(1.0)  C(2.5)  N(3.0)  O(3.5)  F(4.0)\nGroup  â†“  F(4.0)  Cl(3.2)  Br(2.8)  I(2.5)',
    flabel:'PAULING SCALE TREND', dur:38,
    tip:'<strong>KPK Board Tip:</strong> Electronegativity trend is asked every year in MCQs and 2-mark short questions. Memorise Pauling values: F=4.0, O=3.5, N=3.0, Cl=3.2.',
  },
  {
    text:"Bohr's Atomic Model (1913) proposes that electrons revolve around the nucleus in fixed circular paths called orbits, each with a specific, defined energy level.",
    points:['Electrons occupy fixed energy levels: n = 1, 2, 3, 4â€¦','Energy is absorbed when an electron jumps to a higher orbit','Energy is emitted as light when an electron returns to a lower orbit','Successfully explained the hydrogen line emission spectrum'],
    formula:"Energy of nth orbit:  Eâ‚™ = âˆ’13.6 / nÂ²  eV\nRadius of nth orbit:  râ‚™ = 0.529 Ã— nÂ²  Ã…\n\nn=1 (ground state):   Eâ‚ = âˆ’13.6 eV",
    flabel:"BOHR'S EQUATIONS", dur:42,
    tip:'<strong>KPK Board Tip:</strong> The formula Eâ‚™ = âˆ’13.6/nÂ² is asked every year in numerical questions. Practice calculations for n = 1, 2, and 3 specifically.',
  },
  {
    text:'Quantum numbers are four numbers that completely describe the energy, shape, orientation, and spin of an electron in an atom. No two electrons can share all four identical values - this is the Pauli Exclusion Principle.',
    points:['n - Principal: defines the shell (n = 1, 2, 3...)','l - Azimuthal: defines subshell shape (0 to nâˆ’1)','m - Magnetic: defines orbital orientation (âˆ’l to +l)','s - Spin: defines electron spin (+Â½ or âˆ’Â½)'],
    formula:'For n=3:\n  l=0 â†’ 3s  (1 orbital,   2 electrons)\n  l=1 â†’ 3p  (3 orbitals,  6 electrons)\n  l=2 â†’ 3d  (5 orbitals, 10 electrons)\nTotal max electrons = 2nÂ² = 18',
    flabel:'QUANTUM NUMBER RULES', dur:46,
    tip:'<strong>KPK Board Tip:</strong> Pauli Exclusion Principle, Aufbau Principle, and Hund\'s Rule are high-yield. Expect a 3-mark configuration question in every paper.',
  },
  {
    text:"Hund's Rule of Maximum Multiplicity states that when electrons fill degenerate orbitals, each orbital receives one electron before any orbital is doubly occupied. All singly-occupied orbitals must have the same spin.",
    points:['Applies to p, d, and f subshells which contain multiple orbitals','Each degenerate orbital gets one electron before any pairing','All unpaired electrons must have parallel (same) spin','Minimises electron-electron repulsion and lowers energy'],
    formula:'C  (Z=6):  1sÂ² 2sÂ² | 2pâ†‘ 2pâ†‘ 2pÂ·  (2 unpaired)\nN  (Z=7):  1sÂ² 2sÂ² | 2pâ†‘ 2pâ†‘ 2pâ†‘ (3 unpaired)\nO  (Z=8):  1sÂ² 2sÂ² | 2pâ†‘â†“ 2pâ†‘ 2pâ†‘ (2 unpaired)',
    flabel:"HUND'S RULE - CONFIGURATIONS", dur:40,
    tip:'<strong>KPK Board Tip:</strong> Draw orbital box diagrams with spin arrows for C, N, O. Examiners award full marks for correctly labelled diagrams.',
  },
  {
    text:'A chemical bond is the attractive force that holds two atoms or ions together. The type of bond depends on the electronegativity difference (Î”EN) between the bonded atoms.',
    points:['Ionic bond: complete electron transfer, Î”EN > 1.7 (e.g. NaCl, KBr)','Covalent bond: electron sharing, Î”EN â‰¤ 1.7 (e.g. Hâ‚‚, HCl)','Coordinate covalent: both electrons from one atom (e.g. NHâ‚„âº)','Metallic bond: delocalised electron sea (e.g. Na, Fe, Cu)'],
    formula:'Î”EN = 0          â†’ Non-polar covalent  (Hâ‚‚, Clâ‚‚)\n0 < Î”EN â‰¤ 1.7   â†’ Polar covalent      (HCl, Hâ‚‚O)\nÎ”EN > 1.7       â†’ Ionic               (NaCl, MgO)',
    flabel:'BOND TYPE CLASSIFICATION', dur:44,
    tip:'<strong>KPK Board Tip:</strong> The Î”EN cutoff of 1.7 is tested almost every year in MCQs. Know examples of all four bond types for short questions.',
  },
];

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
let started=false, busy=false, ri=0, micOn=false;
let activeCh='Chapter 03 - Atomic Structure';
let activeChIdx=2;
const ENABLED_CHAPTERS = new Set([2]); // Chapter 03 only for now
const timers={};
const audioPlayers: any = {};
const audioUrls: any = {};
const ttsLoading: any = {};
const ttsReady: any = {};
const audioErrors: any = {};
const urduSummaries: any = {};
let userScrolled=false;
let lastQuestion='';
let sendTimeout: number | null = null;
const TRIAL_DAYS=5;
const SEND_TIMEOUT_MS=45000;

function isChapterAvailable(i: number){
  return ENABLED_CHAPTERS.has(i);
}

function chapterSoonResponse(i: number){
  const ch = CHS[i];
  return {
    text: `${ch?.t || 'This chapter'} is not available yet. It will be available shortly.`,
    points: [
      'AI answers are currently enabled for Chapter 03 (Atomic Structure).',
      'Please use Chapter 03 for now.',
      'Other chapters will be added soon.',
    ],
    formula: '',
    flabel: '',
    dur: 18,
    tip: '<strong>Update:</strong> More chapters are coming soon.',
  };
}

/* â”€â”€â”€ localStorage conversation history â”€â”€â”€ */
const STORAGE_KEY='voiceustad_history';
function loadHistory(){
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }
  catch(e){ return {}; }
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
  w.newChat = newChat;
  w.send = send;
  w.ask = ask;
  w.retryLast = retryLast;
  w.editMsg = editMsg;
  w.copyAnswer = copyAnswer;
  w.feedback = feedback;
  w.togglePlay = togglePlay;
  w.retryAudio = retryAudio;
  w.toggleMic = toggleMic;
  w.selCh = selCh;
  w.openPrevChat = openPrevChat;
  w.filterChs = filterChs;
  w.scrollDn = scrollDn;

  buildSb();
  buildPrevChats();
  showWelcome();
  updateSendBtn();
  buildChips(activeChIdx);
  updateTopbarSub(activeChIdx);
  sanitizeVisibleUiText();
  const tbSub = document.getElementById('tbSub');
  if (tbSub) tbSub.textContent = tbSub.textContent?.replace('Aú', '•') || '';

  const msg = document.getElementById('msg');
  if (msg) {
    msg.addEventListener('input', () => updateSendBtn());
    msg.addEventListener('keyup', () => updateSendBtn());
  }
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => send());
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
    h+=`<div class="sb-ch${c.on?' on':''}" role="button" tabindex="0"
          aria-label="Chapter ${c.n}: ${c.t}${hasSaved?' - has saved history':''}"
          onclick="selCh(${i})" onkeydown="if(event.key==='Enter')selCh(${i})">
      <div class="sb-ch-dot"></div>
      <div class="sb-ch-label">${esc(c.t)}</div>
      <div class="sb-ch-n">${c.n}${hasSaved?'<span style="color:var(--brand);margin-left:3px">Â·</span>':''}</div>
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

function buildPrevChats(){
  const el = document.getElementById('sbPrevList');
  if (!el) return;

  const saved = getSavedChatIndexes().slice(0, 8);
  if (!saved.length) {
    el.innerHTML = `<div class="sb-prev-empty">No previous chats yet</div>`;
    return;
  }

  const h = loadHistory();
  el.innerHTML = saved.map((i) => {
    const ch = CHS[i];
    const msgs = h[i] || [];
    const lastUser = [...msgs].reverse().find((m: any) => m?.type === 'user')?.text || 'Saved conversation';
    const preview = esc(String(lastUser));
    return `<button class="sb-prev-item" type="button" onclick="openPrevChat(${i})" aria-label="Open previous chat for ${esc(ch?.t || `Chapter ${i+1}`)}">
      <div class="sb-prev-row">
        <span class="sb-prev-chip">Ch ${esc(ch?.n || String(i+1))}</span>
        <span class="sb-prev-meta">${msgs.length} msgs</span>
      </div>
      <div class="sb-prev-title">${esc(ch?.t || 'Saved chat')}</div>
      <div class="sb-prev-preview">${preview.slice(0, 44)}${preview.length > 44 ? '...' : ''}</div>
    </button>`;
  }).join('');
}

function openPrevChat(i: number){
  selCh(i);
}

function filterChs(val: string){ buildSb(val); }

function selCh(i: number){
  if(!isChapterAvailable(i)){
    showToast('Soon', `${CHS[i].t} will be available shortly`);
    return;
  }
  CHS.forEach((c,j)=>c.on=j===i);
  activeChIdx=i;
  ri=0;
  const sbSearch = document.getElementById('sbSearch') as HTMLInputElement;
  buildSb(sbSearch?.value || '');
  activeCh=`Chapter ${CHS[i].n} - ${CHS[i].t}`;
  const tbTitle = document.getElementById('tbTitle');
  if (tbTitle) tbTitle.textContent=activeCh;
  updateTopbarSub(i);
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
    if(started) appendDivider('Switched to '+CHS[i].t);
  }
}

function updateTopbarSub(i: number){
  const part=CHS[i].p;
  const tbSub = document.getElementById('tbSub');
  if (tbSub) tbSub.textContent=`FSc Chemistry Â· Part ${part}`;
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
function buildChips(i: number){
  const ch=CHS[i];
  const el=document.getElementById('chips') as HTMLElement;
  if (el) {
    el.innerHTML=`<span class="c-lbl">Try:</span>`;
    ch.chips.forEach((q: string)=>{
    const btn=document.createElement('button');
    btn.className='chip';
    btn.textContent=q;
    btn.setAttribute('aria-label','Ask: '+q);
    btn.addEventListener('click',()=>ask(q));
    el.appendChild(btn);
  });
  }
}

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
  const STARTERS=[
    {icon:'\u269B', q:"Explain Bohr's atomic model and its postulates", label:'Atomic Structure · Ch 3'},
    {icon:'\uD83D\uDD2C', q:'Explain the four quantum numbers with examples', label:'Atomic Structure · Ch 3'},
    {icon:'\u269B', q:'What is electronegativity? Is it related to atomic structure?', label:'Atomic Structure · Ch 3'},
    {icon:'\u269B', q:'What are isotopes and how do they relate to atomic mass?', label:'Atomic Structure · Ch 3'},
  ];
  const m=document.getElementById('msgs') as HTMLElement;
  if (m) m.innerHTML=`<div class="msgs-inner" id="msgsInner">
    <div class="welcome">
      <div class="wl-logo" aria-hidden="true">V</div>
      <h2 class="wl-h">Your <span>Chemistry</span> Tutor</h2>
      <p class="wl-p">Type any FSc Chemistry question in English. You&#39;ll get a clear textbook explanation - then tap Play to hear it in Urdu.</p>
      <div class="wl-grid" id="wlGrid" role="list"></div>
    </div>
  </div>`;
  const grid=document.getElementById('wlGrid') as HTMLElement;
  if (grid) {
    STARTERS.forEach(s=>{
      const card=document.createElement('div');
      card.className='wl-card';
      card.setAttribute('role','listitem button');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label','Ask: '+s.q);
      const hintLabel = String(s.label).replace(/\s+ú\s+/g, ' - ');
      card.innerHTML=`<span class="wl-icon" aria-hidden="true">${s.icon}</span><div class="wl-q">${esc(s.q)}</div><div class="wl-hint">${esc(hintLabel)}</div>`;
      card.addEventListener('click',()=>ask(s.q));
      card.addEventListener('keydown',e=>{ if(e.key==='Enter') ask(s.q); });
      grid.appendChild(card);
    });
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SEND
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function send(){
  const inp=document.getElementById('msg') as HTMLInputElement;
  if (!inp) return;
  const txt=inp.value.trim();
  if(!txt||busy) return;

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
    return;
  }

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
  busy=true; setSpin(true); showTyping();

  // Error timeout (item 10)
  let timedOut=false;
  const controller = new AbortController();
  sendTimeout=setTimeout(()=>{
    timedOut=true;
    controller.abort();
    hideTyping(); busy=false; setSpin(false); updateSendBtn();
    clearTimeout(sendTimeout);
    appendError();
  }, SEND_TIMEOUT_MS);

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
      if (data?.urduSummary) resp.urduSummary = data.urduSummary;
      if (data?.audioBase64) resp.audioBase64 = data.audioBase64;
      if (data?.audioError) resp.audioError = data.audioError;
    }
  } catch (e) {
    if (rateLimitMsg) {
      if(timedOut) return;
      clearTimeout(sendTimeout);
      hideTyping(); busy=false; setSpin(false); updateSendBtn();
      appendError('Rate limit reached', rateLimitMsg, rateLimitRetryMs);
      return;
    }
    if(timedOut) return;
    clearTimeout(sendTimeout);
    hideTyping(); busy=false; setSpin(false); updateSendBtn();
    appendError('AI error', (e as any)?.message || 'AI provider unavailable');
    return;
  }

  if(timedOut) return;
  clearTimeout(sendTimeout);
  hideTyping(); busy=false; setSpin(false); updateSendBtn();

  if(!resp || !resp.text || !Array.isArray(resp.points)){
    appendError('AI error', 'Invalid AI response');
    return;
  }
  appendAI(resp, ts(), true);
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
  const wordCount=(r.text+' '+r.points.join(' ')).split(/\s+/).length;
  const computedDur = Math.round(wordCount / 2.8); // ~2.8 Urdu words/sec
  const actualDur = Math.max(dur, computedDur);
  const mm=Math.floor(actualDur/60), ss=String(actualDur%60).padStart(2,'0');

  const urduSummary = String(r?.urduSummary || r?.urduTtsText || '').trim();
  urduSummaries[id] = urduSummary;

  if (r?.audioBase64) {
    audioUrls[id] = `data:audio/mpeg;base64,${r.audioBase64}`;
    ttsReady[id] = true;
  }
  if (r?.audioError) {
    audioErrors[id] = String(r.audioError);
  }

  const formulaHtml = (r.formula??'') ? `
    <div class="ai-formula" lang="en">
      <div class="formula-lbl">${esc(r.flabel??'FORMULA')}</div>
      <div class="formula-body">${esc(r.formula)}</div>
    </div>` : '';

  const mcq = r.mcq;
  const mcqOptions = Array.isArray(mcq?.options) ? mcq.options : [];
  const mcqHtml = (mcq?.question && mcqOptions.length >= 2) ? `
    <div class="ai-mcq" role="group" aria-label="Related MCQ">
      <div class="mcq-title">Related MCQ</div>
      <div class="mcq-q">${esc(mcq.question)}</div>
      <div class="mcq-opts">
        ${mcqOptions.map((o, i)=>`<div class="mcq-opt"><span class="mcq-opt-key">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></div>`).join('')}
      </div>
      ${mcq?.correct ? `<div class="mcq-ans">Correct: ${esc(mcq.correct)}</div>` : ''}
    </div>` : '';

  const tipHtml = r.tip ? `<div class="ai-tip" role="note" aria-label="Exam tip">
    <span class="tip-star" aria-hidden="true">â˜…</span>
    <span class="tip-txt">${r.tip}</span>
  </div>` : '';

  const topPageRefHtml = r.refPageNo
    ? `<span class="ai-page-ref" aria-label="Board page reference">Page ${esc(String(r.refPageNo))}</span>`
    : '';

  // Contextual follow-up suggestions (item 8)
  const chFollowups = CHS[activeChIdx]?.followups ?? [];
  const followupHtml = chFollowups.length ? `
    <div class="ai-followups" role="list" aria-label="Follow-up questions">
      ${chFollowups.map(q=>`<button class="followup-btn" role="listitem" aria-label="Ask: ${esc(q)}" data-q="${esc(q)}" onclick="ask(this.dataset.q)">${esc(q)}</button>`).join('')}
    </div>` : '';

  const kp=r.points.map((p,i)=>`
    <div class="ai-pt">
      <div class="pt-num" aria-hidden="true">${i+1}</div>
      <span>${esc(p)}</span>
    </div>`).join('');

  // Plain text for copy (strips HTML)
  const copyText=[r.text, ...r.points, r.formula??''].filter(Boolean).join('\n');
  const ttsText = encodeURIComponent([r.text, ...r.points].filter(Boolean).join('. '));
  const ttsUrText = encodeURIComponent(r.urduTtsText || '');

  const w=document.createElement('div');
  w.innerHTML=`
    <div class="msg-ai" role="log" aria-label="VoiceUstad answer">
      <div class="ai-av" aria-hidden="true">V</div>
      <div class="ai-col">
        <div class="ai-ch-label" aria-label="Chapter: ${esc(activeCh)}">
          <span class="ai-ch-dot" aria-hidden="true"></span>${esc(activeCh)}${topPageRefHtml}
        </div>

        <div class="ai-card">
          <div class="ai-intro">${esc(r.text)}</div>
          <div class="ai-pts">${kp}</div>
        </div>

        ${formulaHtml}
        ${mcqHtml}

        <div class="voice-card" role="region" aria-label="Urdu voice explanation">
          <div class="vc-top-row">
            <div class="vc-icon" aria-hidden="true">ðŸ”Š</div>
            <div class="vc-info">
              <div class="vc-label">Urdu Voice Explanation</div>
              <div class="vc-sub" lang="ur" dir="ltr">Tap play to listen - ${actualDur}s</div>
              <div class="vc-loading" id="vcload_${id}" aria-live="polite">
                <span class="vc-dot"></span>
                <span class="vc-dot"></span>
                <span class="vc-dot"></span>
                Preparing Urdu audio...
              </div>
            </div>
            <span class="vc-badge" aria-label="Urdu voice badge">Urdu Voice</span>
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
              Voice unavailable — Retry
            </button>
          </div>
          <div class="vc-progress" id="prog_${id}" role="progressbar" aria-valuemin="0" aria-valuemax="${actualDur}" aria-valuenow="0">
            <div class="vc-progress-bar" id="progbar_${id}"></div>
          </div>
        </div>

        ${tipHtml}
        ${followupHtml}

        <div class="ai-actions" role="toolbar" aria-label="Response actions">
          <button class="ai-action-btn" id="copy_${id}" aria-label="Copy answer to clipboard" onclick="copyAnswer('${id}', ${JSON.stringify(copyText)})">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </button>
          <div class="ai-action-sep" aria-hidden="true"></div>
          <button class="ai-action-btn thumb-up" id="up_${id}" aria-label="This answer was helpful" onclick="feedback('${id}','up')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path stroke-linecap="round" d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
            Helpful
          </button>
          <button class="ai-action-btn thumb-down" id="dn_${id}" aria-label="This answer was not helpful" onclick="feedback('${id}','down')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path stroke-linecap="round" d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
            Not helpful
          </button>
          <div class="ai-action-sep" aria-hidden="true"></div>
          <button class="ai-action-btn" aria-label="Regenerate this answer" onclick="retryLast()">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M1 4v6h6"/><path stroke-linecap="round" d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Regenerate
          </button>
        </div>

        <div class="ai-time" aria-label="Received at ${time}">${time}</div>
      </div>
    </div>`;

  getInner().appendChild(w); scrollDn();
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

async function prefetchUrduAudio(id){
  if (!audioUrls[id] && urduSummaries[id]) {
    retryAudio(id, true);
    return;
  }
  if(!audioUrls[id]) return;
  ttsReady[id]=true;
  const btn=document.getElementById('btn_'+id);
  if(btn){
    btn.setAttribute('data-tts-ready','1');
    btn.setAttribute('title','Urdu audio ready');
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COPY ANSWER (item 5)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function copyAnswer(id, text){
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
      const summary = String(urduSummaries[id] || '').trim();
      if (summary && speakUrdu(summary)) {
        setLoading(false);
        return;
      }
      const errMsg = audioErrors[id] || 'Voice unavailable — Retry';
      throw new Error(errMsg);
    }
    const audio = new Audio(audioUrls[id]);
    audioPlayers[id]=audio;
    audio.onended=()=>stopPlay(id);
    audio.onerror=()=>stopPlay(id);
    await audio.play();
    setLoading(false);
  } catch(e){
    // Fallback to browser speech so the UI still works if API TTS fails.
    if(window.speechSynthesis){
      window.speechSynthesis.cancel();
      const utter=new SpeechSynthesisUtterance(ttsUrText || ttsText);
      utter.lang='ur-PK'; utter.rate=0.9;
      window.speechSynthesis.speak(utter);
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
    const res = await fetch('/api/chat2', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ mode:'audio', urduSummary: summary }),
    });
    const data = await res.json();
    if(!res.ok || data?.ok === false){
      throw new Error(String(data?.error || 'TTS generation failed'));
    }
    if(!data?.audioBase64) throw new Error('Empty audio response');
    audioUrls[id] = `data:audio/mpeg;base64,${data.audioBase64}`;
    ttsReady[id] = true;
    const retryBtn = document.getElementById('retry_'+id) as HTMLButtonElement | null;
    if (retryBtn) retryBtn.style.display = 'none';
    if (!silent) showToast('Audio', 'Urdu voice ready');
  } catch(e){
    if (!silent) showToast('Audio', (e as any)?.message || 'Urdu TTS failed');
  } finally {
    if (card) card.classList.remove('loading');
    if (sub && sub.dataset?.default) sub.textContent = sub.dataset.default;
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TYPING INDICATOR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function showTyping(){
  const w=document.createElement('div'); w.id='typi';
  w.innerHTML=`
    <div class="typing-row" aria-live="polite" aria-label="VoiceUstad is generating an answer">
      <div class="ai-av" aria-hidden="true">V</div>
      <div>
        <div class="typing-bub" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="typing-note">Generating answer...</div>
      </div>
    </div>`;
  getInner().appendChild(w); scrollDn();
}
function hideTyping(){ const e=document.getElementById('typi'); if(e)e.remove(); }

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
        inp.value='Explain the periodic trend of electronegativity';
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
function newChat(){
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MOBILE ENHANCEMENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function setupMobileEnhancements(){
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* Prevent body scroll bounce on iOS (overscroll) */
  document.body.addEventListener('touchmove', e=>{
    if((e.target as Element)?.closest('.msgs,.sb-list,.chips,.ai-followups')) return;
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
  useEffect(() => {
    initApp();
    const onOrientationChange = () => {
      setTimeout(()=>scrollDn(true), 350);
    };
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      window.removeEventListener('orientationchange', onOrientationChange);
    };
  }, []);

  return (
    <div className="app">
      <div className="toast-wrap" id="toastWrap" aria-live="polite" aria-atomic="true"></div>

      <div className="modal-bg" id="upgradeBg" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal">
          <button className="modal-close" aria-label="Close upgrade dialog" onClick={() => closeUpgrade()}>×</button>
          <div className="modal-badge">★ Upgrade</div>
          <h3 id="modalTitle">Unlock Full Access</h3>
          <p>Your free trial ends in <strong id="trialDaysLeft">5 days</strong>. Upgrade to VoiceUstad Pro to keep learning without limits.</p>
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

        <div className="sb-sec">Previous Chats</div>
        <div className="sb-prev-list" id="sbPrevList"></div>

        <div className="sb-sec">Chapters</div>

        <div className="sb-search">
          <div className="sb-search-box">
            <svg className="sb-search-ico" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className="sb-search-inp"
              id="sbSearch"
              type="text"
              placeholder="Search chapters..."
              onInput={(e) => filterChs((e.currentTarget as HTMLInputElement).value)}
              aria-label="Search chapters"
            />
          </div>
        </div>

        <div className="sb-list" id="sbList"></div>

        <div className="sb-foot">
          <div className="sb-user" role="button" tabIndex={0} aria-label="User settings">
            <div className="sb-av">{'\uD83D\uDC68\u200D\uD83C\uDF93'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-uname">Ahmed Raza</div>
              <div className="sb-uplan" id="planLabel">Free Trial · 5 days left</div>
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
              <div className="trial-label">{'\u23F3'} Trial ending soon</div>
              <div className="trial-sub" id="trialBarSub">5 days remaining</div>
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
            <div className="tb-sub" id="tbSub">FSc Chemistry - Part 1</div>
            <div className="tb-title" id="tbTitle">Chapter 03 - Atomic Structure</div>
          </div>
          <div className="tb-right">
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
                placeholder="Ask any FSc Chemistry question..."
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
                <button className="send-btn" id="sendBtn" aria-label="Send message" onClick={() => send()} disabled>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="chips-wrap">
              <div className="chips" id="chips">
                <span className="c-lbl">Try:</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}




