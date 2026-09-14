/**
 * Nirmala Matha Central School - Mobile-First IT Complaint Register
 * Application Logic & Administrative Engine
 */

// Storage & Auth Keys
const STORAGE_KEY = 'nmcs_it_complaints_db_v4';
const AUTH_KEY = 'nmcs_admin_logged_in_v4';
const VIEW_MODE_KEY = 'nmcs_device_view_mode';

// Specified IT Admin Credentials
const ADMIN_SECURITY_ID = 'nmcs';
const ADMIN_PASSWORD = 'admin@nmcs';

// Global State
let tickets = [];
let activeFilterStatus = 'ALL';
let activeFilterPriority = 'ALL';
let isServerConnected = false;
let syncPollingTimer = null;
let lastSubmittedTicketId = null;

// Audio Chimes (Synthesized Web Audio API - Zero External Files Required)
function playChime(type = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'alert') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // AudioContext not allowed before user gesture or unavailable
  }
}

// -----------------------------------------------------------------------------
// App Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initViewMode();
  loadTickets();
  updateAdminUIState();
  initBezelClock();

  // Periodically poll server for multi-device sync
  syncWithServer();
  syncPollingTimer = setInterval(() => {
    syncWithServer();
  }, 4000);

  if (window.lucide) {
    lucide.createIcons();
  }
});

// Bezel clock on phone simulator
function initBezelClock() {
  const bezelEl = document.getElementById('bezel-time');
  if (!bezelEl) return;
  const update = () => {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    bezelEl.textContent = `${h}:${m}`;
  };
  update();
  setInterval(update, 30000);
}

// -----------------------------------------------------------------------------
// Desktop View Mode (Mobile Simulator vs Full Width)
// -----------------------------------------------------------------------------
function initViewMode() {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved === 'full') {
    setDeviceViewMode('full', false);
  } else {
    setDeviceViewMode('simulator', false);
  }
}

function setDeviceViewMode(mode, save = true) {
  const wrapper = document.getElementById('device-wrapper');
  const btnSim = document.getElementById('btn-mode-sim');
  const btnFull = document.getElementById('btn-mode-full');

  if (!wrapper) return;

  if (mode === 'full') {
    wrapper.classList.remove('simulator-mode');
    wrapper.classList.add('full-mode');
    if (btnFull && btnSim) {
      btnFull.className = 'px-2.5 py-1 rounded font-semibold transition bg-blue-600 text-white flex items-center gap-1.5 shadow';
      btnSim.className = 'px-2.5 py-1 rounded font-semibold transition text-slate-400 hover:text-white flex items-center gap-1.5';
    }
  } else {
    wrapper.classList.remove('full-mode');
    wrapper.classList.add('simulator-mode');
    if (btnFull && btnSim) {
      btnSim.className = 'px-2.5 py-1 rounded font-semibold transition bg-blue-600 text-white flex items-center gap-1.5 shadow';
      btnFull.className = 'px-2.5 py-1 rounded font-semibold transition text-slate-400 hover:text-white flex items-center gap-1.5';
    }
  }

  if (save) {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }
}

// -----------------------------------------------------------------------------
// Server Sync & Data Storage (Auto-Flattening)
// -----------------------------------------------------------------------------
function flattenTicketList(raw) {
  if (!raw) return [];
  let result = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && item.value && Array.isArray(item.value)) {
        result = result.concat(flattenTicketList(item.value));
      } else if (item && item.id) {
        result.push(item);
      }
    }
  } else if (raw && raw.value && Array.isArray(raw.value)) {
    result = flattenTicketList(raw.value);
  }
  return result;
}

function loadTickets() {
  const localData = localStorage.getItem(STORAGE_KEY);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      tickets = flattenTicketList(parsed);
    } catch (e) {
      tickets = [];
    }
  } else {
    tickets = [];
  }
  updateKPIs();
  renderAdminTickets();
}

function saveTickets(item = null, action = 'save-all') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  } catch (e) {}

  // Central REST Server Sync
  if (typeof fetch === 'function') {
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.protocol === 'file:';
    const baseUrl = isLocal ? '' : '';

    if (action === 'create' && item) {
      fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      }).then(r => setServerStatus(r.ok)).catch(() => setServerStatus(false));
    } else if (action === 'update' && item) {
      fetch(`${baseUrl}/api/tickets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      }).then(r => setServerStatus(r.ok)).catch(() => setServerStatus(false));
    } else if (action === 'delete' && item) {
      fetch(`${baseUrl}/api/tickets?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE'
      }).then(r => setServerStatus(r.ok)).catch(() => setServerStatus(false));
    } else {
      fetch(`${baseUrl}/api/tickets/save-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tickets)
      }).then(r => setServerStatus(r.ok)).catch(() => setServerStatus(false));
    }
  }
}

async function syncWithServer() {
  try {
    const res = await fetch('/api/tickets', { cache: 'no-store' });
    if (res.ok) {
      const serverRaw = await res.json();
      const flat = flattenTicketList(serverRaw);
      setServerStatus(true);

      const cur = JSON.stringify(tickets);
      const incoming = JSON.stringify(flat);

      if (cur !== incoming) {
        const oldLen = tickets.length;
        tickets = flat;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
        updateKPIs();
        renderAdminTickets();

        if (flat.length > oldLen && isAdminAuthenticated()) {
          const newest = flat[0];
          showToast(`ðŸ”” New complaint: ${newest.category} (${newest.teacherClass}-${newest.teacherDivision})`, 'info');
          playChime('alert');
        }
      }
    } else {
      setServerStatus(false);
    }
  } catch (e) {
    setServerStatus(false);
  }
}

function setServerStatus(connected) {
  isServerConnected = connected;
  const badge = document.getElementById('sync-dot-badge');
  const text = document.getElementById('sync-text-short');
  if (badge) {
    if (connected) {
      badge.className = 'flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-[10px] text-emerald-300 font-semibold';
      badge.title = 'Connected to Central IT Server';
      if (text) text.textContent = 'Live';
    } else {
      badge.className = 'flex items-center gap-1 px-2 py-1 rounded-full bg-amber-950/80 border border-amber-500/50 text-[10px] text-amber-300 font-semibold';
      badge.title = 'Offline / Local Cache';
      if (text) text.textContent = 'Offline';
    }
  }
}

function manualSyncFromUI() {
  const icon = document.getElementById('sync-icon');
  if (icon) icon.classList.add('animate-spin');
  syncWithServer().then(() => {
    showToast('Database synchronized', 'success');
  }).finally(() => {
    setTimeout(() => {
      if (icon) icon.classList.remove('animate-spin');
    }, 600);
  });
}

// -----------------------------------------------------------------------------
// Tab Switching
// -----------------------------------------------------------------------------
function switchTab(tabName) {
  // Guard admin view
  if (tabName === 'admin' && !isAdminAuthenticated()) {
    openAdminLoginModal();
    return;
  }

  // Hide all tab views
  document.querySelectorAll('.tab-view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('block');
  });

  // Reset bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.classList.remove('active');
  });

  // Activate selected view
  const targetView = document.getElementById(`view-${tabName}`);
  const targetNav = document.getElementById(`nav-item-${tabName}`);

  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('block');
  }

  if (targetNav) {
    targetNav.classList.add('active');
  }

  // Scroll app to top
  const scrollContainer = document.getElementById('app-scroll-content');
  if (scrollContainer) scrollContainer.scrollTop = 0;

  if (window.lucide) lucide.createIcons();
}

function handleAdminTabClick(tabName) {
  if (isAdminAuthenticated()) {
    switchTab('admin');
  } else {
    openAdminLoginModal();
  }
}

// -----------------------------------------------------------------------------
// Authentication Gate: ID 'nmcs' & Password 'admin@nmcs'
// -----------------------------------------------------------------------------
function isAdminAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

function openAdminLoginModal() {
  const modal = document.getElementById('modal-admin-login');
  if (modal) {
    modal.classList.remove('hidden');
    const err = document.getElementById('login-error-banner');
    if (err) err.classList.add('hidden');
    const idInput = document.getElementById('admin-security-id');
    if (idInput) setTimeout(() => idInput.focus(), 150);
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('modal-admin-login');
  if (modal) modal.classList.add('hidden');
}

function handleAdminLogin(event) {
  event.preventDefault();
  const idInput = document.getElementById('admin-security-id');
  const passInput = document.getElementById('admin-password');
  const errBanner = document.getElementById('login-error-banner');

  const id = idInput ? idInput.value.trim() : '';
  const pass = passInput ? passInput.value.trim() : '';

  if (id === ADMIN_SECURITY_ID && pass === ADMIN_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, 'true');
    closeAdminLoginModal();
    updateAdminUIState();
    switchTab('admin');
    showToast('IT Admin authenticated successfully', 'success');
    playChime('success');
  } else {
    if (errBanner) {
      errBanner.classList.remove('hidden');
      errBanner.classList.add('animate-bounce');
      setTimeout(() => errBanner.classList.remove('animate-bounce'), 1000);
    }
    if (passInput) {
      passInput.value = '';
      passInput.focus();
    }
    showToast('Invalid Security ID or Password', 'error');
  }
}

function logoutAdmin() {
  sessionStorage.removeItem(AUTH_KEY);
  updateAdminUIState();
  switchTab('lodge');
  showToast('IT Admin logged out', 'info');
}

function updateAdminUIState() {
  const isAuth = isAdminAuthenticated();
  const gate = document.getElementById('admin-locked-gate');
  const dash = document.getElementById('admin-dashboard');
  const headerBtn = document.getElementById('header-admin-btn');

  if (gate && dash) {
    if (isAuth) {
      gate.classList.add('hidden');
      dash.classList.remove('hidden');
    } else {
      gate.classList.remove('hidden');
      dash.classList.add('hidden');
    }
  }

  if (headerBtn) {
    if (isAuth) {
      headerBtn.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/40');
      headerBtn.classList.remove('text-amber-400', 'border-amber-400/30');
      headerBtn.title = 'IT Admin Active (nmcs)';
    } else {
      headerBtn.classList.remove('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/40');
      headerBtn.classList.add('text-amber-400', 'border-amber-400/30');
      headerBtn.title = 'IT Admin Portal (Locked)';
    }
  }

  if (isAuth) {
    renderAdminTickets();
    updateKPIs();
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i data-lucide="eye-off" class="w-4 h-4"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i data-lucide="eye" class="w-4 h-4"></i>';
  }
  if (window.lucide) lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Complaint Submission (Teacher Portal)
// -----------------------------------------------------------------------------
function handleCategorySelection(val) {
  const descStar = document.getElementById('desc-required-star');
  const otherHint = document.getElementById('other-hint');
  const descInput = document.getElementById('complaintDescription');

  if (val === 'other issue') {
    if (descStar) {
      descStar.textContent = '(Required for Other Issue)';
      descStar.className = 'text-red-500 font-bold';
    }
    if (otherHint) otherHint.classList.remove('hidden');
    if (descInput) {
      descInput.setAttribute('required', 'required');
      descInput.focus();
    }
  } else {
    if (descStar) {
      descStar.textContent = '(Optional)';
      descStar.className = 'text-slate-400 font-normal';
    }
    if (otherHint) otherHint.classList.add('hidden');
    if (descInput) {
      descInput.removeAttribute('required');
    }
  }
}

function generateTicketId() {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  for (const t of tickets) {
    if (t.id && t.id.startsWith(`NMCS-IT-${year}-`)) {
      const parts = t.id.split('-');
      const seq = parseInt(parts[3], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `NMCS-IT-${year}-${nextSeq}`;
}

function handleTeacherSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById('teacherName');
  const classInput = document.getElementById('teacherClass');
  const divInput = document.getElementById('teacherDivision');
  const phoneInput = document.getElementById('teacherPhone');
  const roomInput = document.getElementById('roomLocation');
  const catInput = document.getElementById('complaintCategory');
  const descInput = document.getElementById('complaintDescription');
  const prioInput = document.getElementById('teacherPriority');

  const teacherName = nameInput.value.trim();
  const teacherClass = classInput.value;
  const teacherDivision = divInput.value;
  const teacherPhone = phoneInput.value.trim();
  const roomLocation = roomInput ? roomInput.value.trim() : '';
  const category = catInput.value;
  const description = descInput ? descInput.value.trim() : '';
  const priority = prioInput ? prioInput.value : 'Medium';

  // Validation
  if (!teacherName || !teacherClass || !teacherDivision || !teacherPhone || !category) {
    showToast('Please fill all mandatory fields.', 'warning');
    return;
  }

  if (category === 'other issue' && !description) {
    showToast('Please specify details for the "other issue".', 'warning');
    descInput.focus();
    return;
  }

  // Format Date (Indian Standard Time YYYY-MM-DD HH:mm)
  const now = new Date();
  const dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const ticketId = generateTicketId();

  const newTicket = {
    id: ticketId,
    createdAt: dateStr,
    teacherName: teacherName,
    teacherClass: teacherClass,
    teacherDivision: teacherDivision,
    roomLocation: roomLocation || `${teacherClass} - ${teacherDivision}`,
    teacherPhone: teacherPhone,
    category: category,
    description: description || `Reported issue: ${category}`,
    priority: priority,
    status: 'Pending',
    assignedTo: 'Unassigned',
    itNotes: '',
    timeline: [
      {
        time: dateStr,
        text: `Complaint registered by ${teacherName} (${teacherClass} - ${teacherDivision}) with mobile +91 ${teacherPhone}`
      }
    ]
  };

  // Prepend to tickets list
  tickets.unshift(newTicket);
  lastSubmittedTicketId = ticketId;

  // Persist locally and sync with server
  saveTickets(newTicket, 'create');

  // Reset form
  event.target.reset();
  handleCategorySelection('');

  // Update metrics
  updateKPIs();
  renderAdminTickets();

  // Show success modal
  openSuccessModal(newTicket);
  playChime('success');
  showToast(`Complaint registered: ${ticketId}`, 'success');
}

// -----------------------------------------------------------------------------
// Ticket Registered Success Bottom Sheet & WhatsApp Dispatch
// -----------------------------------------------------------------------------
function openSuccessModal(ticket) {
  const modal = document.getElementById('modal-ticket-success');
  const idEl = document.getElementById('modal-ticket-id');
  const metaEl = document.getElementById('modal-ticket-meta');
  const waBtn = document.getElementById('btn-modal-whatsapp');

  if (idEl) idEl.textContent = ticket.id;
  if (metaEl) metaEl.textContent = `Teacher: ${ticket.teacherName} â€¢ ${ticket.teacherClass} (${ticket.teacherDivision})`;

  if (waBtn) {
    const textMsg = 
`*NIRMALA MATHA CENTRAL SCHOOL*
*IT Complaint Ticket Token*
--------------------------------
*Ticket ID*: ${ticket.id}
*Teacher*: ${ticket.teacherName}
*Class*: ${ticket.teacherClass} - ${ticket.teacherDivision}
*Location*: ${ticket.roomLocation}
*Issue*: ${ticket.category}
*Status*: Pending IT Attention
*Registered*: ${ticket.createdAt}
--------------------------------
_Keep this token for tracking repair progress._`;

    const encoded = encodeURIComponent(textMsg);
    // WhatsApp direct link to teacher phone
    const cleanPhone = ticket.teacherPhone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    waBtn.href = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encoded}`;
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeSuccessModal() {
  const modal = document.getElementById('modal-ticket-success');
  if (modal) modal.classList.add('hidden');
}

function trackCurrentSubmittedTicket() {
  closeSuccessModal();
  switchTab('track');
  const input = document.getElementById('track-search-input');
  if (input && lastSubmittedTicketId) {
    input.value = lastSubmittedTicketId;
    searchTeacherTicket();
  }
}

// -----------------------------------------------------------------------------
// Teacher Ticket Tracking ("My Ticket")
// -----------------------------------------------------------------------------
function searchTeacherTicket() {
  const input = document.getElementById('track-search-input');
  const container = document.getElementById('track-result-container');
  if (!input || !container) return;

  const query = input.value.trim().toLowerCase();
  if (!query) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-6 text-center text-slate-400 border border-dashed border-slate-200">
        <i data-lucide="info" class="w-7 h-7 mx-auto text-slate-300 mb-1.5"></i>
        <p class="text-xs">Please enter a Ticket ID or Mobile Number to search.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const matched = tickets.filter(t => {
    const id = (t.id || '').toLowerCase();
    const phone = (t.teacherPhone || '').toLowerCase();
    const name = (t.teacherName || '').toLowerCase();
    return id.includes(query) || phone.includes(query) || name.includes(query);
  });

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-6 text-center text-slate-500 border border-slate-200">
        <div class="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
          <i data-lucide="search-x" class="w-6 h-6"></i>
        </div>
        <h4 class="text-sm font-bold text-slate-800">No Complaints Found</h4>
        <p class="text-xs text-slate-400 mt-1">No ticket matches "${query}". Please check your Ticket Token or 10-digit phone number.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = matched.map(t => {
    let statusClass = 'badge-status-pending';
    let statusIcon = 'clock';
    if (t.status === 'In Progress') {
      statusClass = 'badge-status-inprogress';
      statusIcon = 'wrench';
    } else if (t.status === 'Resolved') {
      statusClass = 'badge-status-resolved';
      statusIcon = 'check-circle';
    } else if (t.status === 'Closed') {
      statusClass = 'badge-status-closed';
      statusIcon = 'check';
    }

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">${t.id}</span>
          <span class="badge-status ${statusClass}">
            <i data-lucide="${statusIcon}" class="w-3 h-3"></i>
            <span>${t.status}</span>
          </span>
        </div>

        <div>
          <div class="text-xs font-bold text-slate-900">${t.category}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${t.description || 'No additional remarks'}</div>
        </div>

        <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-400">Teacher:</span>
            <span class="font-semibold text-slate-800">${t.teacherName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Class & Div:</span>
            <span class="font-semibold text-slate-800">${t.teacherClass} - ${t.teacherDivision}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Location:</span>
            <span class="font-semibold text-slate-800">${t.roomLocation || '-'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Registered:</span>
            <span class="text-slate-700">${t.createdAt}</span>
          </div>
          ${t.itNotes ? `
          <div class="pt-1.5 border-t border-slate-200 mt-1">
            <span class="text-[10px] font-bold text-blue-700 uppercase">IT Technician Remarks:</span>
            <div class="text-xs text-slate-800 bg-white p-1.5 rounded mt-0.5 border border-blue-100">${t.itNotes}</div>
          </div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// -----------------------------------------------------------------------------
// IT Admin Register & Complaints Card Stream
// -----------------------------------------------------------------------------
function updateKPIs() {
  const totalEl = document.getElementById('kpi-total');
  const pendingEl = document.getElementById('kpi-pending');
  const progressEl = document.getElementById('kpi-progress');
  const resolvedEl = document.getElementById('kpi-resolved');

  const countAll = document.getElementById('count-all');
  const countPending = document.getElementById('count-pending');
  const countProgress = document.getElementById('count-progress');
  const countResolved = document.getElementById('count-resolved');

  const total = tickets.length;
  const pending = tickets.filter(t => t.status === 'Pending').length;
  const progress = tickets.filter(t => t.status === 'In Progress').length;
  const resolved = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (progressEl) progressEl.textContent = progress;
  if (resolvedEl) resolvedEl.textContent = resolved;

  if (countAll) countAll.textContent = total;
  if (countPending) countPending.textContent = pending;
  if (countProgress) countProgress.textContent = progress;
  if (countResolved) countResolved.textContent = resolved;
}

function setFilterStatus(status) {
  activeFilterStatus = status;
  activeFilterPriority = 'ALL';
  updateFilterPillUI();
  renderAdminTickets();
}

function setFilterPriority(prio) {
  activeFilterPriority = prio;
  activeFilterStatus = 'ALL';
  updateFilterPillUI();
  renderAdminTickets();
}

function updateFilterPillUI() {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));

  if (activeFilterPriority === 'Urgent') {
    const el = document.getElementById('pill-filter-urgent');
    if (el) el.classList.add('active');
  } else if (activeFilterPriority === 'High') {
    const el = document.getElementById('pill-filter-high');
    if (el) el.classList.add('active');
  } else if (activeFilterStatus === 'Pending') {
    const el = document.getElementById('pill-filter-pending');
    if (el) el.classList.add('active');
  } else if (activeFilterStatus === 'In Progress') {
    const el = document.getElementById('pill-filter-progress');
    if (el) el.classList.add('active');
  } else if (activeFilterStatus === 'Resolved') {
    const el = document.getElementById('pill-filter-resolved');
    if (el) el.classList.add('active');
  } else {
    const el = document.getElementById('pill-filter-all');
    if (el) el.classList.add('active');
  }
}

function applyFilters() {
  renderAdminTickets();
}

function renderAdminTickets() {
  const container = document.getElementById('admin-tickets-container');
  if (!container) return;

  const searchInput = document.getElementById('admin-search');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = tickets.filter(t => {
    // Status Filter
    if (activeFilterStatus !== 'ALL') {
      if (activeFilterStatus === 'Resolved') {
        if (t.status !== 'Resolved' && t.status !== 'Closed') return false;
      } else if (t.status !== activeFilterStatus) {
        return false;
      }
    }

    // Priority Filter
    if (activeFilterPriority !== 'ALL' && t.priority !== activeFilterPriority) {
      return false;
    }

    // Search Query
    if (query) {
      const matchId = (t.id || '').toLowerCase().includes(query);
      const matchName = (t.teacherName || '').toLowerCase().includes(query);
      const matchClass = (t.teacherClass || '').toLowerCase().includes(query);
      const matchDiv = (t.teacherDivision || '').toLowerCase().includes(query);
      const matchCat = (t.category || '').toLowerCase().includes(query);
      const matchDesc = (t.description || '').toLowerCase().includes(query);
      const matchPhone = (t.teacherPhone || '').toLowerCase().includes(query);
      if (!matchId && !matchName && !matchClass && !matchDiv && !matchCat && !matchDesc && !matchPhone) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>
        <h4 class="text-sm font-bold text-slate-700">No Complaints Match Filters</h4>
        <p class="text-xs text-slate-400 mt-1">Try resetting the filter pills or clearing the search query.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(t => {
    // Priority badge class & border
    let priorityClass = 'badge-priority-medium';
    let borderClass = 'priority-medium-border';
    if (t.priority === 'Urgent') {
      priorityClass = 'badge-priority-urgent';
      borderClass = 'priority-urgent-border';
    } else if (t.priority === 'High') {
      priorityClass = 'badge-priority-high';
      borderClass = 'priority-high-border';
    } else if (t.priority === 'Low') {
      priorityClass = 'badge-priority-low';
      borderClass = 'priority-low-border';
    }

    // Status badge class
    let statusClass = 'badge-status-pending';
    if (t.status === 'In Progress') statusClass = 'badge-status-inprogress';
    if (t.status === 'Resolved') statusClass = 'badge-status-resolved';
    if (t.status === 'Closed') statusClass = 'badge-status-closed';

    // Category icon
    let catIcon = 'alert-circle';
    let iconBg = 'bg-blue-50 text-blue-600';
    if (t.category.includes('Extramarks')) {
      catIcon = 'monitor';
      iconBg = 'bg-indigo-50 text-indigo-600';
    } else if (t.category.includes('PRESENTATIONS')) {
      catIcon = 'airplay';
      iconBg = 'bg-purple-50 text-purple-600';
    } else if (t.category.includes('network')) {
      catIcon = 'wifi';
      iconBg = 'bg-emerald-50 text-emerald-600';
    } else if (t.category.includes('Smart Board')) {
      catIcon = 'tv';
      iconBg = 'bg-amber-50 text-amber-600';
    } else {
      catIcon = 'tool';
      iconBg = 'bg-slate-100 text-slate-700';
    }

    // Clean phone for WhatsApp & Calls
    const cleanPhone = (t.teacherPhone || '').replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waText = encodeURIComponent(
      `Hello ${t.teacherName} (Nirmala Matha Central School), regarding your IT complaint ${t.id} for "${t.category}" in ${t.teacherClass}-${t.teacherDivision}: current status is *${t.status}*. IT Team.`
    );

    return `
      <div class="complaint-mobile-card ${borderClass} space-y-3">
        
        <!-- Card Top Bar: Ticket ID, Time, Priority Badge -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-xs font-bold text-slate-900">${t.id}</span>
            <span class="text-[10px] text-slate-400">&bull; ${t.createdAt}</span>
          </div>

          <div class="flex items-center gap-1">
            <span class="badge-priority ${priorityClass}">${t.priority}</span>
            <span class="badge-status ${statusClass}">${t.status}</span>
          </div>
        </div>

        <!-- Issue Title & Icon -->
        <div class="flex items-start gap-2.5">
          <div class="category-icon-bubble ${iconBg}">
            <i data-lucide="${catIcon}" class="w-5 h-5"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-xs sm:text-sm font-bold text-slate-900 leading-snug">${t.category}</h3>
            <p class="text-[11px] text-slate-600 line-clamp-2 mt-0.5">${t.description || 'No additional remarks.'}</p>
          </div>
        </div>

        <!-- Teacher & Location Bar -->
        <div class="flex flex-wrap items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl gap-2 border border-slate-100">
          <div>
            <span class="font-bold text-slate-900">${t.teacherName}</span>
            <span class="text-slate-500 text-[11px] block">${t.teacherClass} &bull; ${t.teacherDivision}</span>
          </div>
          <div class="text-right">
            <span class="text-[11px] text-slate-500 font-medium">${t.roomLocation || '-'}</span>
            <div class="text-[11px] font-mono text-blue-700 font-semibold">+91 ${t.teacherPhone}</div>
          </div>
        </div>

        <!-- Interactive 1-Tap Status & Priority Dropdowns -->
        <div class="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Update Status</label>
            <select onchange="updateTicketStatus('${t.id}', this.value)" class="w-full text-xs font-bold p-2 rounded-xl border border-slate-300 bg-white text-slate-800">
              <option value="Pending" ${t.status === 'Pending' ? 'selected' : ''}>ðŸŸ¡ Pending</option>
              <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>ðŸ”µ In Progress</option>
              <option value="Resolved" ${t.status === 'Resolved' ? 'selected' : ''}>ðŸŸ¢ Resolved</option>
              <option value="Closed" ${t.status === 'Closed' ? 'selected' : ''}>âšª Closed</option>
            </select>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Set Priority</label>
            <select onchange="updateTicketPriority('${t.id}', this.value)" class="w-full text-xs font-bold p-2 rounded-xl border border-slate-300 bg-white text-slate-800">
              <option value="Low" ${t.priority === 'Low' ? 'selected' : ''}>Low Priority</option>
              <option value="Medium" ${t.priority === 'Medium' ? 'selected' : ''}>Medium Priority</option>
              <option value="High" ${t.priority === 'High' ? 'selected' : ''}>High Priority</option>
              <option value="Urgent" ${t.priority === 'Urgent' ? 'selected' : ''}>ðŸ”¥ Urgent Priority</option>
            </select>
          </div>
        </div>

        <!-- Quick Action Buttons: WhatsApp, Call, Notes, Delete -->
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          
          <div class="flex items-center gap-1.5">
            <!-- 1-Click Quick Advance -->
            ${t.status === 'Pending' ? `
              <button onclick="updateTicketStatus('${t.id}', 'In Progress')" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[11px] flex items-center gap-1 transition">
                <i data-lucide="wrench" class="w-3 h-3"></i>
                <span>Attend</span>
              </button>
            ` : ''}

            ${t.status === 'In Progress' ? `
              <button onclick="updateTicketStatus('${t.id}', 'Resolved')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[11px] flex items-center gap-1 transition">
                <i data-lucide="check" class="w-3 h-3"></i>
                <span>Resolve</span>
              </button>
            ` : ''}

            <!-- Details & Notes -->
            <button onclick="openTicketDetailModal('${t.id}')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Add IT Notes">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <!-- WhatsApp Teacher -->
            <a href="https://api.whatsapp.com/send?phone=${fullPhone}&text=${waText}" target="_blank" class="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition" title="WhatsApp Teacher">
              <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
            </a>

            <!-- Call Teacher -->
            <a href="tel:${cleanPhone}" class="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition" title="Call Teacher">
              <i data-lucide="phone" class="w-3.5 h-3.5"></i>
            </a>

            <!-- Delete Ticket -->
            <button onclick="confirmDeleteTicket('${t.id}')" class="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition" title="Delete Complaint">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Admin Ticket Updates (Status, Priority, Notes, Delete)
// -----------------------------------------------------------------------------
function updateTicketStatus(ticketId, newStatus) {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const oldStatus = ticket.status;
  ticket.status = newStatus;

  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  ticket.timeline = ticket.timeline || [];
  ticket.timeline.unshift({
    time: `${now.toISOString().split('T')[0]} ${timeStr}`,
    text: `Status changed from "${oldStatus}" to "${newStatus}" by IT Admin`
  });

  saveTickets(ticket, 'update');
  updateKPIs();
  renderAdminTickets();
  showToast(`${ticketId} marked as ${newStatus}`, 'success');
  playChime('success');
}

function updateTicketPriority(ticketId, newPriority) {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  ticket.priority = newPriority;

  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  ticket.timeline = ticket.timeline || [];
  ticket.timeline.unshift({
    time: `${now.toISOString().split('T')[0]} ${timeStr}`,
    text: `Priority changed to "${newPriority}" by IT Admin`
  });

  saveTickets(ticket, 'update');
  renderAdminTickets();
  showToast(`${ticketId} priority set to ${newPriority}`, 'info');
}

function confirmDeleteTicket(ticketId) {
  if (confirm(`Are you sure you want to delete complaint ${ticketId}?`)) {
    const idx = tickets.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      const removed = tickets.splice(idx, 1)[0];
      saveTickets(removed, 'delete');
      updateKPIs();
      renderAdminTickets();
      showToast(`Complaint ${ticketId} deleted`, 'info');
    }
  }
}

// -----------------------------------------------------------------------------
// Ticket Detail & IT Notes Modal
// -----------------------------------------------------------------------------
function openTicketDetailModal(ticketId) {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const container = document.getElementById('ticket-detail-content');
  const modal = document.getElementById('modal-ticket-detail');
  if (!container || !modal) return;

  container.innerHTML = `
    <div class="sheet-drag-handle"></div>

    <div class="flex items-center justify-between pb-2 border-b border-slate-100">
      <div>
        <h3 class="text-sm font-bold text-slate-900 font-display">${ticket.id}</h3>
        <p class="text-[11px] text-slate-500">${ticket.category} &bull; ${ticket.teacherClass}-${ticket.teacherDivision}</p>
      </div>
      <button onclick="closeTicketDetailModal()" class="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Details -->
    <div class="text-xs space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div><strong class="text-slate-700">Teacher:</strong> ${ticket.teacherName}</div>
      <div><strong class="text-slate-700">Phone:</strong> +91 ${ticket.teacherPhone}</div>
      <div><strong class="text-slate-700">Room / Location:</strong> ${ticket.roomLocation}</div>
      <div><strong class="text-slate-700">Registered:</strong> ${ticket.createdAt}</div>
      <div><strong class="text-slate-700">Description:</strong> ${ticket.description || 'None'}</div>
    </div>

    <!-- Technician Notes Form -->
    <div class="space-y-2 pt-1">
      <label class="block text-xs font-bold text-slate-800">IT Technician Notes / Resolution Action</label>
      <textarea id="modal-it-notes" rows="3" placeholder="Add resolution details, e.g. Cable replaced, Extramarks re-logged, Wi-Fi router rebooted..."
        class="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">${ticket.itNotes || ''}</textarea>
    </div>

    <!-- Timeline History -->
    <div>
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">History &amp; Actions</div>
      <div class="space-y-1.5 max-h-36 overflow-y-auto">
        ${(ticket.timeline || []).map(tl => `
          <div class="text-[11px] bg-white p-2 rounded-lg border border-slate-100 text-slate-600 flex items-start gap-2">
            <span class="text-slate-400 font-mono shrink-0">${tl.time}</span>
            <span>${tl.text}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Save Button -->
    <div class="pt-2">
      <button onclick="saveTicketNotes('${ticket.id}')" class="mobile-btn-primary">
        <i data-lucide="check" class="w-4 h-4"></i>
        <span>Save IT Notes</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeTicketDetailModal() {
  const modal = document.getElementById('modal-ticket-detail');
  if (modal) modal.classList.add('hidden');
}

function saveTicketNotes(ticketId) {
  const ticket = tickets.find(t => t.id === ticketId);
  const notesInput = document.getElementById('modal-it-notes');
  if (!ticket || !notesInput) return;

  const notes = notesInput.value.trim();
  ticket.itNotes = notes;

  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  ticket.timeline = ticket.timeline || [];
  ticket.timeline.unshift({
    time: `${now.toISOString().split('T')[0]} ${timeStr}`,
    text: `IT Technician updated notes: "${notes.substring(0, 40)}..."`
  });

  saveTickets(ticket, 'update');
  closeTicketDetailModal();
  renderAdminTickets();
  showToast('IT Notes updated', 'success');
}

// -----------------------------------------------------------------------------
// Export CSV & Print Worksheet
// -----------------------------------------------------------------------------
function exportToCSV() {
  if (tickets.length === 0) {
    showToast('No complaints to export.', 'warning');
    return;
  }

  const headers = ['Ticket ID', 'Date & Time', 'Teacher Name', 'Class', 'Division', 'Mobile', 'Location', 'Category', 'Description', 'Priority', 'Status', 'IT Notes'];
  const rows = tickets.map(t => [
    `"${t.id}"`,
    `"${t.createdAt}"`,
    `"${(t.teacherName || '').replace(/"/g, '""')}"`,
    `"${t.teacherClass}"`,
    `"${t.teacherDivision}"`,
    `"${t.teacherPhone}"`,
    `"${(t.roomLocation || '').replace(/"/g, '""')}"`,
    `"${t.category}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${t.priority}"`,
    `"${t.status}"`,
    `"${(t.itNotes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NMCS_IT_Complaints_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV export downloaded', 'success');
}

function printTechnicianWorkOrders() {
  const printContainer = document.getElementById('print-container');
  if (!printContainer) return;

  const now = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });

  printContainer.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom: 2px solid #0f2b48; padding-bottom:12px; margin-bottom: 16px;">
        <div>
          <h2 style="margin:0; color:#0f2b48; font-size:18pt;">NIRMALA MATHA CENTRAL SCHOOL</h2>
          <div style="font-size:10pt; color:#475569;">DEPARTMENT OF INFORMATION TECHNOLOGY &bull; IT COMPLAINT REGISTER</div>
          <div style="font-size:9pt; color:#64748b; margin-top:4px;">Printed on: ${now}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12pt; font-weight:bold; color:#d97706;">Daily Work Sheet</div>
          <div style="font-size:9pt; color:#475569;">Total Tickets: ${tickets.length}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:9pt;">
        <thead>
          <tr style="background:#0f2b48; color:white;">
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Ticket ID</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Teacher</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Class & Div</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Category</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Priority</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Status</th>
            <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Sign / Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map(t => `
            <tr>
              <td style="border:1px solid #cbd5e1; padding:6px; font-weight:bold;">${t.id}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${t.teacherName}<br><small style="color:#64748b;">+91 ${t.teacherPhone}</small></td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${t.teacherClass} - ${t.teacherDivision}<br><small>${t.roomLocation}</small></td>
              <td style="border:1px solid #cbd5e1; padding:6px;">${t.category}</td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; font-weight:bold;">${t.priority}</td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${t.status}</td>
              <td style="border:1px solid #cbd5e1; padding:6px; width:140px;"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  window.print();
}

// -----------------------------------------------------------------------------
// Phone Wi-Fi Access Modal & QR Code
// -----------------------------------------------------------------------------
function openShareModal() {
  const modal = document.getElementById('modal-share-qr');
  const qrImg = document.getElementById('qr-code-img');
  const urlText = document.getElementById('share-url-text');

  let accessUrl = window.location.href;
  if (accessUrl.startsWith('file:///')) {
    accessUrl = 'http://localhost:8080/';
  }

  if (urlText) urlText.textContent = accessUrl;
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(accessUrl)}`;
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeShareModal() {
  const modal = document.getElementById('modal-share-qr');
  if (modal) modal.classList.add('hidden');
}

function copyShareUrl() {
  const urlText = document.getElementById('share-url-text');
  if (urlText) {
    navigator.clipboard.writeText(urlText.textContent).then(() => {
      showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Copied link: ' + urlText.textContent, 'info');
    });
  }
}

// -----------------------------------------------------------------------------
// Toast Notifications
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'error') iconName = 'alert-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}