/* globals supabase, SUPABASE_URL, SUPABASE_ANON_KEY */

const FIELDS = [
  'ticket_id','subject','fault_code','fault_code_l1','fault_code_l2',
  'symptom','defect','repair','tech_name','first_referred_date','comments'
];

let db           = null;
let allTickets   = [];
let sortByPendency = true;
let searchTimer  = null;

// ── Bootstrap ────────────────────────────────────────────────
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

// ── Data ─────────────────────────────────────────────────────
async function loadTickets() {
  const search = document.getElementById('searchInput').value.trim();

  let query = db.from('tickets').select('*');

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

  if (error) {
    showError('Could not load tickets: ' + error.message);
    return;
  }

  hideError();
  allTickets = addPendency(data || []);

  if (sortByPendency) {
    allTickets.sort((a, b) => (b.pendency_days ?? -1) - (a.pendency_days ?? -1));
  } else {
    allTickets.sort((a, b) => b.id - a.id);
  }

  render(allTickets);
}

function addPendency(tickets) {
  const today = new Date();
  return tickets.map(t => ({
    ...t,
    pendency_days: t.first_referred_date
      ? Math.floor((today - new Date(t.first_referred_date)) / 86400000)
      : null
  }));
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

  tbody.innerHTML = tickets.map(t => `
    <tr>
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
      <td class="col-center">${badge(t.pendency_days)}</td>
      <td title="${x(t.comments)}">${x(t.comments)}</td>
      <td class="action-cell">
        <button class="btn-icon" title="Edit"   onclick="openModal(${t.id})">✏️</button>
        <button class="btn-icon del" title="Delete" onclick="deleteTicket(${t.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function badge(days) {
  if (days === null || days === undefined)
    return '<span class="badge badge-grey">—</span>';
  const cls = days >= 30 ? 'badge-red'
            : days >= 15 ? 'badge-orange'
            : days >= 7  ? 'badge-yellow'
            :               'badge-green';
  return `<span class="badge ${cls}">${days}</span>`;
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
  btn.textContent = sortByPendency ? 'Sort: Pendency ↓' : 'Sort: Newest First';
  btn.classList.toggle('active', sortByPendency);
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
      FIELDS.forEach(f => {
        document.getElementById('f_' + f).value = t[f] ?? '';
      });
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
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  const { error } = await db.from('tickets').delete().eq('id', id);
  if (error) { showError('Delete failed: ' + error.message); return; }
  loadTickets();
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
