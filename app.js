/* ============================================================
   ACCESS CONTROL
   ------------------------------------------------------------
   Individual username/password per leader. Passwords are stored
   as SHA-256 hashes below (not plain text) — a step up from a
   readable password, but since this is a static site with no
   real backend, a determined person could still find ways around
   this by reading the code. Don't treat this as bank-grade
   security; it's meant to keep casual/public visitors out and
   give each leader their own login, not to protect truly
   sensitive data.

   TO ADD OR CHANGE A LEADER'S LOGIN:
   Send Claude the username + password you want and it will
   generate the correct hash line for you to paste in below.
   ============================================================ */
const LEADER_CREDENTIALS = [
  { username: 'keanutugonon87', name: 'KeanuTugonon', passwordHash: '171b09eeb5a9efff496bdc8eeeab71cf6648a1631b381ffe4416fe3a87f4b0f5' },
  { username: 'jamjampales12', name: 'JamJamPales', passwordHash: '66afee34dd6fd2be95e9c0332fa014f21776b26cad9192f67710cf736e8f21df' },
  { username: 'benzgwapo11', name: 'benzgwapo11', passwordHash: '9d8fa1933c05f10725fee8de4ce996214283c517a3d61cc059117ac224dedd3a' },
];
const SESSION_KEY = "gic_leader_session";

async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let leadersData = [];
let activeDepartment = 'All';
let currentUser = null; // { username, name }

let ysaData = [];
let ysaLoaded = false;
let ysaFilters = { ward: 'All', gender: 'All', age: 'All', status: 'All' };

// Auto-logout after this many minutes of no clicks/keystrokes/scrolling.
const AUTO_LOGOUT_MINUTES = 20;
let autoLogoutTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
    document.getElementById('ysa-search-input').addEventListener('input', handleYsaFilter);
    document.getElementById('ysa-ward-select').addEventListener('change', e => { ysaFilters.ward = e.target.value; handleYsaFilter(); });
    document.getElementById('ysa-gender-select').addEventListener('change', e => { ysaFilters.gender = e.target.value; handleYsaFilter(); });
    document.getElementById('ysa-age-select').addEventListener('change', e => { ysaFilters.age = e.target.value; handleYsaFilter(); });
    document.getElementById('ysa-status-select').addEventListener('change', e => { ysaFilters.status = e.target.value; handleYsaFilter(); });

    ['click', 'keydown', 'scroll', 'mousemove'].forEach(evt => {
        document.addEventListener(evt, resetAutoLogoutTimer, { passive: true });
    });
});

function resetAutoLogoutTimer() {
    if (!currentUser) return;
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = setTimeout(() => {
        handleLogout();
        const errorBox = document.getElementById('login-error');
        errorBox.textContent = "You were signed out after " + AUTO_LOGOUT_MINUTES + " minutes of inactivity.";
        errorBox.classList.remove('hidden');
    }, AUTO_LOGOUT_MINUTES * 60 * 1000);
}

/* ---------------- AUTH ---------------- */

function initAuth() {
    const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            const match = LEADER_CREDENTIALS.find(c => c.username === session.username && c.passwordHash === session.passwordHash);
            if (session && match) {
                enterApp(match.name, match.username);
                return;
            }
        } catch (e) { /* fall through to login */ }
    }
    document.getElementById('login-name').focus();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-name').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value;
    const remember = document.getElementById('remember-me').checked;
    const errorBox = document.getElementById('login-error');
    const card = document.querySelector('.login-card');

    const passwordHash = await sha256Hex(pass);
    const match = LEADER_CREDENTIALS.find(c => c.username.toLowerCase() === username && c.passwordHash === passwordHash);

    if (!match) {
        errorBox.textContent = "That username or password isn't recognized. Please check with the stake office and try again.";
        errorBox.classList.remove('hidden');
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
        return;
    }

    errorBox.classList.add('hidden');
    const session = JSON.stringify({ username: match.username, passwordHash, ts: Date.now() });
    if (remember) {
        localStorage.setItem(SESSION_KEY, session);
    } else {
        sessionStorage.setItem(SESSION_KEY, session);
    }

    logLogin(match.username, match.name);
    document.getElementById('login-screen').classList.add('unlocking');
    setTimeout(() => enterApp(match.name, match.username), 280);
}

// Fire-and-forget — doesn't block login if it fails or is slow.
function logLogin(username, displayName) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) return;
    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'loginLog', username, displayName })
    }).catch(() => {}); // audit logging failing silently is fine — never block login on it
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    currentUser = null;
    clearTimeout(autoLogoutTimer);
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-screen').classList.remove('unlocking');
    document.getElementById('login-pass').value = '';
    document.getElementById('login-name').focus();
}

function enterApp(name, username) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    const first = (name || '').split(' ')[0];
    document.getElementById('welcome-line').textContent = first ? `Signed in as ${first}` : 'Signed in';
    currentUser = { username: username || '', name: name || '' };
    resetAutoLogoutTimer();
    if (leadersData.length === 0) loadLeadersDirectory();
}

/* ---------------- TOP-LEVEL DIRECTORY TABS ---------------- */

// Set this to the live URL of your profile-builder.html page once
// it's deployed, so the QR code / share link in the YSA tab works.
const YSA_FORM_URL = 'PASTE_YOUR_PROFILE_BUILDER_URL_HERE';

function initShareWidget() {
    const linkInput = document.getElementById('share-form-link');
    const qrImg = document.getElementById('share-qr-img');
    if (!YSA_FORM_URL || YSA_FORM_URL.indexOf('PASTE_YOUR') === 0) {
        linkInput.value = 'Set YSA_FORM_URL in app.js to enable this';
        return;
    }
    linkInput.value = YSA_FORM_URL;
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(YSA_FORM_URL);
}

function copyShareLink() {
    const linkInput = document.getElementById('share-form-link');
    if (!YSA_FORM_URL || YSA_FORM_URL.indexOf('PASTE_YOUR') === 0) return;
    navigator.clipboard.writeText(linkInput.value).then(() => {
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
    });
}

function selectDirectory(directory) {
    document.querySelectorAll('#directory-tabs .committee-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.directory === directory);
    });
    document.getElementById('leaders-panel').classList.toggle('hidden', directory !== 'leaders');
    document.getElementById('ysa-panel').classList.toggle('hidden', directory !== 'ysa');

    if (directory === 'ysa' && !ysaLoaded) loadYsaDirectory();
    if (directory === 'ysa') initShareWidget();
}

/* ============================================================
   LEADERS DIRECTORY — committee members
   Fields shown: Name, Local Unit (ward), Current Assignment (role)
   ============================================================ */

function loadLeadersDirectory() {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
        // Fallback to the static file if the backend isn't configured yet.
        fetch('leaders.json?_=' + Date.now(), { cache: 'no-store' })
            .then(response => response.json())
            .then(data => { leadersData = data; handleSearchAndFilter(); })
            .catch(error => console.error('Leaders data loading failure:', error));
        return;
    }
    // cache: 'no-store' + a timestamp param stop the browser from silently
    // reusing a stale cached response for this GET request (this was why a
    // freshly-added leader wouldn't show up until a hard refresh).
    fetch(APPS_SCRIPT_URL + '?type=leaders&_=' + Date.now(), { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            leadersData = data;
            handleSearchAndFilter();
        })
        .catch(error => {
            console.error('Leaders data loading failure:', error);
            document.getElementById('result-count').textContent = 'Could not load live leader data — check the Apps Script deployment.';
        });
}

const DEPT_STYLE = {
    Leadership:  { seal: 'bg-[#AD8329]', badge: 'bg-[#AD8329]/15 text-[#8a6a1f]' },
    Ministering: { seal: 'bg-[#B7552F]', badge: 'bg-[#B7552F]/15 text-[#a1461f]' },
    Spiritual:   { seal: 'bg-[#1F4B46]', badge: 'bg-[#1F4B46]/15 text-[#1F4B46]' },
};

function initials(name) {
    return name.replace(/^(Sister|Elder|Brother|Bishop)\s+/i, '')
        .split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function renderDirectory(leaders) {
    const grid = document.getElementById('directory-grid');
    const noResults = document.getElementById('no-results');
    const countEl = document.getElementById('result-count');
    grid.innerHTML = '';

    countEl.textContent = `${leaders.length} leader${leaders.length === 1 ? '' : 's'} shown`;

    if (leaders.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    leaders.forEach(leader => {
        const card = document.createElement('div');

        if (leader.isVacant) {
            card.className = 'leader-card rounded-xl overflow-hidden flex flex-col justify-between border-dashed';
            card.innerHTML = `
                <div class="p-5 flex flex-col items-center text-center py-8">
                    <div class="w-14 h-14 rounded-full border-2 border-dashed border-[color:var(--line)] flex items-center justify-center text-[color:var(--ink-soft)] mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/></svg>
                    </div>
                    <h3 class="font-serif-theme text-base font-semibold text-[color:var(--ink-soft)]">${leader.role || 'Vacant Assignment'}</h3>
                    <p class="text-xs text-[color:var(--ink-soft)] mt-1">${leader.ward ? leader.ward + ' · ' : ''}Position currently open</p>
                </div>
                ${currentUser ? `
                <div class="bg-[color:var(--line)]/40 px-5 py-2.5 border-t border-[color:var(--line)] flex items-center justify-center gap-4 text-xs font-semibold">
                    <button onclick="openLeaderEditor('${leader.id}')" class="text-[#1F4B46] hover:text-[color:var(--ink)] cursor-pointer">Fill Position</button>
                    <button onclick="deleteLeader('${leader.id}')" class="text-[color:var(--ink-soft)] hover:text-[#B7552F] cursor-pointer">Remove</button>
                </div>` : ''}
            `;
            grid.appendChild(card);
            return;
        }

        const style = DEPT_STYLE[leader.department] || { seal: 'bg-[#59543F]', badge: 'bg-[#59543F]/15 text-[#59543F]' };
        const unit = leader.ward || 'Unit not set';
        const tenureLabel = leader.servingSince ? formatUpdatedDate(leader.servingSince) : '';

        card.className = 'leader-card rounded-xl overflow-hidden flex flex-col justify-between';
        card.innerHTML = `
            <div class="p-5">
                <div class="flex items-center space-x-4">
                    <div class="relative flex-shrink-0">
                        <img class="avatar-ring h-14 w-14 rounded-full object-cover" src="${leader.image}" alt="${leader.name}"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display:none" class="avatar-ring h-14 w-14 rounded-full items-center justify-center font-serif-theme text-sm font-semibold text-white ${style.seal}">${initials(leader.name)}</div>
                        <div class="dept-seal ${style.seal} absolute -bottom-1 -right-1">${(leader.department || '?')[0]}</div>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-serif-theme text-base font-semibold leading-tight truncate">${leader.name}</h3>
                        <p class="text-xs font-medium text-[color:var(--ink-soft)] mt-0.5">${leader.role}</p>
                        <span class="inline-block mt-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm ${style.badge}">
                            ${leader.department}
                        </span>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-[color:var(--line)] grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                        <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Local Unit</div>
                        <div class="text-[color:var(--ink)] mt-0.5">${unit}</div>
                    </div>
                    <div>
                        <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Assignment</div>
                        <div class="text-[color:var(--ink)] mt-0.5">${leader.role}</div>
                    </div>
                </div>
                ${tenureLabel ? `<div class="mt-2 text-[10px] text-[color:var(--ink-soft)]">Serving since ${tenureLabel}</div>` : ''}
            </div>
            <div class="bg-[color:var(--line)]/40 px-5 py-2.5 border-t border-[color:var(--line)] flex items-center justify-between text-xs font-semibold">
                <a href="${leader.linkedin}" target="_blank" rel="noopener" class="text-[#1F4B46] hover:text-[color:var(--ink)] transition-colors flex items-center gap-1">
                    LinkedIn
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17 17 7M8 7h9v9"/></svg>
                </a>
                <div class="flex items-center gap-3">
                    <a href="mailto:${leader.email}" class="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] transition-colors">
                        Contact
                    </a>
                    ${currentUser ? `
                    <button onclick="openLeaderEditor('${leader.id}')" class="text-[color:var(--ink-soft)] hover:text-[#1F4B46] cursor-pointer">Edit</button>
                    <button onclick="deleteLeader('${leader.id}')" class="text-[color:var(--ink-soft)] hover:text-[#B7552F] cursor-pointer">Delete</button>` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ---------------- LEADER EDITOR (add / edit / delete) ---------------- */

function openLeaderEditor(id) {
    const modal = document.getElementById('leader-modal');
    const title = document.getElementById('leader-modal-title');
    const leader = id ? leadersData.find(l => String(l.id) === String(id)) : null;

    document.getElementById('lf-id').value = leader ? leader.id : '';
    document.getElementById('lf-name').value = leader && !leader.isVacant ? leader.name : '';
    document.getElementById('lf-role').value = leader ? leader.role : '';
    document.getElementById('lf-department').value = leader ? leader.department : 'Leadership';
    document.getElementById('lf-ward').value = leader ? leader.ward : '';
    document.getElementById('lf-servingSince').value = leader && leader.servingSince ? leader.servingSince.slice(0, 10) : '';
    document.getElementById('lf-bio').value = leader ? leader.bio : '';
    document.getElementById('lf-image').value = leader ? leader.image : '';
    document.getElementById('lf-linkedin').value = leader ? leader.linkedin : '';
    document.getElementById('lf-email').value = leader ? leader.email : '';
    document.getElementById('lf-isVacant').checked = leader ? !!leader.isVacant : false;

    title.textContent = leader ? (leader.isVacant ? 'Fill Vacant Position' : 'Edit Leader') : 'Add Leader';
    modal.classList.remove('hidden');
}

function closeLeaderEditor() {
    document.getElementById('leader-modal').classList.add('hidden');
}

function saveLeader() {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
        alert('APPS_SCRIPT_URL is not set in app.js yet, so leader changes cannot be saved.');
        return;
    }
    const id = document.getElementById('lf-id').value;
    const leader = {
        id: id || undefined,
        name: document.getElementById('lf-name').value.trim(),
        role: document.getElementById('lf-role').value.trim(),
        department: document.getElementById('lf-department').value,
        ward: document.getElementById('lf-ward').value.trim(),
        servingSince: document.getElementById('lf-servingSince').value,
        bio: document.getElementById('lf-bio').value.trim(),
        image: document.getElementById('lf-image').value.trim(),
        linkedin: document.getElementById('lf-linkedin').value.trim(),
        email: document.getElementById('lf-email').value.trim(),
        isVacant: document.getElementById('lf-isVacant').checked
    };

    const submitBtn = document.querySelector('#leader-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'leader', action: id ? 'edit' : 'add', leader })
    })
        .then(r => r.json())
        .then(result => {
            if (result.status !== 'success') throw new Error(result.message || 'Save failed');
            closeLeaderEditor();
            loadLeadersDirectory();
        })
        .catch(err => alert('Could not save: ' + err.message))
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save';
        });
}

function deleteLeader(id) {
    if (!confirm('Remove this entry from the Leaders Directory?')) return;
    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'leader', action: 'delete', leader: { id } })
    })
        .then(r => r.json())
        .then(result => {
            if (result.status !== 'success') throw new Error(result.message || 'Delete failed');
            loadLeadersDirectory();
        })
        .catch(err => alert('Could not delete: ' + err.message));
}

function filterDepartment(dept) {
    activeDepartment = dept;
    document.querySelectorAll('.dept-btn').forEach(btn => {
        const isActive = btn.textContent.trim() === (dept === 'All' ? 'All Roles' : dept);
        btn.className = isActive
            ? "dept-btn active nav-pill px-4 py-2 text-xs font-semibold rounded-md bg-[#1F4B46] text-white cursor-pointer"
            : "dept-btn nav-pill px-4 py-2 text-xs font-semibold rounded-md text-[color:var(--ink)] bg-[color:var(--cream)] hover:bg-white cursor-pointer";
    });
    handleSearchAndFilter();
}

function handleSearchAndFilter() {
    const searchTarget = document.getElementById('search-input').value.toLowerCase();
    const filtered = leadersData.filter(leader => {
        const matchesDepartment = (activeDepartment === 'All' || leader.department === activeDepartment);
        const matchesSearch =
            leader.name.toLowerCase().includes(searchTarget) ||
            leader.role.toLowerCase().includes(searchTarget) ||
            (leader.ward || '').toLowerCase().includes(searchTarget);
        return matchesDepartment && matchesSearch;
    });
    renderDirectory(filtered);
}

/* ---------------- CSV EXPORT (leaders) ---------------- */

function exportLeadersCsv() {
    const rows = [['Name', 'Role', 'Department', 'Ward', 'Email', 'Serving Since']];
    leadersData.filter(l => !l.isVacant).forEach(l => {
        rows.push([l.name, l.role, l.department, l.ward, l.email, l.servingSince]);
    });
    downloadCsv(rows, 'leaders-directory.csv');
}

function downloadCsv(rows, filename) {
    const csv = rows.map(row =>
        row.map(cell => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ---------------- LOGIN ACTIVITY LOG ---------------- */

let loginLogLoaded = false;

function toggleLoginLog() {
    const panel = document.getElementById('login-log-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && !loginLogLoaded) loadLoginLog();
}

function loadLoginLog() {
    const list = document.getElementById('login-log-list');
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
        list.textContent = 'Backend not configured.';
        return;
    }
    fetch(APPS_SCRIPT_URL + '?type=loginLog&_=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            loginLogLoaded = true;
            if (data.length === 0) {
                list.textContent = 'No login activity recorded yet.';
                return;
            }
            list.innerHTML = data.map(entry => {
                const d = new Date(entry.timestamp);
                const when = isNaN(d) ? entry.timestamp : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
                return `<div class="flex justify-between border-b border-[color:var(--line)] py-1"><span>${entry.displayName || entry.username}</span><span class="text-[color:var(--ink-soft)]">${when}</span></div>`;
            }).join('');
        })
        .catch(() => { list.textContent = 'Could not load login activity.'; });
}

/* ============================================================
   YSA DIRECTORY — everyone who filled out the profiling form
   Filters: Ward, Gender, Age Range, Temporal Status
   ------------------------------------------------------------
   LIVE DATA SOURCE: this fetches directly from the Apps Script
   Web App URL below, which reads the "YSA Profiles" Google Sheet
   that the profile builder form writes to on every submission.
   Paste your deployed Apps Script /exec URL here (same one used
   as APPS_SCRIPT_URL in profile-builder.html).

   To change the Temporal Status options, edit the list below.
   ============================================================ */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx8tt3E31EmzOUR7NU0X16uGhZPyZP1YXn8EZpoBomV_fJfRmX1ZWcJSj67VAXnb98u4Q/exec';

const YSA_TEMPORAL_STATUS_OPTIONS = ["Student", "Employed", "Self-Employed", "Other"];

function loadYsaDirectory() {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
        document.getElementById('ysa-result-count').textContent =
            'APPS_SCRIPT_URL is not set yet — add your Apps Script URL in app.js.';
        return;
    }
    fetch(APPS_SCRIPT_URL + '?_=' + Date.now(), { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
            ysaData = data;
            ysaLoaded = true;
            populateYsaFilterOptions(ysaData);
            handleYsaFilter();
            renderYsaStats(ysaData);
            renderUpcomingBirthdays(ysaData);
        })
        .catch(error => {
            console.error('YSA data loading failure:', error);
            document.getElementById('ysa-result-count').textContent = 'Could not load live YSA data — check the Apps Script deployment and URL.';
        });
}

function populateYsaFilterOptions(list) {
    const wardSelect = document.getElementById('ysa-ward-select');
    const genderSelect = document.getElementById('ysa-gender-select');
    const statusSelect = document.getElementById('ysa-status-select');

    const wards = [...new Set(list.map(p => p.ward).filter(Boolean))].sort();
    wardSelect.innerHTML = '<option value="All">All Wards</option>' +
        wards.map(w => `<option value="${w}">${w}</option>`).join('');

    const genders = [...new Set(list.map(p => p.gender).filter(Boolean))].sort();
    genderSelect.innerHTML = '<option value="All">All Genders</option>' +
        genders.map(g => `<option value="${g}">${g}</option>`).join('');

    statusSelect.innerHTML = '<option value="All">All Statuses</option>' +
        YSA_TEMPORAL_STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('');
}

function ageInBucket(age, bucket) {
    if (bucket === 'All' || age == null) return bucket === 'All';
    if (bucket === '31+') return age >= 31;
    const [min, max] = bucket.split('-').map(Number);
    return age >= min && age <= max;
}

function handleYsaFilter() {
    const searchTarget = document.getElementById('ysa-search-input').value.toLowerCase();
    const filtered = ysaData.filter(p => {
        const matchesSearch = (p.name || '').toLowerCase().includes(searchTarget);
        const matchesWard = ysaFilters.ward === 'All' || p.ward === ysaFilters.ward;
        const matchesGender = ysaFilters.gender === 'All' || p.gender === ysaFilters.gender;
        const matchesAge = ysaFilters.age === 'All' || ageInBucket(p.age, ysaFilters.age);
        const matchesStatus = ysaFilters.status === 'All' || p.temporalStatus === ysaFilters.status;
        return matchesSearch && matchesWard && matchesGender && matchesAge && matchesStatus;
    });
    renderYsaDirectory(filtered);
}

function renderYsaDirectory(list) {
    const grid = document.getElementById('ysa-grid');
    const noResults = document.getElementById('ysa-no-results');
    const countEl = document.getElementById('ysa-result-count');
    grid.innerHTML = '';

    countEl.textContent = `${list.length} profile${list.length === 1 ? '' : 's'} shown`;

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    list.forEach(p => {
        const genderSeal = (p.gender === 'Sister' || p.gender === 'Female') ? 'bg-[#B7552F]' : 'bg-[#1F4B46]';
        const updatedLabel = formatUpdatedDate(p.updatedAt);
        const isNew = p.updatedAt && (Date.now() - new Date(p.updatedAt).getTime()) < 30 * 24 * 60 * 60 * 1000;

        const card = document.createElement('div');
        card.className = 'leader-card rounded-xl overflow-hidden p-5 relative';
        card.innerHTML = `
            ${isNew ? `<span class="absolute top-3 right-3 text-[8px] font-bold uppercase tracking-wide bg-[#AD8329] text-white px-1.5 py-0.5 rounded-sm">New</span>` : ''}
            <div class="flex items-center space-x-4 mb-3">
                ${p.photoUrl ? `
                <img class="avatar-ring h-12 w-12 rounded-full object-cover flex-shrink-0" src="${p.photoUrl}" alt="${p.name || 'Photo'}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div style="display:none" class="avatar-ring h-12 w-12 rounded-full items-center justify-center font-serif-theme text-sm font-semibold text-white ${genderSeal} flex-shrink-0">
                    ${initials(p.name || '?')}
                </div>` : `
                <div class="avatar-ring h-12 w-12 rounded-full flex items-center justify-center font-serif-theme text-sm font-semibold text-white ${genderSeal} flex-shrink-0">
                    ${initials(p.name || '?')}
                </div>`}
                <div class="min-w-0">
                    <h3 class="font-serif-theme text-base font-semibold leading-tight truncate">${p.name || 'Unnamed'}</h3>
                    <p class="text-xs font-medium text-[color:var(--ink-soft)] mt-0.5">${p.ward || 'Unit not set'}</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-[11px] pt-3 border-t border-[color:var(--line)]">
                <div>
                    <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Gender</div>
                    <div class="text-[color:var(--ink)] mt-0.5">${p.gender || '—'}</div>
                </div>
                <div>
                    <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Age</div>
                    <div class="text-[color:var(--ink)] mt-0.5">${p.age ?? '—'}</div>
                </div>
                <div>
                    <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Status</div>
                    <div class="text-[color:var(--ink)] mt-0.5">${p.temporalStatus || '—'}</div>
                </div>
            </div>
            ${p.contact ? `
            <div class="mt-3 pt-3 border-t border-[color:var(--line)]">
                <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">Contact</div>
                <div class="text-[color:var(--ink)] text-[11px] mt-0.5 break-words">${p.contact}</div>
            </div>` : ''}
            ${p.bio ? `
            <div class="mt-3 pt-3 border-t border-[color:var(--line)]">
                <div class="text-[color:var(--ink-soft)] font-semibold uppercase tracking-wide text-[9px]">About Me</div>
                <p class="text-[color:var(--ink)] text-[11px] mt-0.5 leading-relaxed line-clamp-3">${p.bio}</p>
            </div>` : ''}
            ${p.pdfUrl ? `
            <a href="${p.pdfUrl}" target="_blank" rel="noopener" class="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#1F4B46] hover:text-[color:var(--ink)] border-t border-[color:var(--line)] pt-3 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                View PDF Profile
            </a>` : ''}
            ${updatedLabel ? `<div class="mt-2 text-center text-[9px] text-[color:var(--ink-soft)]">Updated ${updatedLabel}</div>` : ''}
        `;
        grid.appendChild(card);
    });
}

function formatUpdatedDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ---------------- YSA STATS DASHBOARD ---------------- */

function toggleYsaStats() {
    document.getElementById('ysa-stats-panel').classList.toggle('hidden');
}

function renderYsaStats(list) {
    const body = document.getElementById('ysa-stats-body');
    if (!list.length) { body.innerHTML = '<p class="text-[color:var(--ink-soft)]">No profiles yet.</p>'; return; }

    const byWard = {}, byGender = {}, byStatus = {};
    list.forEach(p => {
        byWard[p.ward || 'Unassigned'] = (byWard[p.ward || 'Unassigned'] || 0) + 1;
        byGender[p.gender || 'Unspecified'] = (byGender[p.gender || 'Unspecified'] || 0) + 1;
        byStatus[p.temporalStatus || 'Unspecified'] = (byStatus[p.temporalStatus || 'Unspecified'] || 0) + 1;
    });

    function barGroup(title, counts) {
        const max = Math.max(...Object.values(counts));
        const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => `
            <div class="flex items-center gap-2">
                <div class="w-24 truncate text-[color:var(--ink-soft)]">${label}</div>
                <div class="flex-1 bg-[color:var(--line)] rounded h-3 overflow-hidden">
                    <div class="bg-[#1F4B46] h-full" style="width:${(count / max * 100)}%"></div>
                </div>
                <div class="w-6 text-right font-semibold">${count}</div>
            </div>
        `).join('');
        return `<div><div class="font-semibold uppercase text-[9px] tracking-wide text-[color:var(--ink-soft)] mb-1.5">${title}</div><div class="space-y-1">${rows}</div></div>`;
    }

    body.innerHTML =
        `<div class="text-2xl font-serif-theme font-semibold">${list.length} <span class="text-xs font-sans-theme font-medium text-[color:var(--ink-soft)]">total profiles</span></div>` +
        barGroup('By Ward', byWard) +
        barGroup('By Gender', byGender) +
        barGroup('By Status', byStatus);
}

/* ---------------- UPCOMING BIRTHDAYS ---------------- */

function renderUpcomingBirthdays(list) {
    const body = document.getElementById('ysa-birthdays-body');
    const today = new Date();
    const upcoming = list
        .filter(p => p.birthdate)
        .map(p => {
            const bd = new Date(p.birthdate + 'T00:00');
            if (isNaN(bd)) return null;
            let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
            if (next < today) next = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
            const daysAway = Math.round((next - today) / (1000 * 60 * 60 * 24));
            return { name: p.name, daysAway, dateLabel: bd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
        })
        .filter(x => x && x.daysAway <= 30)
        .sort((a, b) => a.daysAway - b.daysAway);

    if (!upcoming.length) { body.innerHTML = '<p class="text-[color:var(--ink-soft)]">None in the next 30 days.</p>'; return; }

    body.innerHTML = upcoming.map(u => `
        <div class="flex justify-between border-b border-[color:var(--line)] py-1">
            <span>${u.name}</span>
            <span class="text-[color:var(--ink-soft)]">${u.dateLabel}${u.daysAway === 0 ? ' · Today!' : ''}</span>
        </div>
    `).join('');
}

/* ---------------- CSV EXPORT (YSA) ---------------- */

function exportYsaCsv() {
    const rows = [['Name', 'Ward', 'Gender', 'Age', 'Status', 'Contact', 'Email']];
    ysaData.forEach(p => {
        rows.push([p.name, p.ward, p.gender, p.age, p.temporalStatus, p.contact, p.email]);
    });
    downloadCsv(rows, 'ysa-directory.csv');
}
