const fs = require('fs');
const file = 'j:\\git\\rosettastone2\\index.html';
const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('const SERVICES = [')) { start = i; }
  if (start !== -1 && i > start && lines[i].startsWith('];')) { end = i; break; }
}
if (start !== -1 && end !== -1) {
  lines.splice(start, end - start + 1, 'let csOParentServiceData = [];', 'let csoPricingData = [];', 'let csoExceptionData = [];');
  fs.writeFileSync(file, lines.join('\n'));
  console.log('Replaced SERVICES array.');
} else {
  console.log('SERVICES array not found.');
}

// Remove old pricingData and SAMPLE_DATA
const lines2 = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
let pStart = -1, pEnd = -1;
for (let i = 0; i < lines2.length; i++) {
  if (lines2[i].startsWith('let pricingData =')) { pStart = i; }
  if (lines2[i].startsWith('const SAMPLE_DATA = {')) {
    // find end of SAMPLE_DATA
    for (let j = i+1; j < lines2.length; j++) {
      if (lines2[j].startsWith('};')) { pEnd = j; break; }
    }
    break;
  }
}
if (pStart !== -1 && pEnd !== -1) {
  lines2.splice(pStart, pEnd - pStart + 1);
  fs.writeFileSync(file, lines2.join('\n'));
  console.log('Removed old pricingData and SAMPLE_DATA arrays.');
} else {
  console.log('pricingData or SAMPLE_DATA not found.');
}
