/* globals supabase, SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCT_DATA, XLSX */

const FIELDS = [
  'ticket_id','subject','product_name',
  'symptom','defect','repair',
  'tech_name','first_referred_date','comments'
];

let db            = null;
let allTickets    = [];
let statusFilter  = 'open';
let sortByPendency = true;
let searchTimer   = null;

// ── Bootstrap ─────────────────────────────────────────────────
function init() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('REPLACE')) {
    document.getElementById('setupBanner').classList.remove('hidden');
    document.getElementById('ticketBody').innerHTML =
      '<tr><td colspan="11" class="empty">Configure Supabase credentials in config.js to get started.</td></tr>';
    return;
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initProductSelect();
  loadTickets();
  refreshSuggestions();
}

// ── Product dropdown (populated from Excel data) ───────────────
function initProductSelect() {
  const sel = document.getElementById('f_product_name');
  sel.innerHTML = '<option value="">— Select Product —</option>';
  Object.keys(PRODUCT_DATA).sort().forEach(p => {
    sel.innerHTML += `<option value="${x(p)}">${x(p)}</option>`;
  });
}

// ── Cascading selects ─────────────────────────────────────────
function onProductChange() {
  const product = document.getElementById('f_product_name').value;
  const symptoms = product && PRODUCT_DATA[product]
    ? Object.keys(PRODUCT_DATA[product]).sort() : [];
  populateSel('f_symptom', symptoms, '', '— Select Symptom —');
  populateSel('f_defect',  [], '', '— Select Symptom first —');
  populateSel('f_repair',  [], '', '— Select Defect first —');
}

function onSymptomChange() {
  const product = document.getElementById('f_product_name').value;
  const symptom = document.getElementById('f_symptom').value;
  const defects = product && symptom && PRODUCT_DATA[product]?.[symptom]
    ? Object.keys(PRODUCT_DATA[product][symptom]).sort() : [];
  populateSel('f_defect', defects, '', '— Select Defect —');
  populateSel('f_repair', [], '', '— Select Defect first —');
}

function onDefectChange() {
  const product = document.getElementById('f_product_name').value;
  const symptom = document.getElementById('f_symptom').value;
  const defect  = document.getElementById('f_defect').value;
  const repairs = product && symptom && defect && PRODUCT_DATA[product]?.[symptom]?.[defect]
    ? PRODUCT_DATA[product][symptom][defect] : [];
  populateSel('f_repair', repairs, '', '— Select Repair —');
}

// Populate a <select>, preserving currentValue even if not in options list
function populateSel(id, options, currentValue, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  let found = !currentValue;
  options.forEach(o => {
    const selected = o === currentValue;
    if (selected) found = true;
    sel.innerHTML += `<option value="${x(o)}"${selected ? ' selected' : ''}>${x(o)}</option>`;
  });
  // keep existing custom value if it wasn't in the list
  if (!found && currentValue) {
    sel.innerHTML += `<option value="${x(currentValue)}" selected>${x(currentValue)}</option>`;
  }
}

// Restore all four cascading selects for an existing ticket
function restoreCascade(t) {
  const product  = t.product_name || '';
  const symptom  = t.symptom      || '';
  const defect   = t.defect       || '';
  const repair   = t.repair       || '';

  // Product
  populateSel('f_product_name',
    Object.keys(PRODUCT_DATA).sort(), product, '— Select Product —');

  // Symptom
  const symptoms = product && PRODUCT_DATA[product]
    ? Object.keys(PRODUCT_DATA[product]).sort() : [];
  populateSel('f_symptom', symptoms, symptom, '— Select Symptom —');

  // Defect
  const defects = product && symptom && PRODUCT_DATA[product]?.[symptom]
    ? Object.keys(PRODUCT_DATA[product][symptom]).sort() : [];
  populateSel('f_defect', defects, defect, '— Select Defect —');

  // Repair
  const repairs = product && symptom && defect && PRODUCT_DATA[product]?.[symptom]?.[defect]
    ? PRODUCT_DATA[product][symptom][defect] : [];
  populateSel('f_repair', repairs, repair, '— Select Repair —');
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
    tbody.innerHTML = '<tr><td colspan="11" class="empty">No tickets found.</td></tr>';
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
  // Reset plain inputs
  ['ticket_id','subject','tech_name','first_referred_date','comments']
    .forEach(f => { document.getElementById('f_' + f).value = ''; });

  if (id) {
    const t = allTickets.find(t => t.id === id);
    if (t) {
      document.getElementById('f_id').value = id;
      document.getElementById('f_ticket_id').value          = t.ticket_id           || '';
      document.getElementById('f_subject').value            = t.subject              || '';
      document.getElementById('f_tech_name').value          = t.tech_name            || '';
      document.getElementById('f_first_referred_date').value = t.first_referred_date || '';
      document.getElementById('f_comments').value           = t.comments             || '';
      restoreCascade(t);
    }
    document.getElementById('modalTitle').textContent = 'Edit Ticket';
  } else {
    document.getElementById('modalTitle').textContent = 'Add Ticket';
    initProductSelect();
    onProductChange();
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('f_product_name').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
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
  FIELDS.forEach(f => {
    const v = document.getElementById('f_' + f).value.trim();
    payload[f] = v || null;
  });

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
  refreshSuggestions();
}

async function deleteTicket(id) {
  if (!confirm('Delete this ticket permanently? This cannot be undone.')) return;
  const { error } = await db.from('tickets').delete().eq('id', id);
  if (error) { showError('Delete failed: ' + error.message); return; }
  loadTickets();
}

// ── Suggestions (tech name datalist) ─────────────────────────
async function refreshSuggestions() {
  const { data } = await db.from('tickets').select('tech_name');
  if (!data) return;
  const names = [...new Set(data.map(t => t.tech_name).filter(Boolean))].sort();
  document.getElementById('dl-tech-name').innerHTML =
    names.map(n => `<option value="${x(n)}"></option>`).join('');
}

// ── Export ────────────────────────────────────────────────────
function exportToExcel() {
  if (!allTickets.length) { alert('No tickets to export.'); return; }

  const rows = allTickets.map(t => ({
    'Ticket ID':     t.ticket_id     || '',
    'Product':       t.product_name  || '',
    'Subject':       t.subject       || '',
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

  const wb   = XLSX.utils.book_new();
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
