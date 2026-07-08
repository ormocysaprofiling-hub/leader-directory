const ACCESS_CODE = "ServeOrmoc26";
const SESSION_KEY = "gic_leader_session";

let leadersData = [];

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
});

/* ---------------- AUTHENTICATION MATRIX ---------------- */
function initAuth() {
    const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session && session.code === ACCESS_CODE) {
                executeGateUnlock();
                return;
            }
        } catch (e) { localStorage.removeItem(SESSION_KEY); }
    }
    document.getElementById('auth-gate').classList.remove('hidden');
}

function handleLogin(e) {
    e.preventDefault();
    const input = document.getElementById('passkey-input').value;
    if (input === ACCESS_CODE) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ code: ACCESS_CODE, time: Date.now() }));
        document.getElementById('login-error').classList.add('hidden');
        executeGateUnlock();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
}

function executeGateUnlock() {
    document.getElementById('auth-gate').classList.add('hidden');
    // Fetch data registry package once access is cleared
    fetch('leaders.json')
        .then(res => res.json())
        .then(data => {
            leadersData = data;
            renderFeaturedCommittees();
            handleSearchAndFilter(); // Population pass for all profiles grid
        })
        .catch(err => console.error("Database sync intercept issue:", err));
}

/* ---------------- RENDER ENGINES ---------------- */

// 1. Core Top Panel Render (Only filters Leadership and Technology)
function renderFeaturedCommittees() {
    const commGrid = document.getElementById('committee-grid');
    commGrid.innerHTML = '';
    
    const featured = leadersData.filter(member => 
        member.department === 'Leadership' || member.department === 'Technology'
    );

    featured.forEach(member => {
        const card = document.createElement('div');
        card.className = "bg-[color:var(--cream-deep)] p-5 rounded-xl border border-[color:var(--line)] flex items-center space-x-4 shadow-2xs transition-all hover:scale-[1.01]";
        
        let badgeColor = member.department === 'Leadership' ? 'bg-[color:var(--gold)] text-white' : 'bg-[color:var(--teal)] text-white';

        card.innerHTML = `
            <img class="h-14 w-14 rounded-full object-cover border border-[color:var(--line)] shadow-xs" src="${member.image}" alt="${member.name}">
            <div>
                <span class="px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-xs ${badgeColor}">${member.department}</span>
                <h3 class="font-serif-theme text-base font-semibold text-[color:var(--ink)] mt-1">${member.name}</h3>
                <p class="text-xs text-[color:var(--teal-soft)] font-medium">${member.role} • <span class="italic text-[color:var(--ink-soft)]">${member.ward || 'Stake'} Ward</span></p>
            </div>
        `;
        commGrid.appendChild(card);
    });
}

// 2. Comprehensive Directory Grid Processing Loop with Staggered Cascades
function renderYSADirectoryGrid(list) {
    const grid = document.getElementById('ysa-profiles-grid');
    const noResults = document.getElementById('no-results');
    grid.innerHTML = '';

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    list.forEach((ysa, index) => {
        const card = document.createElement('div');
        card.className = "directory-card-animated bg-[color:var(--cream-deep)]/60 backdrop-blur-xs rounded-xl border border-[color:var(--line)] overflow-hidden flex flex-col justify-between hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300";
        card.style.animationDelay = `${index * 50}ms`;

        card.innerHTML = `
            <div class="p-5">
                <div class="flex items-center space-x-3">
                    <img class="h-11 w-11 rounded-full object-cover border border-[color:var(--line)] shadow-2xs" src="${ysa.image}" alt="${ysa.name}">
                    <div>
                        <h4 class="text-sm font-bold text-[color:var(--ink)]">${ysa.name}</h4>
                        <p class="text-[11px] text-[color:var(--ink-soft)] font-medium">${ysa.ward || 'Ormoc'} Ward</p>
                    </div>
                </div>
                <p class="mt-3 text-xs text-[color:var(--ink-soft)] leading-relaxed line-clamp-3">${ysa.bio}</p>
            </div>
            <div class="bg-[color:var(--line)]/40 px-5 py-2.5 border-t border-[color:var(--line)] flex items-center justify-between text-[11px] font-semibold">
                <span class="text-[color:var(--ink-soft)] font-normal">Role: <span class="text-[color:var(--ink)] font-semibold">${ysa.role}</span></span>
                <a href="mailto:${ysa.email}" class="text-[color:var(--teal)] hover:underline">Contact ✉</a>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ---------------- ACTIONS & EVENT MATRIX ---------------- */
function handleSearchAndFilter() {
    const searchTarget = document.getElementById('search-input').value.toLowerCase();
    const targetWard = document.getElementById('filter-ward').value;

    const filtered = leadersData.filter(member => {
        const matchesWard = (targetWard === 'All' || member.ward === targetWard);
        const matchesSearch =
            member.name.toLowerCase().includes(searchTarget) ||
            member.role.toLowerCase().includes(searchTarget) ||
            member.bio.toLowerCase().includes(searchTarget);

        return matchesWard && matchesSearch;
    });

    renderYSADirectoryGrid(filtered);
}
