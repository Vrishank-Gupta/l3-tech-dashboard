/* globals supabase, SUPABASE_URL, SUPABASE_ANON_KEY */

const FIELDS = [
  'ticket_id','subject','fault_code','fault_code_l1','fault_code_l2',
  'symptom','defect','repair','tech_name','first_referred_date','comments'
];

let db            = null;
let allTickets    = [];
let statusFilter  = 'open';   // 'open' | 'closed' | 'all'
let sortByPendency = true;
let searchTimer   = null;

// ── Bootstrap ─────────────────────────────────────────────────
function init() {
  if (!SUPABASE_URL || SUPABASE_URL.includes('REPLACE')) {
    document.getElementById('setupBanner').classList.remove('hidden');
    document.getElementById('ticketBody').innerHTML =
      '<tr><td colspan="13" class="empty">Configure Supabase credentials in config.js to get started.</td></tr>';
    return;
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  loadTickets();
}

// ── Filter tabs ───────────────────────────────────────────────
function setFilter(f) {
  statusFilter = f;
  ['open','closed','all'].forEach(id =>
    document.getElementById('tab-' + id).classList.toggle('active', id === f)
  );
  // swap sort label: closed view sorts by resolution, open by pendency
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

  // Status filter — treat null status as 'open' (legacy rows)
  if (statusFilter === 'open') {
    query = query.or('status.eq.open,status.is.null');
  } else if (statusFilter === 'closed') {
    query = query.eq('status', 'closed');
  }

  if (search) {
    const s = search.replace(/'/g, "''");
    query = query.or([
      `ticket_id.ilike.%${s}%`,
      `fault_code.ilike.%${s}%`,
      `fault_code_l1.ilike.%${s}%`,
      `fault_code_l2.ilike.%${s}%`,
      `tech_name.ilike.%${s}%`
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

// Adds display_days to each ticket:
//   open ticket  → days since first_referred_date (pendency)
//   closed ticket → days from first_referred_date to closed_at (resolution)
function enrich(tickets) {
  const today = new Date();
  return tickets.map(t => {
    const out = { ...t };
    if (!t.first_referred_date) { out.display_days = null; return out; }

    if (t.status === 'closed' && t.closed_at) {
      out.display_days = Math.floor(
        (new Date(t.closed_at) - new Date(t.first_referred_date)) / 86400000
      );
    } else {
      out.display_days = Math.floor(
        (today - new Date(t.first_referred_date)) / 86400000
      );
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
    tbody.innerHTML = '<tr><td colspan="13" class="empty">No tickets found.</td></tr>';
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
      <td title="${x(t.subject)}">${x(t.subject)}</td>
      <td title="${x(t.fault_code)}">${x(t.fault_code)}</td>
      <td title="${x(t.fault_code_l1)}">${x(t.fault_code_l1)}</td>
      <td title="${x(t.fault_code_l2)}">${x(t.fault_code_l2)}</td>
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
    return `<span class="badge badge-closed" title="Closed in ${days} day${days === 1 ? '' : 's'}">✓ ${days}d</span>`;

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
  FIELDS.forEach(f => { document.getElementById('f_' + f).value = ''; });
  document.getElementById('f_id').value = '';

  if (id) {
    const t = allTickets.find(t => t.id === id);
    if (t) {
      document.getElementById('f_id').value = id;
      FIELDS.forEach(f => { document.getElementById('f_' + f).value = t[f] ?? ''; });
    }
    document.getElementById('modalTitle').textContent = 'Edit Ticket';
  } else {
    document.getElementById('modalTitle').textContent = 'Add Ticket';
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('f_ticket_id').focus();
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
    'Ticket ID':        t.ticket_id    || '',
    'Subject':          t.subject      || '',
    'Fault Code':       t.fault_code   || '',
    'Fault Code L1':    t.fault_code_l1 || '',
    'Fault Code L2':    t.fault_code_l2 || '',
    'Symptom':          t.symptom      || '',
    'Defect':           t.defect       || '',
    'Repair':           t.repair       || '',
    'Tech Person':      t.tech_name    || '',
    'First Referred':   t.first_referred_date || '',
    'Status':           t.status       || 'open',
    'Days (Pendency / Resolution)': t.display_days !== null && t.display_days !== undefined ? t.display_days : '',
    'Closed On':        t.closed_at ? new Date(t.closed_at).toLocaleDateString('en-IN') : '',
    'Comments':         t.comments     || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    {wch:14},{wch:24},{wch:14},{wch:16},{wch:16},
    {wch:28},{wch:28},{wch:28},{wch:18},{wch:16},
    {wch:10},{wch:28},{wch:14},{wch:32}
  ];

  const wb = XLSX.utils.book_new();
  const label = statusFilter === 'all' ? 'All' : statusFilter === 'closed' ? 'Closed' : 'Open';
  XLSX.utils.book_append_sheet(wb, ws, `${label} Tickets`);

  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `L3_Tickets_${label}_${date}.xlsx`);
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
