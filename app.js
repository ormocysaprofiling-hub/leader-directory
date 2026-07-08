const ACCESS_CODE = "ServeOrmoc26";
const SESSION_KEY = "gic_leader_session";

let leadersData = [];

// ============================================================
// EDITABLE FILTER SCHEMA MATRIX CONFIGURATION
// Add, edit, or adjust fields here to update filter options.
// ============================================================
const FILTER_SCHEMA = [
    {
        id: "filter-ward",
        label: "Wards",
        field: "ward",
        options: ["All", "Ormoc 1st", "Ormoc 2nd", "Ormoc 3rd", "Albuera", "Kananga"]
    },
    {
        id: "filter-gender",
        label: "Priesthood/Society",
        field: "gender",
        options: ["All", "Brother", "Sister"]
    },
    {
        id: "filter-rm",
        label: "Missionary Status",
        field: "isRM",
        options: ["All", "Returned Missionary", "Non-RM"],
        transform: (val) => val === "Returned Missionary" ? true : false
    },
    {
        id: "filter-endowed",
        label: "Endowment Status",
        field: "isEndowed",
        options: ["All", "Endowed", "Not Endowed"],
        transform: (val) => val === "Endowed" ? true : false
    },
    {
        id: "filter-recommend",
        label: "Temple Recommend",
        field: "hasRecommend",
        options: ["All", "Has Recommend", "No Recommend"],
        transform: (val) => val === "Has Recommend" ? true : false
    }
];

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
    buildFilterSystemControls();
});

/* ---------------- AUTH CONTROL ---------------- */
function initAuth() {
    const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session && session.code === ACCESS_CODE) {
                enterApp(session.name);
                return;
            }
        } catch (e) {}
    }
    document.getElementById('login-name').focus();
}

function handleLogin(e) {
    e.preventDefault();
    const name = document.getElementById('login-name').value.trim();
    const pass = document.getElementById('login-pass').value;
    const remember = document.getElementById('remember-me').checked;
    const errorBox = document.getElementById('login-error');

    if (pass !== ACCESS_CODE) {
        errorBox.textContent = "That access code isn't recognized. Please try again.";
        errorBox.classList.remove('hidden');
        return;
    }

    errorBox.classList.add('hidden');
    const session = JSON.stringify({ name, code: ACCESS_CODE, ts: Date.now() });
    if (remember) localStorage.setItem(SESSION_KEY, session);
    else sessionStorage.setItem(SESSION_KEY, session);

    document.getElementById('login-screen').classList.add('unlocking');
    setTimeout(() => enterApp(name), 280);
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
}

function enterApp(name) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    const first = (name || '').split(' ')[0];
    document.getElementById('welcome-line').textContent = first ? `Signed in as ${first}` : 'Signed in';
    loadDirectory();
}

/* ---------------- INITIALIZE & INJECT EDITABLE FILTERS ---------------- */
function buildFilterSystemControls() {
    const filtersRow = document.getElementById('dynamic-filters-row');
    filtersRow.innerHTML = '';

    FILTER_SCHEMA.forEach(schema => {
        const wrapper = document.createElement('div');
        wrapper.className = "flex flex-col gap-1";
        
        let selectHtml = `<select id="${schema.id}" onchange="handleSearchAndFilter()" class="field-input w-full text-xs font-semibold px-2.5 py-2 rounded-lg text-[color:var(--ink)] bg-[color:var(--cream)]">`;
        schema.options.forEach(opt => {
            selectHtml += `<option value="${opt}">${opt === 'All' ? `${schema.label}` : opt}</option>`;
        });
        selectHtml += `</select>`;
        
        wrapper.innerHTML = selectHtml;
        filtersRow.appendChild(wrapper);
    });
}

/* ---------------- DIRECTORY REGISTRY LOGIC ---------------- */
function loadDirectory() {
    // Can point to an external GitHub Pages address if needed (e.g., https://username.github.io/repo/leaders.json)
    fetch('leaders.json')
        .then(response => response.json())
        .then(data => {
            leadersData = data;
            handleSearchAndFilter();
        })
        .catch(error => console.error('Data loading failure:', error));
}

function handleSearchAndFilter() {
    const searchTarget = document.getElementById('search-input').value.toLowerCase();

    const filtered = leadersData.filter(leader => {
        // Run checks against all options inside the active Filter Schema
        for (let schema of FILTER_SCHEMA) {
            const currentControl = document.getElementById(schema.id);
            if (!currentControl) continue;
            
            const selectedVal = currentControl.value;
            if (selectedVal === "All") continue;

            if (schema.transform) {
                const targetBoolean = schema.transform(selectedVal);
                if (leader[schema.field] !== targetBoolean) return false;
            } else {
                if (leader[schema.field] !== selectedVal) return false;
            }
        }

        // Live text field pattern verification pass
        return leader.name.toLowerCase().includes(searchTarget) || 
               leader.role.toLowerCase().includes(searchTarget) || 
               (leader.bio && leader.bio.toLowerCase().includes(searchTarget));
    });

    renderCategorizedSurnames(filtered);
}

/* ---------------- ALPHABETICAL SURNAME CATEGORY DISPLAY RENDERING ---------------- */
function renderCategorizedSurnames(list) {
    const container = document.getElementById('directory-sections-container');
    const noResults = document.getElementById('no-results');
    const countEl = document.getElementById('result-count');
    
    container.innerHTML = '';
    countEl.textContent = `${list.length} YSA Profile${list.length === 1 ? '' : 's'} found matching criteria`;

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    // Group items by the first letter of their surname
    const categories = {};
    list.forEach(leader => {
        const surname = leader.surname || "Unknown";
        const firstLetter = surname.trim().charAt(0).toUpperCase();
        if (!categories[firstLetter]) categories[firstLetter] = [];
        categories[firstLetter].push(leader);
    });

    // Sort alphabetically by category heading letter
    const sortedLetters = Object.keys(categories).sort();

    sortedLetters.forEach(letter => {
        // Sort individual names inside each category letter group by their full surname
        const groupList = categories[letter].sort((a, b) => (a.surname || "").localeCompare(b.surname || ""));

        const section = document.createElement('section');
        section.className = "space-y-4";
        section.innerHTML = `
            <div class="border-b border-[color:var(--line)] pb-1.5">
                <h2 class="font-serif-theme text-2xl font-black text-[color:var(--teal)]">${letter}</h2>
            </div>
            <div id="grid-letter-${letter}" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></div>
        `;
        container.appendChild(section);

        const gridElement = document.getElementById(`grid-letter-${letter}`);

        groupList.forEach(leader => {
            const card = document.createElement('div');
            card.className = 'leader-card rounded-xl overflow-hidden flex flex-col justify-between';
            
            // Format fallback and values for primary contact options rows
            const contactRow = leader.contact ? `⚡ ${leader.contact}` : "No phone profile listed";
            const messengerAction = leader.messenger 
                ? `<a href="${leader.messenger}" target="_blank" class="px-2.5 py-1 text-[10px] tracking-wider rounded bg-[color:var(--teal)] text-white hover:bg-[color:var(--teal-soft)] transition-colors">Messenger Link</a>`
                : `<span class="text-[10px] text-[color:var(--ink-soft)] italic">No Messenger Link</span>`;

            card.innerHTML = `
                <div class="p-5 space-y-3.5">
                    <div class="flex items-center space-x-4">
                        <img class="avatar-ring h-12 w-12 rounded-full object-cover" src="${leader.image}" alt="${leader.name}">
                        <div class="min-w-0">
                            <h3 class="font-serif-theme text-base font-semibold leading-tight truncate">${leader.name}</h3>
                            <p class="text-xs font-medium text-[color:var(--ink-soft)] mt-0.5">${leader.role} • <span class="italic">${leader.ward || 'Stake'}</span></p>
                        </div>
                    </div>
                    
                    <!-- NEW PARAMETERS CONTACT ROW -->
                    <div class="bg-[color:var(--cream)]/60 border border-[color:var(--line)] rounded-lg p-2 flex items-center justify-between text-xs font-medium">
                        <span class="truncate text-[color:var(--ink-soft)]">${contactRow}</span>
                        ${messengerAction}
                    </div>

                    <p class="text-xs text-[color:var(--ink-soft)] leading-relaxed line-clamp-3">${leader.bio}</p>
                </div>
                <div class="bg-[color:var(--line)]/40 px-5 py-2.5 border-t border-[color:var(--line)] flex items-center justify-between text-xs font-semibold">
                    <span class="text-[10px] text-[color:var(--ink-soft)] font-normal">Classification: <span class="text-[color:var(--ink)] font-bold">${leader.gender}</span></span>
                    <a href="mailto:${leader.email}" class="text-[color:var(--teal)] hover:text-[color:var(--ink)] transition-colors">Email ✉</a>
                </div>
            `;
            gridElement.appendChild(card);
        });
    });
}
