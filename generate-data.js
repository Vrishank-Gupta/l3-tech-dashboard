/**
 * Reads the two Excel files and outputs public/data.js
 * Run: node generate-data.js
 */
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const tree = {}; // { product: { symptom: { defect: Set<repair> } } }

function clean(v) {
  return String(v ?? '').replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
}

function add(product, symptom, defect, repair) {
  product = clean(product); symptom = clean(symptom);
  defect  = clean(defect);  repair  = clean(repair);
  if (!product || !symptom || !defect || !repair) return;
  tree[product]                      ??= {};
  tree[product][symptom]             ??= {};
  tree[product][symptom][defect]     ??= new Set();
  tree[product][symptom][defect].add(repair);
}

// ── File 1: L2-L3 FCs.xlsx  (sheet name = product) ──────────
const wb1 = XLSX.readFile('L2-L3 FCs.xlsx');

const FILE1_CFG = {
  //  product name     symptomCol  defectCol  repairCol  skipFirstRow
  'Camera':       [1, 3, 4, true ],
  'VDB':          [1, 3, 4, true ],
  'Air Purifier': [1, 4, 5, true ],  // col1=FC used as symptom
  'Home Tab':     [1, 3, 4, true ],
  'Dashcam':      [1, 3, 4, true ],
  'Locks':        [1, 3, 4, true ],
  'Tracker':      [0, 1, 2, true ],  // no S-No column
};

for (const [product, [sCol, dCol, rCol, skip]] of Object.entries(FILE1_CFG)) {
  if (!wb1.SheetNames.includes(product)) { console.warn('Sheet not found:', product); continue; }
  const rows = XLSX.utils.sheet_to_json(wb1.Sheets[product], { header: 1, defval: '' });
  let lastSym = '', lastDef = '';
  for (let i = skip ? 1 : 0; i < rows.length; i++) {
    const r = rows[i];
    const s = clean(r[sCol]);
    const d = clean(r[dCol]);
    const rep = clean(r[rCol]);
    if (s) lastSym = s;
    if (d) lastDef = d;
    if (lastSym && lastDef && rep) add(product, lastSym, lastDef, rep);
  }
}

// ── File 2: L3 Fault Codes Addition.xlsx  (flat table) ───────
const wb2  = XLSX.readFile('L3 Fault Codes Addition.xlsx');
const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets['Sheet1'], { header: 1, defval: '' });
// Headers: Product | Symptom | Diagnosis | Repair | Added
for (let i = 1; i < rows2.length; i++) {
  const [product, symptom, defect, repair] = rows2[i];
  add(product, symptom, defect, repair);
}

// ── Serialize (Sets → sorted arrays) ─────────────────────────
const output = {};
for (const [product, symptoms] of Object.entries(tree)) {
  output[product] = {};
  for (const [symptom, defects] of Object.entries(symptoms)) {
    output[product][symptom] = {};
    for (const [defect, repairs] of Object.entries(defects)) {
      output[product][symptom][defect] = [...repairs].sort();
    }
  }
}

// ── Stats ─────────────────────────────────────────────────────
console.log('\nProducts parsed:');
for (const [p, s] of Object.entries(output)) {
  const defTotal = Object.values(s).reduce((n, d) => n + Object.keys(d).length, 0);
  console.log(` ${p}: ${Object.keys(s).length} symptoms, ${defTotal} defects`);
}

// ── Write ─────────────────────────────────────────────────────
const js = `// Auto-generated — do not edit manually. Run: node generate-data.js\nconst PRODUCT_DATA = ${JSON.stringify(output, null, 2)};\n`;
fs.writeFileSync(path.join(__dirname, 'public', 'data.js'), js, 'utf8');
console.log('\n✓ Written to public/data.js');
