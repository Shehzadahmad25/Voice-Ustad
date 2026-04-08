const fs = require('fs');
let src = fs.readFileSync('./app/chat/page.tsx', 'utf8');
const hasCRLF = src.includes('\r\n');
if (hasCRLF) src = src.replace(/\r\n/g, '\n');

// Fix garbled star â˜… → ★ in tip HTML
const oldStar = `    <span class="tip-star" aria-hidden="true">â˜…</span>`;
const newStar = `    <span class="tip-star" aria-hidden="true">\u2605</span>`;

if (!src.includes(oldStar)) {
  // Try the unicode escape version already in the file
  console.log('INFO: garbled star not found, may already be fixed');
} else {
  src = src.replace(oldStar, newStar);
  console.log('OK: star fixed');
}

if (hasCRLF) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync('./app/chat/page.tsx', src);
console.log('Done');
