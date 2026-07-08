/* ============================================================
   ACCESS CONTROL
   ------------------------------------------------------------
   This is a CLIENT-SIDE gate only — it hides the page behind a
   shared access code, which is good enough to keep casual/public
   visitors out of an internal directory, but the code itself
   ships inside this file and can be read by anyone who opens
   dev tools. Do not rely on this alone if the leader bios/emails
   are sensitive — pair it with real auth (e.g. a backend, Netlify
   Identity, Google Workspace SSO) for anything higher-stakes.
   Change ACCESS_CODE below to set your own passphrase.
   ============================================================ */
const ACCESS_CODE = "ServeOrmoc26";
const SESSION_KEY = "gic_leader_session";

let leadersData = [];
let activeDepartment = 'All';

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
});

/* ---------------- AUTH ---------------- */

function initAuth() {
    const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session && session.code === ACCESS_CODE) {
                enterApp(session.name);
                return;
            }
        } catch (e) { /* fall through to login */ }
    }
    document.getElementById('login-name').focus();
}

function handleLogin(e) {
    e.preventDefault();
    const name = document.getElementById('login-name').value.trim();
    const pass = document.getElementById('login-pass').value;
    const remember = document.getElementById('remember-me').checked;
    const errorBox = document.getElementById('login-error');
    const card = document.querySelector('.login-card');

    if (pass !== ACCESS_CODE) {
        errorBox.textContent = "That access code isn't recognized. Please check with the stake office and try again.";
        errorBox.classList.remove('hidden');
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
        return;
    }

    errorBox.classList.add('hidden');
    const session = JSON.stringify({ name, code: ACCESS_CODE, ts: Date.now() });
    if (remember) {
        localStorage.setItem(SESSION_KEY, session);
    } else {
        sessionStorage.setItem(SESSION_KEY, session);
    }

    document.getElementById('login-screen').classList.add('unlocking');
    setTimeout(() => enterApp(name), 280);
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
    if (leadersData.length === 0) loadDirectory();
}

/* ---------------- DIRECTORY DATA ---------------- */

function loadDirectory() {
    fetch('leaders.json')
        .then(response => response.json())
        .then(data => {
            leadersData = data;
            renderDirectory(leadersData);
        })
        .catch(error => console.error('Data loading failure:', error));
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
                <p class="mt-4 text-xs text-[color:var(--ink-soft)] leading-relaxed line-clamp-3">${leader.bio}</p>
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
            leader.bio.toLowerCase().includes(searchTarget);
        return matchesDepartment && matchesSearch;
    });
    renderDirectory(filtered);
}
