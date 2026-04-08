const fs = require('fs');
let src = fs.readFileSync('./app/chat/page.tsx', 'utf8');
const hasCRLF = src.includes('\r\n');
if (hasCRLF) src = src.replace(/\r\n/g, '\n');

// Replace plain point rendering with bold-label aware rendering
const oldKp = `  const kp=r.points.map((p,i)=>\`
    <div class="ai-pt">
      <div class="pt-num" aria-hidden="true">\${i+1}</div>
      <span>\${esc(p)}</span>
    </div>\`).join('');`;

const newKp = `  const kp=r.points.map((p,i)=>{
    const m=String(p).match(/^([A-Za-z][^:]{1,25}):\\s*([\\s\\S]*)$/);
    const html=m?'<strong>'+esc(m[1])+':</strong> '+esc(m[2]):esc(p);
    return \`<div class="ai-pt"><div class="pt-num" aria-hidden="true">\${i+1}</div><span>\${html}</span></div>\`;
  }).join('');`;

if (!src.includes(oldKp)) { console.error('MISS: kp block'); process.exit(1); }
src = src.replace(oldKp, newKp);
console.log('OK: kp bold labels');

if (hasCRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync('./app/chat/page.tsx', src);
console.log('Done');
