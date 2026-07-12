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

let ysaData = [];
let ysaLoaded = false;
let ysaFilters = { ward: 'All', gender: 'All', age: 'All', status: 'All' };

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
});

/* ---------------- AUTH ---------------- */

function initAuth() {
    const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            const match = LEADER_CREDENTIALS.find(c => c.username === session.username && c.passwordHash === session.passwordHash);
            if (session && match) {
                enterApp(match.name);
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

    document.getElementById('login-screen').classList.add('unlocking');
    setTimeout(() => enterApp(match.name), 280);
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-screen').classList.remove('unlocking');
    document.getElementById('login-pass').value = '';
    document.getElementById('login-name').focus();
}

function enterApp(name) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    const first = (name || '').split(' ')[0];
    document.getElementById('welcome-line').textContent = first ? `Signed in as ${first}` : 'Signed in';
    if (leadersData.length === 0) loadLeadersDirectory();
}

/* ---------------- TOP-LEVEL DIRECTORY TABS ---------------- */

function selectDirectory(directory) {
    document.querySelectorAll('#directory-tabs .committee-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.directory === directory);
    });
    document.getElementById('leaders-panel').classList.toggle('hidden', directory !== 'leaders');
    document.getElementById('ysa-panel').classList.toggle('hidden', directory !== 'ysa');

    if (directory === 'ysa' && !ysaLoaded) loadYsaDirectory();
}

/* ============================================================
   LEADERS DIRECTORY — committee members
   Fields shown: Name, Local Unit (ward), Current Assignment (role)
   ============================================================ */

function loadLeadersDirectory() {
    fetch('leaders.json')
        .then(response => response.json())
        .then(data => {
            leadersData = data;
            handleSearchAndFilter();
        })
        .catch(error => console.error('Leaders data loading failure:', error));
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
        const style = DEPT_STYLE[leader.department] || { seal: 'bg-[#59543F]', badge: 'bg-[#59543F]/15 text-[#59543F]' };
        const unit = leader.ward || 'Unit not set';

        const card = document.createElement('div');
        card.className = 'leader-card rounded-xl overflow-hidden flex flex-col justify-between';
        card.innerHTML = `
            <div class="p-5">
                <div class="flex items-center space-x-4">
                    <div class="relative flex-shrink-0">
                        <img class="avatar-ring h-14 w-14 rounded-full object-cover" src="${leader.image}" alt="${leader.name}"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display:none" class="avatar-ring h-14 w-14 rounded-full items-center justify-center font-serif-theme text-sm font-semibold text-white ${style.seal}">${initials(leader.name)}</div>
                        <div class="dept-seal ${style.seal} absolute -bottom-1 -right-1">${leader.department[0]}</div>
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
            </div>
            <div class="bg-[color:var(--line)]/40 px-5 py-2.5 border-t border-[color:var(--line)] flex items-center justify-between text-xs font-semibold">
                <a href="${leader.linkedin}" target="_blank" rel="noopener" class="text-[#1F4B46] hover:text-[color:var(--ink)] transition-colors flex items-center gap-1">
                    LinkedIn
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17 17 7M8 7h9v9"/></svg>
                </a>
                <a href="mailto:${leader.email}" class="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] transition-colors">
                    Contact
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
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

const YSA_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbz6904pt0B1_sBjyXL_eJM8YQc5NBaA266lgDL9Ah6Go0rZmCEtXL5DaoixPzCWack2Bg/exec';

const YSA_TEMPORAL_STATUS_OPTIONS = ["Student", "Employed", "Self-Employed", "Other"];

function loadYsaDirectory() {
    if (!YSA_SHEET_API_URL || YSA_SHEET_API_URL.indexOf('PASTE_YOUR') === 0) {
        document.getElementById('ysa-result-count').textContent =
            'YSA_SHEET_API_URL is not set yet — add your Apps Script URL in app.js.';
        return;
    }
    fetch(YSA_SHEET_API_URL)
        .then(response => response.json())
        .then(data => {
            ysaData = data;
            ysaLoaded = true;
            populateYsaFilterOptions(ysaData);
            handleYsaFilter();
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

        const card = document.createElement('div');
        card.className = 'leader-card rounded-xl overflow-hidden p-5';
        card.innerHTML = `
            <div class="flex items-center space-x-4 mb-3">
                <div class="avatar-ring h-12 w-12 rounded-full flex items-center justify-center font-serif-theme text-sm font-semibold text-white ${genderSeal} flex-shrink-0">
                    ${initials(p.name || '?')}
                </div>
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
        `;
        grid.appendChild(card);
    });
}
