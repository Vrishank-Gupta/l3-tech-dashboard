/* globals supabase, SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCT_DATA, XLSX, TomSelect */

const TECH_NAMES  = ['Abhay', 'Subodh', 'Abhishek', 'Surender'];
const AGENT_NAMES = ['Gaurav', 'Premjeet'];

// Plain text fields processed by the generic loop in saveTicket
const FIELDS = ['ticket_id', 'subject', 'first_referred_date', 'comments'];

const tsMap = {};   // selectId → TomSelect instance
let db           = null;
let allTickets   = [];
let statusFilter = 'open';
let sortByPendency = true;
let searchTimer  = null;

// ── Bootstrap ─────────────────────────────────────────────────
function init() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('REPLACE')) {
    document.getElementById('setupBanner').classList.remove('hidden');
    document.getElementById('ticketBody').innerHTML =
      '<tr><td colspan="12" class="empty">Configure Supabase credentials in config.js to get started.</td></tr>';
    return;
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  loadTickets();
  syncCustomNames();
}

// ── Tom Select helpers ─────────────────────────────────────────
// Destroy old instance, repopulate native <select>, create new TomSelect.
function updateSel(id, options, currentValue, placeholder, onChange) {
  if (tsMap[id]) { tsMap[id].destroy(); delete tsMap[id]; }
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>`;
  let found = !currentValue;
  options.forEach(o => {
    const sel = o === currentValue;
    if (sel) found = true;
    el.innerHTML += `<option value="${x(o)}"${sel ? ' selected' : ''}>${x(o)}</option>`;
  });
  // Preserve values from DB that aren't in the Excel list
  if (!found && currentValue) {
    el.innerHTML += `<option value="${x(currentValue)}" selected>${x(currentValue)}</option>`;
  }
  const opts = { allowEmptyOption: true, dropdownParent: 'body' };
  if (onChange) opts.onChange = onChange;
  tsMap[id] = new TomSelect(id, opts);
  return tsMap[id];
}

// ── Cascading selects ──────────────────────────────────────────
function onProductChange(value) {
  const product = value || '';
  const symptoms = product && PRODUCT_DATA[product]
    ? Object.keys(PRODUCT_DATA[product]).sort() : [];
  updateSel('f_symptom', symptoms, '', '— Select Symptom —', onSymptomChange);
  updateSel('f_defect',  [], '', '— Select Symptom first —', onDefectChange);
  updateSel('f_repair',  [], '', '— Select Defect first —');
}

function onSymptomChange(value) {
  const product = tsMap['f_product_name']?.getValue() || '';
  const symptom = value || '';
  const defects = product && symptom && PRODUCT_DATA[product]?.[symptom]
    ? Object.keys(PRODUCT_DATA[product][symptom]).sort() : [];
  updateSel('f_defect', defects, '',
    symptom ? '— Select Defect —' : '— Select Symptom first —', onDefectChange);
  updateSel('f_repair', [], '', '— Select Defect first —');
}

function onDefectChange(value) {
  const product = tsMap['f_product_name']?.getValue() || '';
  const symptom = tsMap['f_symptom']?.getValue() || '';
  const defect  = value || '';
  const repairs = product && symptom && defect && PRODUCT_DATA[product]?.[symptom]?.[defect]
    ? PRODUCT_DATA[product][symptom][defect] : [];
  updateSel('f_repair', repairs, '',
    defect ? '— Select Repair —' : '— Select Defect first —');
}

// ── Name fields (Tech / Agent) ─────────────────────────────────
function getCustomNames(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveCustomName(key, name) {
  const names = getCustomNames(key);
  if (name && !names.includes(name)) {
    localStorage.setItem(key, JSON.stringify([...names, name]));
  }
}

// Name selects use plain <select> (no Tom Select) — short lists don't need search,
// and native onchange is 100% reliable for the "Other" reveal logic.
function buildNameSelect(selId, fixedNames, localKey, onChange) {
  const custom = getCustomNames(localKey);
  const el = document.getElementById(selId);
  el.innerHTML = `<option value="">— Select —</option>`;
  [...fixedNames, ...custom].forEach(n => {
    el.innerHTML += `<option value="${x(n)}">${x(n)}</option>`;
  });
  el.innerHTML += `<option value="__other__">Other…</option>`;
  el.onchange = onChange ? () => onChange(el.value) : null;
}

// Set value for a name field when editing — handles known names and DB-only values
function setNameSel(selId, customId, value, fixedNames, localKey) {
  if (!value) return;
  const allKnown = [...fixedNames, ...getCustomNames(localKey)];
  const el = document.getElementById(selId);
  const customInput = document.getElementById(customId);
  if (allKnown.includes(value)) {
    el.value = value;
  } else {
    // Value exists in DB but not in the known list — add it before "Other…"
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.insertBefore(opt, el.lastElementChild);
    el.value = value;
  }
  customInput.classList.add('hidden');
  customInput.value = '';
}

function onTechChange(value) {
  const el = document.getElementById('f_tech_name_custom');
  el.classList.toggle('hidden', value !== '__other__');
  if (value !== '__other__') el.value = '';
  else setTimeout(() => el.focus(), 50);
}

function onAgentChange(value) {
  const el = document.getElementById('f_agent_name_custom');
  el.classList.toggle('hidden', value !== '__other__');
  if (value !== '__other__') el.value = '';
  else setTimeout(() => el.focus(), 50);
}

function resolveNameField(selId, customId, localKey) {
  const selVal = document.getElementById(selId).value || '';
  if (selVal === '__other__') {
    const custom = document.getElementById(customId).value.trim();
    if (custom) saveCustomName(localKey, custom);
    return custom || null;
  }
  return selVal || null;
}

// On startup, pull any custom names from DB into localStorage
async function syncCustomNames() {
  const { data } = await db.from('tickets').select('tech_name, agent_name');
  if (!data) return;
  const knownTech  = new Set(TECH_NAMES);
  const knownAgent = new Set(AGENT_NAMES);
  [...new Set(data.map(t => t.tech_name).filter(Boolean))]
    .filter(n => !knownTech.has(n))
    .forEach(n => saveCustomName('custom_tech_names', n));
  [...new Set(data.map(t => t.agent_name).filter(Boolean))]
    .filter(n => !knownAgent.has(n))
    .forEach(n => saveCustomName('custom_agent_names', n));
}

// ── Filter tabs ───────────────────────────────────────────────
function setFilter(f) {
  statusFilter = f;
  ['open','closed','all'].forEach(id =>
    document.getElementById('tab-' + id).classList.toggle('active', id === f)
  );
  const btn = document.getElementById('sortBtn');
  btn.textContent = sortByPendency
    ? (f === 'closed' ? 'Sort: Resolution ↓' : 'Sort: Pendency ↓')
    : 'Sort: Newest First';
  loadTickets();
}

// ── Data ──────────────────────────────────────────────────────
async function loadTickets() {
  const search = document.getElementById('searchInput').value.trim();
  let query = db.from('tickets').select('*');

  if (statusFilter === 'open') {
    query = query.or('status.eq.open,status.is.null');
  } else if (statusFilter === 'closed') {
    query = query.eq('status', 'closed');
  }

  if (search) {
    const s = search.replace(/'/g, "''");
    query = query.or([
      `ticket_id.ilike.%${s}%`,
      `product_name.ilike.%${s}%`,
      `tech_name.ilike.%${s}%`,
      `symptom.ilike.%${s}%`,
    ].join(','));
  }

  const { data, error } = await query;
  if (error) { showError('Could not load tickets: ' + error.message); return; }

  hideError();
  allTickets = enrich(data || []);

  if (sortByPendency) {
    allTickets.sort((a, b) => (b.display_days ?? -1) - (a.display_days ?? -1));
  } else {
    allTickets.sort((a, b) => b.id - a.id);
  }

  render(allTickets);
}

function enrich(tickets) {
  const today = new Date();
  return tickets.map(t => {
    const out = { ...t };
    if (!t.first_referred_date) { out.display_days = null; return out; }
    if (t.status === 'closed' && t.closed_at) {
      out.display_days = Math.floor(
        (new Date(t.closed_at) - new Date(t.first_referred_date)) / 86400000);
    } else {
      out.display_days = Math.floor(
        (today - new Date(t.first_referred_date)) / 86400000);
    }
    return out;
  });
}

// ── Render ────────────────────────────────────────────────────
function render(tickets) {
  const tbody = document.getElementById('ticketBody');
  document.getElementById('ticketCount').textContent =
    tickets.length === 1 ? '1 ticket' : `${tickets.length} tickets`;

  if (tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty">No tickets found.</td></tr>';
    return;
  }

  tbody.innerHTML = tickets.map(t => {
    const closed = t.status === 'closed';
    const actions = closed
      ? `<button class="btn-icon" title="Reopen"  onclick="reopenTicket(${t.id})">↩️</button>
         <button class="btn-icon del" title="Delete" onclick="deleteTicket(${t.id})">🗑️</button>`
      : `<button class="btn-icon" title="Edit"   onclick="openModal(${t.id})">✏️</button>
         <button class="btn-icon close" title="Close ticket" onclick="closeTicket(${t.id})">✅</button>
         <button class="btn-icon del"  title="Delete"        onclick="deleteTicket(${t.id})">🗑️</button>`;

    return `
    <tr class="${closed ? 'row-closed' : ''}">
      <td title="${x(t.ticket_id)}">${x(t.ticket_id)}</td>
      <td title="${x(t.product_name)}">${x(t.product_name)}</td>
      <td title="${x(t.subject)}">${x(t.subject)}</td>
      <td title="${x(t.agent_name)}">${x(t.agent_name)}</td>
      <td title="${x(t.symptom)}">${x(t.symptom)}</td>
      <td title="${x(t.defect)}">${x(t.defect)}</td>
      <td title="${x(t.repair)}">${x(t.repair)}</td>
      <td title="${x(t.tech_name)}">${x(t.tech_name)}</td>
      <td>${fmtDate(t.first_referred_date)}</td>
      <td class="col-center">${daysBadge(t)}</td>
      <td title="${x(t.comments)}">${x(t.comments)}</td>
      <td class="action-cell">${actions}</td>
    </tr>`;
  }).join('');
}

function daysBadge(t) {
  const days = t.display_days;
  if (days === null || days === undefined)
    return '<span class="badge badge-grey">—</span>';
  if (t.status === 'closed')
    return `<span class="badge badge-closed" title="Closed in ${days} day${days===1?'':'s'}">✓ ${days}d</span>`;
  const cls = days >= 30 ? 'badge-red'
            : days >= 15 ? 'badge-orange'
            : days >= 7  ? 'badge-yellow'
            :               'badge-green';
  return `<span class="badge ${cls}">${days}d</span>`;
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function x(v) {
  if (!v) return '';
  return String(v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Search & sort ─────────────────────────────────────────────
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadTickets, 300);
}

function toggleSort() {
  sortByPendency = !sortByPendency;
  const btn = document.getElementById('sortBtn');
  if (sortByPendency) {
    btn.textContent = statusFilter === 'closed' ? 'Sort: Resolution ↓' : 'Sort: Pendency ↓';
  } else {
    btn.textContent = 'Sort: Newest First';
  }
  btn.classList.toggle('active', sortByPendency);
  loadTickets();
}

// ── Close / Reopen ────────────────────────────────────────────
async function closeTicket(id) {
  if (!confirm('Mark this ticket as closed?')) return;
  const { error } = await db.from('tickets')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { showError('Failed to close ticket: ' + error.message); return; }
  loadTickets();
}

async function reopenTicket(id) {
  if (!confirm('Reopen this ticket?')) return;
  const { error } = await db.from('tickets')
    .update({ status: 'open', closed_at: null })
    .eq('id', id);
  if (error) { showError('Failed to reopen ticket: ' + error.message); return; }
  loadTickets();
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById('f_id').value = '';
  document.getElementById('f_ticket_id').value = '';
  document.getElementById('f_subject').value = '';
  document.getElementById('f_first_referred_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('f_comments').value = '';

  let ticket = null;
  if (id) {
    ticket = allTickets.find(t => t.id === id);
    if (ticket) {
      document.getElementById('f_id').value                  = id;
      document.getElementById('f_ticket_id').value           = ticket.ticket_id           || '';
      document.getElementById('f_subject').value             = ticket.subject             || '';
      document.getElementById('f_first_referred_date').value = ticket.first_referred_date || '';
      document.getElementById('f_comments').value            = ticket.comments            || '';
    }
    document.getElementById('modalTitle').textContent = 'Edit Ticket';
  } else {
    document.getElementById('modalTitle').textContent = 'Add Ticket';
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
  // Init Tom Select after modal is visible to avoid hidden-element sizing issues
  initModalSelects(ticket);
  document.getElementById('f_ticket_id').focus();
}

function initModalSelects(ticket) {
  const product = ticket?.product_name || '';
  const symptom = ticket?.symptom      || '';
  const defect  = ticket?.defect       || '';
  const repair  = ticket?.repair       || '';

  updateSel('f_product_name', Object.keys(PRODUCT_DATA).sort(), product,
    '— Select Product —', onProductChange);

  const symptoms = product && PRODUCT_DATA[product]
    ? Object.keys(PRODUCT_DATA[product]).sort() : [];
  updateSel('f_symptom', symptoms, symptom,
    product ? '— Select Symptom —' : '— Select Product first —', onSymptomChange);

  const defects = product && symptom && PRODUCT_DATA[product]?.[symptom]
    ? Object.keys(PRODUCT_DATA[product][symptom]).sort() : [];
  updateSel('f_defect', defects, defect,
    symptom ? '— Select Defect —' : '— Select Symptom first —', onDefectChange);

  const repairs = product && symptom && defect && PRODUCT_DATA[product]?.[symptom]?.[defect]
    ? PRODUCT_DATA[product][symptom][defect] : [];
  updateSel('f_repair', repairs, repair,
    defect ? '— Select Repair —' : '— Select Defect first —');

  // Tech name
  buildNameSelect('f_tech_name_sel', TECH_NAMES, 'custom_tech_names', onTechChange);
  document.getElementById('f_tech_name_custom').classList.add('hidden');
  document.getElementById('f_tech_name_custom').value = '';
  if (ticket?.tech_name) {
    setNameSel('f_tech_name_sel', 'f_tech_name_custom', ticket.tech_name, TECH_NAMES, 'custom_tech_names');
  }

  // Agent name
  buildNameSelect('f_agent_name_sel', AGENT_NAMES, 'custom_agent_names', onAgentChange);
  document.getElementById('f_agent_name_custom').classList.add('hidden');
  document.getElementById('f_agent_name_custom').value = '';
  if (ticket?.agent_name) {
    setNameSel('f_agent_name_sel', 'f_agent_name_custom', ticket.agent_name, AGENT_NAMES, 'custom_agent_names');
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  ['f_product_name','f_symptom','f_defect','f_repair']
    .forEach(id => { if (tsMap[id]) { tsMap[id].destroy(); delete tsMap[id]; } });
}

function overlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

async function saveTicket(e) {
  e.preventDefault();
  const id  = document.getElementById('f_id').value;
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {};

  // Plain text fields
  FIELDS.forEach(f => {
    payload[f] = document.getElementById('f_' + f).value.trim() || null;
  });

  // Cascade selects — use Tom Select getValue() which is always in sync
  ['product_name','symptom','defect','repair'].forEach(f => {
    payload[f] = tsMap['f_' + f]?.getValue() || null;
  });

  // Name fields with "Other" handling
  payload.tech_name  = resolveNameField('f_tech_name_sel',  'f_tech_name_custom',  'custom_tech_names');
  payload.agent_name = resolveNameField('f_agent_name_sel', 'f_agent_name_custom', 'custom_agent_names');

  let error;
  if (id) {
    ({ error } = await db.from('tickets').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('tickets').insert(payload));
  }

  btn.disabled = false;
  btn.textContent = 'Save Ticket';
  if (error) { showError('Save failed: ' + error.message); return; }
  closeModal();
  loadTickets();
}

async function deleteTicket(id) {
  if (!confirm('Delete this ticket permanently? This cannot be undone.')) return;
  const { error } = await db.from('tickets').delete().eq('id', id);
  if (error) { showError('Delete failed: ' + error.message); return; }
  loadTickets();
}

// ── Export ────────────────────────────────────────────────────
function exportToExcel() {
  if (!allTickets.length) { alert('No tickets to export.'); return; }

  const rows = allTickets.map(t => ({
    'Ticket ID':     t.ticket_id     || '',
    'Product':       t.product_name  || '',
    'Subject':       t.subject       || '',
    'Agent':         t.agent_name    || '',
    'Symptom':       t.symptom       || '',
    'Defect':        t.defect        || '',
    'Repair':        t.repair        || '',
    'Tech Person':   t.tech_name     || '',
    'First Referred': t.first_referred_date || '',
    'Status':        t.status        || 'open',
    'Days (Pendency / Resolution)': t.display_days ?? '',
    'Closed On':     t.closed_at ? new Date(t.closed_at).toLocaleDateString('en-IN') : '',
    'Comments':      t.comments      || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:14},{wch:16},{wch:24},{wch:32},{wch:32},
    {wch:32},{wch:18},{wch:16},{wch:10},{wch:28},{wch:14},{wch:32}
  ];

  const wb    = XLSX.utils.book_new();
  const label = statusFilter === 'all' ? 'All' : statusFilter === 'closed' ? 'Closed' : 'Open';
  XLSX.utils.book_append_sheet(wb, ws, `${label} Tickets`);
  XLSX.writeFile(wb, `L3_Tickets_${label}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('errorMsg').classList.add('hidden');
}

// ── Start ─────────────────────────────────────────────────────
init();
