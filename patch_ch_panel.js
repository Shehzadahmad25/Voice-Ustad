const fs = require('fs');
let src = fs.readFileSync('./app/chat/page.tsx', 'utf8');
const hasCRLF = src.includes('\r\n');
if (hasCRLF) src = src.replace(/\r\n/g, '\n');

let ok = 0;

// ── 1. Store chapter id in fetchChapters ─────────────────────────────────────
const oldFetch = `      CHS.push({ p: 1, n: String(ch.unit_number), t: ch.title, chips: [], followups: [], on: false });`;
const newFetch = `      CHS.push({ p: 1, n: String(ch.unit_number), t: ch.title, chips: [], followups: [], on: false, id: ch.id });`;
if (!src.includes(oldFetch)) { console.error('MISS: fetchChapters push'); process.exit(1); }
src = src.replace(oldFetch, newFetch);
console.log('OK: fetchChapters id'); ok++;

// ── 2. Modify buildSb() chapter item to include wrap + expand button + panel ─
const oldChItem = `    h+=\`<div class="sb-ch\${c.on?' on':''}" role="button" tabindex="0"
          aria-label="Chapter \${c.n}: \${c.t}\${hasSaved?' - has saved history':''}"
          onclick="selCh(\${i})" onkeydown="if(event.key==='Enter')selCh(\${i})">
      <div class="sb-ch-dot"></div>
      <div class="sb-ch-label">\${esc(c.t)}</div>
      <div class="sb-ch-n">\${c.n}\${hasSaved?'<span style="color:var(--brand);margin-left:3px">·</span>':''}</div>
    </div>\`;`;

const newChItem = `    h+=\`<div class="sb-ch-wrap" id="sb-ch-wrap-\${i}">
      <div class="sb-ch\${c.on?' on':''}" role="button" tabindex="0"
            aria-label="Chapter \${c.n}: \${c.t}\${hasSaved?' - has saved history':''}"
            onclick="selCh(\${i})" onkeydown="if(event.key==='Enter')selCh(\${i})">
        <div class="sb-ch-dot"></div>
        <div class="sb-ch-label">\${esc(c.t)}</div>
        <div class="sb-ch-n">\${c.n}\${hasSaved?'<span style="color:var(--brand);margin-left:3px">·</span>':''}</div>
        <button class="sb-ch-expand" onclick="event.stopPropagation();toggleChapterPanel(\${i},\${c.id||0})" aria-label="Show topics for chapter \${c.n}" title="Topics &amp; resources">&#9656;</button>
      </div>
      <div class="sb-ch-panel" id="sb-ch-panel-\${i}"></div>
    </div>\`;`;

if (!src.includes(oldChItem)) { console.error('MISS: buildSb chapter item'); process.exit(1); }
src = src.replace(oldChItem, newChItem);
console.log('OK: buildSb chapter wrap'); ok++;

// ── 3. Add toggleChapterPanel function after buildPrevChats ──────────────────
const afterBuildPrev = `function buildPrevChats(){ /* Sidebar history managed by Supabase — see dbLoadHistory */ }`;
const panelFn = `
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
  panelEl.innerHTML = '<div class="sb-panel-loading">Loading topics\u2026</div>';
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
      window.__topicMsgs = window.__topicMsgs || {};
      topics.forEach(function(t, ti) {
        const msgKey = 'tp_'+idx+'_'+ti;
        window.__topicMsgs[msgKey] = 'Explain '+t.title+' from Chapter '+chN;
        html += '<div class="sb-panel-topic" role="button" tabindex="0"'
          +' onclick="ask(window.__topicMsgs[\\''+msgKey+'\\']);closeSb()"'
          +' onkeydown="if(event.key===\\'Enter\\'){ask(window.__topicMsgs[\\''+msgKey+'\\']);closeSb()}">'
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
}`;

if (!src.includes(afterBuildPrev)) { console.error('MISS: buildPrevChats anchor'); process.exit(1); }
src = src.replace(afterBuildPrev, afterBuildPrev + '\n' + panelFn);
console.log('OK: toggleChapterPanel function'); ok++;

// ── 4. Register toggleChapterPanel in initApp ────────────────────────────────
const oldSelCh = `  w.selCh = selCh;`;
const newSelCh = `  w.selCh = selCh;
  w.toggleChapterPanel = toggleChapterPanel;`;
if (!src.includes(oldSelCh)) { console.error('MISS: w.selCh'); process.exit(1); }
src = src.replace(oldSelCh, newSelCh);
console.log('OK: w.toggleChapterPanel registered'); ok++;

if (hasCRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync('./app/chat/page.tsx', src);
console.log(`\nDone — ${ok}/4 patches applied.`);
