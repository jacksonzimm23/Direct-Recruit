// AI Rep Page - Dynamic (connected to backend)

(async function initAiRep() {
    // ── AI Rep entitlement gate ──────────────────────────────────────────────
    // AI Rep is the only paid player surface. Resolve entitlement BEFORE anything
    // else so a free player who lands here directly (typed URL, bookmark, or the
    // "AI Search Match" notification deep link) never runs the three loaders and
    // never has gated markup in their DOM to inspect. The backend 403s regardless
    // (requireAiRep in routes/ai-rep.js is the real boundary) — this keeps the
    // page from rendering three silently-empty sections behind a lock.
    if (window.AiRepPaywall) {
        // Act on the CACHED answer first so a free player never sees this page's
        // loading skeleton flash before the lock. Awaiting /auth/me here meant the
        // "Finding your best-fit schools..." dots painted for the length of a
        // round-trip, then got torn down — which read as a loading screen on iOS.
        if (window.AiRepPaywall.cachedEntitled() === false) {
            renderLockedPage();
            window.AiRepPaywall.open();
            // Confirm in the background. If the cache was stale and they really are
            // subscribed, reload straight into the real page.
            window.AiRepPaywall.refresh()
                .then(() => { if (window.AiRepPaywall.isEntitled()) window.location.reload(); })
                .catch(() => {});
            return;
        }
        await window.AiRepPaywall.refresh();
        if (!window.AiRepPaywall.isEntitled()) {
            renderLockedPage();
            window.AiRepPaywall.open();
            return;
        }
    }

    // Strip the data sections and leave a short teaser + unlock CTA in their place.
    function renderLockedPage() {
        ['aiRepSchoolsSection', 'aiRepAppearancesSection', 'aiRepProfileSection']
            .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

        const page = document.querySelector('.ai-rep-page');
        if (!page) return;
        const panel = document.createElement('div');
        panel.className = 'ai-rep-section';
        panel.innerHTML = `
            <div class="ai-rep-card" style="text-align:center;padding:2.5rem 1.5rem;">
                <div style="width:52px;height:52px;margin:0 auto 1rem;border-radius:50%;
                            background:rgba(18,130,162,0.14);border:1px solid rgba(18,130,162,0.3);
                            display:flex;align-items:center;justify-content:center;color:#1282a2;">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
                <h2 style="color:#fff;font-size:1.25rem;font-weight:800;margin:0 0 0.5rem;">AI Rep is locked</h2>
                <p style="color:rgba(255,255,255,0.55);font-size:0.9rem;line-height:1.6;margin:0 auto 1.5rem;max-width:420px;">
                    Unlock Best-Fit Schools, Search Appearances, and Profile Optimization to see
                    which programs are looking for players like you.
                </p>
                <button class="ai-rep-show-more" id="aiRepUnlockBtn" style="display:inline-block;">See what's included</button>
            </div>`;
        page.appendChild(panel);
        const btn = document.getElementById('aiRepUnlockBtn');
        if (btn) btn.addEventListener('click', () => window.AiRepPaywall.open());
    }

    const BATCH_SIZE = 10;
    let schoolsOffset = 0;
    let schoolsCache = []; // accumulates loaded schools (for modal lookup by index)

    // DOM references
    const schoolList = document.getElementById('aiRepSchoolList');
    const schoolsLoading = document.getElementById('aiRepSchoolsLoading');
    const schoolsEmpty = document.getElementById('aiRepSchoolsEmpty');
    const schoolsEmptyBtn = document.getElementById('aiRepSchoolsEmptyBtn');
    const schoolsShowMore = document.getElementById('aiRepSchoolsShowMore');
    const profileSection = document.getElementById('aiRepProfileSection');
    const completionPct = document.getElementById('aiRepCompletionPct');
    const progressFill = document.getElementById('aiRepProgressFill');
    const recommendations = document.getElementById('aiRepRecommendations');
    const allComplete = document.getElementById('aiRepAllComplete');

    // Animate entrance for hero + static cards
    const heroEl = document.querySelector('.ai-rep-hero');
    if (heroEl) {
        heroEl.classList.add('ai-rep-animate-in');
        setTimeout(() => heroEl.classList.add('ai-rep-visible'), 80);
    }

    // ============ BEST-FIT SCHOOLS ============

    async function loadBestFitSchools(reset) {
        if (reset) {
            schoolsOffset = 0;
            schoolsCache = [];
            schoolList.innerHTML = '';
            schoolsEmpty.style.display = 'none';
            schoolsShowMore.style.display = 'none';
            schoolsLoading.style.display = 'flex';
        }

        try {
            const data = await API.aiRep.getBestFitSchools(schoolsOffset, BATCH_SIZE);
            schoolsLoading.style.display = 'none';

            const schools = data.schools || [];

            if (reset && schools.length === 0) {
                schoolsEmpty.style.display = '';
                return;
            }

            // Ensure logos are ready, then render rows.
            if (typeof ensureSchoolLogosLoaded === 'function') {
                try { await ensureSchoolLogosLoaded('../../assets'); } catch (e) { /* logos optional */ }
            }

            schools.forEach(school => {
                const idx = schoolsCache.length;
                schoolsCache.push(school);
                schoolList.insertAdjacentHTML('beforeend', renderSchoolRow(school, idx));
            });

            animateNewRows();
            schoolsShowMore.style.display = data.hasMore ? 'flex' : 'none';
        } catch (err) {
            // Subscription lapsed mid-session (cancelled, or trial ended while the
            // page was open). Swap to the locked state instead of leaving an empty
            // section that reads as "no data".
            if (err && err.status === 403) { renderLockedPage(); window.AiRepPaywall.open(); return; }
            console.error('Failed to load best-fit schools:', err);
            schoolsLoading.style.display = 'none';
            if (reset) schoolsEmpty.style.display = '';
        }
    }

    function renderSchoolRow(school, idx) {
        const logo = (typeof getSchoolLogoHTML === 'function')
            ? getSchoolLogoHTML(school.team_name, '../../assets', 36) : '';
        const div = school.college_division ? escapeHtml(school.college_division) : '';
        const badge = (typeof FitDisplay !== 'undefined')
            ? FitDisplay.badgeHTML(school.score != null ? school.score : null, {})
            : '';
        return `
        <button type="button" class="ai-rep-school-row ai-rep-animate-in" data-school-idx="${idx}">
            <span class="ai-rep-school-logo">${logo}</span>
            <span class="ai-rep-school-info">
                <span class="ai-rep-school-name">${escapeHtml(school.team_name)}</span>
                ${div ? `<span class="ai-rep-school-div">${div}</span>` : ''}
            </span>
            ${badge}
        </button>`;
    }

    function animateNewRows() {
        const rows = schoolList.querySelectorAll('.ai-rep-animate-in:not(.ai-rep-visible)');
        rows.forEach((el, i) => {
            setTimeout(() => el.classList.add('ai-rep-visible'), 60 + (i * 40));
        });
    }

    // Open the school modal (Match + Staff tabs) for a clicked row.
    function openSchoolModal(idx) {
        const school = schoolsCache[idx];
        if (!school || typeof FitInfoModal === 'undefined') return;
        FitInfoModal.open({
            mode: 'school',
            schoolName: school.team_name,
            division: school.college_division,
            score: school.score,
            matches: (school.dimensions || []).map(d => ({ label: d.label, detail: d.detail, score: d.score })),
            staff: school.staff || [],
            coachCount: school.coachCount,
            coachHref: (username) =>
                new URL(`../../collegecoach/tabs/my-profile.html?username=${encodeURIComponent(username)}&from=ai-rep`, window.location.href).href
        });
    }

    // Delegate row clicks (rows are added dynamically + paged).
    schoolList.addEventListener('click', (e) => {
        const row = e.target.closest('.ai-rep-school-row');
        if (row) openSchoolModal(parseInt(row.dataset.schoolIdx, 10));
    });

    schoolsShowMore.addEventListener('click', () => {
        schoolsOffset += BATCH_SIZE;
        loadBestFitSchools(false);
    });

    if (schoolsEmptyBtn) {
        schoolsEmptyBtn.addEventListener('click', () => {
            if (profileSection) profileSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // ============ SEARCH APPEARANCES ============
    // Every time a college coach's AI Recruiting Assistant search returned this
    // player. Division + date + matched criteria only — never coach identity.

    const APPEARANCES_BATCH = 5;
    let appearancesPeriod = '30d';
    let appearancesOffset = 0;

    const appearancesSection = document.getElementById('aiRepAppearancesSection');
    const appearancesList = document.getElementById('aiRepAppearancesList');
    const appearancesLoading = document.getElementById('aiRepAppearancesLoading');
    const appearancesEmpty = document.getElementById('aiRepAppearancesEmpty');
    const appearancesPeriodSel = document.getElementById('aiRepAppearancesPeriod');
    const appearancesShowMore = document.getElementById('aiRepAppearancesShowMore');

    // The section is ALWAYS visible (owner decision, July 2026) — a player with no
    // appearances yet sees the zero-state note rather than the section vanishing.
    async function loadSearchAppearances(reset) {
        if (reset) {
            appearancesOffset = 0;
            appearancesList.innerHTML = '';
            appearancesEmpty.style.display = 'none';
            appearancesShowMore.style.display = 'none';
            appearancesLoading.style.display = 'flex';
        }

        appearancesSection.style.display = '';

        try {
            const data = await API.aiRep.getSearchAppearances(
                appearancesPeriod, appearancesOffset, APPEARANCES_BATCH
            );
            appearancesLoading.style.display = 'none';

            const list = data.appearances || [];
            const total = data.totalCount || 0;

            if (reset && total === 0) {
                appearancesEmpty.style.display = '';
                return;
            }

            // School logos must be loaded before the synchronous getSchoolLogoHTML
            // calls inside renderAppearanceCard (lesson #51).
            if (typeof ensureSchoolLogosLoaded === 'function') {
                try { await ensureSchoolLogosLoaded('../../assets'); } catch (e) { /* logos optional */ }
            }

            list.forEach(item => {
                appearancesList.insertAdjacentHTML('beforeend', renderAppearanceCard(item));
            });

            animateAppearanceCards();
            appearancesShowMore.style.display = data.hasMore ? 'flex' : 'none';
        } catch (err) {
            // Subscription lapsed mid-session (cancelled, or trial ended while the
            // page was open). Swap to the locked state instead of leaving an empty
            // section that reads as "no data".
            if (err && err.status === 403) { renderLockedPage(); window.AiRepPaywall.open(); return; }
            console.error('Failed to load search appearances:', err);
            appearancesLoading.style.display = 'none';
            if (reset) appearancesEmpty.style.display = '';
        }
    }

    // One row per searching school: logo + name + division, with the date on the
    // right. Mirrors the Best-Fit Schools row layout so the two sections read as
    // one system. Logo is the controlled getSchoolLogoHTML emitter (safe per
    // lesson #114); the name itself is always escaped.
    function renderAppearanceCard(item) {
        const date = new Date(item.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const div = item.coach_division ? escapeHtml(item.coach_division) : '';
        const logo = (typeof getSchoolLogoHTML === 'function')
            ? getSchoolLogoHTML(item.team_name, '../../assets', 36) : '';

        return `
        <div class="ai-rep-appearance-row ai-rep-animate-in">
            <span class="ai-rep-appearance-logo">${logo}</span>
            <span class="ai-rep-appearance-info">
                <span class="ai-rep-appearance-name">${escapeHtml(item.team_name || 'College program')}</span>
                ${div ? `<span class="ai-rep-appearance-div">${div}</span>` : ''}
            </span>
            <span class="ai-rep-appearance-date">${date}</span>
        </div>`;
    }

    function animateAppearanceCards() {
        const cards = appearancesList.querySelectorAll('.ai-rep-animate-in:not(.ai-rep-visible)');
        cards.forEach((el, i) => {
            setTimeout(() => el.classList.add('ai-rep-visible'), 60 + (i * 40));
        });
    }

    if (appearancesPeriodSel) {
        appearancesPeriodSel.addEventListener('change', () => {
            appearancesPeriod = appearancesPeriodSel.value;
            loadSearchAppearances(true);
        });
    }

    if (appearancesShowMore) {
        appearancesShowMore.addEventListener('click', () => {
            appearancesOffset += APPEARANCES_BATCH;
            loadSearchAppearances(false);
        });
    }

    // ============ PROFILE OPTIMIZATION ============

    async function loadProfileCompletion() {
        try {
            const data = await API.aiRep.getProfileCompletion();

            completionPct.textContent = data.completionPercent + '%';
            progressFill.style.width = data.completionPercent + '%';

            if (data.incompleteFields.length === 0) {
                // All complete
                recommendations.style.display = 'none';
                allComplete.style.display = 'flex';
            } else {
                allComplete.style.display = 'none';
                const recruitingSections = data.recruitingSections || [];
                // Recruiting-profile sections are always HIGH and sort to the top;
                // basic/discovery fields keep their original position-based tiers.
                const recruitingIncomplete = data.incompleteFields.filter(f => recruitingSections.includes(f));
                const basicIncomplete = data.incompleteFields.filter(f => !recruitingSections.includes(f));

                const recHTML = recruitingIncomplete.map(field => renderRec(field, 'high')).join('');
                const basicHTML = basicIncomplete.map((field, i) => {
                    const priority = i === 0 ? 'high' : i < 3 ? 'med' : 'low';
                    return renderRec(field, priority);
                }).join('');
                recommendations.innerHTML = recHTML + basicHTML;
            }

            // Animate profile section
            profileSection.querySelectorAll('.ai-rep-card').forEach((el, i) => {
                el.classList.add('ai-rep-animate-in');
                setTimeout(() => el.classList.add('ai-rep-visible'), 200 + (i * 50));
            });
        } catch (err) {
            // Subscription lapsed mid-session (cancelled, or trial ended while the
            // page was open). Swap to the locked state instead of leaving an empty
            // section that reads as "no data".
            if (err && err.status === 403) { renderLockedPage(); window.AiRepPaywall.open(); return; }
            console.error('Failed to load profile completion:', err);
        }
    }

    // Render one recommendation row at a given priority tier.
    function renderRec(field, priority) {
        const priorityLabel = priority.toUpperCase();
        const reason = getFieldReason(field);
        return `
        <div class="ai-rep-rec ai-rep-rec-${priority}">
            <span class="ai-rep-rec-badge">${priorityLabel}</span>
            <div class="ai-rep-rec-content">
                <div class="ai-rep-rec-field">${field}</div>
                <div class="ai-rep-rec-reason">${reason}</div>
            </div>
        </div>`;
    }

    function getFieldReason(field) {
        const reasons = {
            'Highlights/Film': 'Coaches frequently filter by film availability. Adding highlights significantly increases your search visibility.',
            'Stats': 'Coaches can search by game statistics. Adding your stats helps you appear in performance-based searches.',
            'Offers': 'Coaches can filter by offer count and division. Listing your offers boosts your profile ranking.',
            'Position': 'Position is one of the most common search filters. Make sure your position is set.',
            'Height': 'Height is a top search filter for coaches. Adding it helps you appear in size-based searches.',
            'Weight': 'Weight is commonly used in coach searches. Adding it improves your match rate.',
            'State': 'Coaches often search by state or region. Setting your state helps local coaches find you.',
            'Graduation Year': 'Coaches filter by class year to find recruits in their target window.',
            'Bio': 'A complete bio adds to your profile score and helps coaches learn about you.',
            'Profile Photo': 'Profiles with photos rank higher in search results.',
            'College Division': 'Setting your college division helps coaches searching for transfer players at specific levels.',
            'Eligibility': 'Coaches searching the portal filter by remaining eligibility. Adding yours increases visibility.',
            // Recruiting-profile sections — finish the section to power AI Match.
            'Academics': 'Finish your Academics section in your recruiting profile to power your AI Match and Best-Fit Schools.',
            'Major & Goals': 'Finish your Major & Goals section in your recruiting profile so we can match you with schools strong in what you want to study.',
            'Financial Fit': 'Finish your Financial Fit section in your recruiting profile so we can match you with programs that can support you.',
            'Level & Location': 'Finish your Level & Location section in your recruiting profile so we can find schools at the levels and places you\'re open to.',
            'Priorities': 'Finish your Priorities section in your recruiting profile so we can rank schools by what matters most to you.'
        };
        return reasons[field] || 'Adding this information helps coaches find you in AI searches.';
    }

    // ============ SEARCH TRENDS (hardcoded demo data) ============
    // HIDDEN 2026-07-25: the Search Trends section is commented out in ai-rep.html,
    // so these three elements resolve to null and the guarded init block at the end
    // of this section never runs. Code kept intact for re-enable — un-comment the
    // section in the HTML and this wires itself back up with no JS changes.

    const trendDivisionFilter = document.getElementById('trendDivisionFilter');
    const trendPositionFilter = document.getElementById('trendPositionFilter');
    const trendBarChart = document.getElementById('trendBarChart');

    // Hardcoded filter usage data: [division][position] -> { filterName: percentage }
    // Represents % of coach searches that include each filter
    // Priority filters (Height, Weight, Offers, Stats, Film, GPA) are biased higher
    const trendData = {
        'all': {
            'all':  { Height: 79, Weight: 74, Offers: 71, Stats: 68, 'Film / Highlights': 66, GPA: 61, State: 43, 'Grad Year': 38, 'Test Scores': 21 },
            'QB':   { Height: 81, Weight: 63, 'Film / Highlights': 88, Stats: 83, Offers: 72, GPA: 67, State: 35, 'Grad Year': 41, 'Test Scores': 28 },
            'RB':   { Weight: 78, 'Film / Highlights': 82, Stats: 76, Height: 62, Offers: 68, GPA: 55, State: 40, 'Grad Year': 37, 'Test Scores': 19 },
            'WR':   { Height: 83, 'Film / Highlights': 86, Stats: 71, Offers: 69, Weight: 56, GPA: 58, State: 38, 'Grad Year': 42, 'Test Scores': 22 },
            'TE':   { Height: 89, Weight: 85, Offers: 64, 'Film / Highlights': 72, Stats: 59, GPA: 53, State: 36, 'Grad Year': 34, 'Test Scores': 18 },
            'OT':   { Weight: 94, Height: 92, Offers: 58, 'Film / Highlights': 61, GPA: 47, Stats: 34, State: 31, 'Grad Year': 33, 'Test Scores': 14 },
            'OG':   { Weight: 91, Height: 86, Offers: 55, 'Film / Highlights': 57, GPA: 44, Stats: 31, State: 29, 'Grad Year': 30, 'Test Scores': 12 },
            'C':    { Weight: 87, Height: 79, Offers: 52, 'Film / Highlights': 54, GPA: 48, Stats: 28, State: 33, 'Grad Year': 29, 'Test Scores': 15 },
            'DE':   { Height: 86, Weight: 83, Stats: 74, 'Film / Highlights': 78, Offers: 70, GPA: 49, State: 37, 'Grad Year': 36, 'Test Scores': 16 },
            'DT':   { Weight: 93, Height: 80, Stats: 62, 'Film / Highlights': 65, Offers: 60, GPA: 43, State: 34, 'Grad Year': 32, 'Test Scores': 13 },
            'NT':   { Weight: 96, Height: 74, Offers: 56, Stats: 57, 'Film / Highlights': 59, GPA: 39, State: 32, 'Grad Year': 28, 'Test Scores': 11 },
            'ILB':  { Height: 77, Weight: 79, Stats: 73, 'Film / Highlights': 75, Offers: 65, GPA: 56, State: 41, 'Grad Year': 35, 'Test Scores': 20 },
            'OLB':  { Height: 82, Weight: 77, 'Film / Highlights': 76, Stats: 70, Offers: 67, GPA: 51, State: 39, 'Grad Year': 37, 'Test Scores': 18 },
            'CB':   { 'Film / Highlights': 87, Height: 78, Stats: 69, Offers: 73, Weight: 53, GPA: 60, State: 42, 'Grad Year': 40, 'Test Scores': 23 },
            'S':    { 'Film / Highlights': 80, Height: 76, Stats: 72, Offers: 68, Weight: 66, GPA: 57, State: 40, 'Grad Year': 38, 'Test Scores': 20 },
            'K':    { 'Film / Highlights': 91, Stats: 85, GPA: 72, Offers: 58, Height: 41, Weight: 28, State: 47, 'Grad Year': 44, 'Test Scores': 33 },
            'P':    { 'Film / Highlights': 88, Stats: 82, GPA: 69, Offers: 54, Height: 48, Weight: 33, State: 45, 'Grad Year': 42, 'Test Scores': 30 },
            'LS':   { 'Film / Highlights': 84, GPA: 65, Stats: 58, Height: 56, Weight: 61, Offers: 44, State: 43, 'Grad Year': 39, 'Test Scores': 26 }
        },
        'D1 FBS': {
            'all':  { Height: 91, Weight: 87, 'Film / Highlights': 82, Stats: 78, Offers: 80, GPA: 64, State: 34, 'Grad Year': 42, 'Test Scores': 27 },
            'QB':   { 'Film / Highlights': 94, Height: 90, Stats: 89, Offers: 84, Weight: 68, GPA: 71, State: 30, 'Grad Year': 46, 'Test Scores': 33 },
            'RB':   { 'Film / Highlights': 90, Stats: 85, Weight: 82, Offers: 79, Height: 66, GPA: 58, State: 33, 'Grad Year': 40, 'Test Scores': 24 },
            'WR':   { 'Film / Highlights': 93, Height: 89, Stats: 80, Offers: 82, Weight: 60, GPA: 62, State: 31, 'Grad Year': 44, 'Test Scores': 26 },
            'TE':   { Height: 94, Weight: 91, 'Film / Highlights': 83, Offers: 76, Stats: 68, GPA: 57, State: 28, 'Grad Year': 38, 'Test Scores': 22 },
            'OT':   { Weight: 97, Height: 96, Offers: 72, 'Film / Highlights': 70, GPA: 51, Stats: 39, State: 25, 'Grad Year': 36, 'Test Scores': 18 },
            'OG':   { Weight: 95, Height: 91, Offers: 68, 'Film / Highlights': 64, GPA: 48, Stats: 35, State: 23, 'Grad Year': 34, 'Test Scores': 16 },
            'C':    { Weight: 92, Height: 85, Offers: 63, 'Film / Highlights': 61, GPA: 52, Stats: 32, State: 26, 'Grad Year': 32, 'Test Scores': 19 },
            'DE':   { Height: 93, Weight: 90, Stats: 82, 'Film / Highlights': 86, Offers: 78, GPA: 52, State: 32, 'Grad Year': 40, 'Test Scores': 20 },
            'DT':   { Weight: 97, Height: 87, Stats: 71, 'Film / Highlights': 74, Offers: 73, GPA: 46, State: 29, 'Grad Year': 37, 'Test Scores': 15 },
            'NT':   { Weight: 98, Height: 81, Offers: 66, Stats: 64, 'Film / Highlights': 67, GPA: 41, State: 27, 'Grad Year': 33, 'Test Scores': 13 },
            'ILB':  { Height: 85, Weight: 86, 'Film / Highlights': 84, Stats: 81, Offers: 76, GPA: 60, State: 35, 'Grad Year': 39, 'Test Scores': 24 },
            'OLB':  { Height: 90, Weight: 85, 'Film / Highlights': 85, Stats: 79, Offers: 78, GPA: 55, State: 33, 'Grad Year': 41, 'Test Scores': 21 },
            'CB':   { 'Film / Highlights': 95, Height: 86, Offers: 83, Stats: 78, Weight: 58, GPA: 63, State: 36, 'Grad Year': 43, 'Test Scores': 28 },
            'S':    { 'Film / Highlights': 89, Height: 84, Stats: 80, Offers: 79, Weight: 73, GPA: 59, State: 34, 'Grad Year': 41, 'Test Scores': 25 },
            'K':    { 'Film / Highlights': 95, Stats: 91, GPA: 76, Offers: 67, Height: 44, Weight: 30, State: 42, 'Grad Year': 48, 'Test Scores': 38 },
            'P':    { 'Film / Highlights': 93, Stats: 88, GPA: 73, Offers: 62, Height: 50, Weight: 36, State: 40, 'Grad Year': 46, 'Test Scores': 35 },
            'LS':   { 'Film / Highlights': 89, GPA: 70, Stats: 64, Height: 61, Weight: 66, Offers: 51, State: 39, 'Grad Year': 43, 'Test Scores': 31 }
        },
        'D1 FCS': {
            'all':  { Height: 84, Weight: 80, Offers: 73, 'Film / Highlights': 75, Stats: 71, GPA: 62, State: 41, 'Grad Year': 39, 'Test Scores': 24 },
            'QB':   { 'Film / Highlights': 89, Stats: 84, Height: 86, Offers: 77, Weight: 64, GPA: 68, State: 37, 'Grad Year': 43, 'Test Scores': 30 },
            'RB':   { 'Film / Highlights': 85, Stats: 79, Weight: 79, Offers: 71, Height: 60, GPA: 56, State: 42, 'Grad Year': 38, 'Test Scores': 21 },
            'WR':   { 'Film / Highlights': 88, Height: 84, Stats: 74, Offers: 72, Weight: 55, GPA: 59, State: 39, 'Grad Year': 41, 'Test Scores': 23 },
            'TE':   { Height: 91, Weight: 87, 'Film / Highlights': 76, Offers: 67, Stats: 62, GPA: 55, State: 35, 'Grad Year': 36, 'Test Scores': 20 },
            'OT':   { Weight: 95, Height: 93, Offers: 63, 'Film / Highlights': 64, GPA: 49, Stats: 36, State: 33, 'Grad Year': 34, 'Test Scores': 16 },
            'OG':   { Weight: 92, Height: 87, Offers: 59, 'Film / Highlights': 58, GPA: 46, Stats: 33, State: 31, 'Grad Year': 31, 'Test Scores': 14 },
            'C':    { Weight: 89, Height: 81, Offers: 55, 'Film / Highlights': 56, GPA: 50, Stats: 30, State: 34, 'Grad Year': 30, 'Test Scores': 17 },
            'DE':   { Height: 89, Weight: 85, Stats: 77, 'Film / Highlights': 80, Offers: 72, GPA: 50, State: 39, 'Grad Year': 38, 'Test Scores': 18 },
            'DT':   { Weight: 94, Height: 82, Stats: 66, 'Film / Highlights': 69, Offers: 64, GPA: 44, State: 36, 'Grad Year': 34, 'Test Scores': 14 },
            'NT':   { Weight: 97, Height: 76, Offers: 59, Stats: 60, 'Film / Highlights': 62, GPA: 40, State: 33, 'Grad Year': 30, 'Test Scores': 12 },
            'ILB':  { Height: 80, Weight: 81, 'Film / Highlights': 78, Stats: 76, Offers: 68, GPA: 57, State: 43, 'Grad Year': 37, 'Test Scores': 22 },
            'OLB':  { Height: 85, Weight: 80, 'Film / Highlights': 79, Stats: 73, Offers: 70, GPA: 53, State: 41, 'Grad Year': 39, 'Test Scores': 19 },
            'CB':   { 'Film / Highlights': 90, Height: 81, Offers: 76, Stats: 72, Weight: 54, GPA: 61, State: 44, 'Grad Year': 42, 'Test Scores': 25 },
            'S':    { 'Film / Highlights': 83, Height: 79, Stats: 75, Offers: 71, Weight: 68, GPA: 58, State: 42, 'Grad Year': 40, 'Test Scores': 22 },
            'K':    { 'Film / Highlights': 93, Stats: 87, GPA: 74, Offers: 60, Height: 43, Weight: 29, State: 48, 'Grad Year': 45, 'Test Scores': 35 },
            'P':    { 'Film / Highlights': 90, Stats: 84, GPA: 71, Offers: 56, Height: 47, Weight: 34, State: 46, 'Grad Year': 43, 'Test Scores': 32 },
            'LS':   { 'Film / Highlights': 86, GPA: 67, Stats: 60, Height: 58, Weight: 63, Offers: 47, State: 44, 'Grad Year': 41, 'Test Scores': 28 }
        },
        'D2': {
            'all':  { Height: 76, Weight: 72, Offers: 66, 'Film / Highlights': 69, Stats: 64, GPA: 63, State: 48, 'Grad Year': 40, 'Test Scores': 26 },
            'QB':   { 'Film / Highlights': 84, Stats: 79, Height: 82, GPA: 70, Offers: 68, Weight: 59, State: 44, 'Grad Year': 43, 'Test Scores': 31 },
            'RB':   { 'Film / Highlights': 79, Stats: 74, Weight: 75, Offers: 63, Height: 58, GPA: 58, State: 47, 'Grad Year': 39, 'Test Scores': 23 },
            'WR':   { 'Film / Highlights': 82, Height: 79, Stats: 67, Offers: 65, Weight: 51, GPA: 61, State: 45, 'Grad Year': 42, 'Test Scores': 25 },
            'TE':   { Height: 87, Weight: 83, 'Film / Highlights': 70, Offers: 60, Stats: 56, GPA: 57, State: 42, 'Grad Year': 37, 'Test Scores': 22 },
            'OT':   { Weight: 92, Height: 89, Offers: 56, 'Film / Highlights': 58, GPA: 52, Stats: 32, State: 39, 'Grad Year': 35, 'Test Scores': 18 },
            'OG':   { Weight: 89, Height: 83, Offers: 52, 'Film / Highlights': 53, GPA: 49, Stats: 29, State: 37, 'Grad Year': 33, 'Test Scores': 16 },
            'C':    { Weight: 84, Height: 76, Offers: 48, 'Film / Highlights': 51, GPA: 53, Stats: 26, State: 40, 'Grad Year': 31, 'Test Scores': 19 },
            'DE':   { Height: 84, Weight: 81, Stats: 72, 'Film / Highlights': 74, Offers: 65, GPA: 52, State: 44, 'Grad Year': 39, 'Test Scores': 19 },
            'DT':   { Weight: 91, Height: 78, Stats: 60, 'Film / Highlights': 63, Offers: 57, GPA: 46, State: 41, 'Grad Year': 35, 'Test Scores': 15 },
            'NT':   { Weight: 94, Height: 71, Offers: 53, Stats: 54, 'Film / Highlights': 57, GPA: 42, State: 38, 'Grad Year': 31, 'Test Scores': 13 },
            'ILB':  { Height: 75, Weight: 76, 'Film / Highlights': 73, Stats: 70, Offers: 62, GPA: 59, State: 48, 'Grad Year': 38, 'Test Scores': 24 },
            'OLB':  { Height: 80, Weight: 75, 'Film / Highlights': 72, Stats: 67, Offers: 64, GPA: 55, State: 46, 'Grad Year': 40, 'Test Scores': 21 },
            'CB':   { 'Film / Highlights': 85, Height: 76, Offers: 70, Stats: 66, Weight: 50, GPA: 62, State: 50, 'Grad Year': 43, 'Test Scores': 27 },
            'S':    { 'Film / Highlights': 78, Height: 73, Stats: 69, Offers: 64, Weight: 63, GPA: 60, State: 47, 'Grad Year': 41, 'Test Scores': 24 },
            'K':    { 'Film / Highlights': 89, Stats: 83, GPA: 74, Offers: 55, Height: 40, Weight: 27, State: 52, 'Grad Year': 46, 'Test Scores': 36 },
            'P':    { 'Film / Highlights': 86, Stats: 80, GPA: 71, Offers: 51, Height: 46, Weight: 31, State: 50, 'Grad Year': 44, 'Test Scores': 33 },
            'LS':   { 'Film / Highlights': 82, GPA: 66, Stats: 56, Height: 54, Weight: 59, Offers: 42, State: 48, 'Grad Year': 42, 'Test Scores': 29 }
        },
        'D3': {
            'all':  { GPA: 78, 'Film / Highlights': 68, Height: 66, Weight: 63, Stats: 62, Offers: 55, State: 51, 'Grad Year': 43, 'Test Scores': 35 },
            'QB':   { 'Film / Highlights': 80, GPA: 79, Stats: 75, Height: 72, Offers: 61, Weight: 54, State: 48, 'Grad Year': 45, 'Test Scores': 38 },
            'RB':   { 'Film / Highlights': 75, Stats: 71, GPA: 73, Weight: 69, Offers: 57, Height: 55, State: 50, 'Grad Year': 41, 'Test Scores': 31 },
            'WR':   { 'Film / Highlights': 78, GPA: 76, Height: 73, Stats: 65, Offers: 59, Weight: 47, State: 49, 'Grad Year': 44, 'Test Scores': 33 },
            'TE':   { Height: 81, Weight: 78, GPA: 74, 'Film / Highlights': 66, Offers: 54, Stats: 52, State: 47, 'Grad Year': 40, 'Test Scores': 30 },
            'OT':   { Weight: 86, Height: 84, GPA: 68, Offers: 49, 'Film / Highlights': 53, Stats: 28, State: 43, 'Grad Year': 37, 'Test Scores': 25 },
            'OG':   { Weight: 83, Height: 78, GPA: 65, Offers: 46, 'Film / Highlights': 49, Stats: 25, State: 41, 'Grad Year': 35, 'Test Scores': 23 },
            'C':    { Weight: 79, Height: 72, GPA: 69, Offers: 43, 'Film / Highlights': 47, Stats: 23, State: 44, 'Grad Year': 33, 'Test Scores': 27 },
            'DE':   { Height: 78, Weight: 76, Stats: 68, 'Film / Highlights': 72, GPA: 66, Offers: 58, State: 49, 'Grad Year': 41, 'Test Scores': 27 },
            'DT':   { Weight: 87, Height: 73, Stats: 57, 'Film / Highlights': 60, GPA: 62, Offers: 52, State: 45, 'Grad Year': 37, 'Test Scores': 22 },
            'NT':   { Weight: 90, Height: 67, GPA: 57, Stats: 51, 'Film / Highlights': 55, Offers: 47, State: 42, 'Grad Year': 34, 'Test Scores': 20 },
            'ILB':  { GPA: 74, 'Film / Highlights': 71, Height: 70, Weight: 72, Stats: 67, Offers: 58, State: 52, 'Grad Year': 40, 'Test Scores': 32 },
            'OLB':  { GPA: 71, Height: 74, 'Film / Highlights': 70, Weight: 68, Stats: 64, Offers: 60, State: 50, 'Grad Year': 42, 'Test Scores': 29 },
            'CB':   { 'Film / Highlights': 81, GPA: 75, Height: 69, Offers: 65, Stats: 63, Weight: 44, State: 53, 'Grad Year': 45, 'Test Scores': 34 },
            'S':    { 'Film / Highlights': 74, GPA: 73, Height: 68, Stats: 67, Offers: 61, Weight: 58, State: 51, 'Grad Year': 43, 'Test Scores': 31 },
            'K':    { 'Film / Highlights': 85, Stats: 79, GPA: 82, Offers: 48, Height: 37, Weight: 24, State: 55, 'Grad Year': 48, 'Test Scores': 42 },
            'P':    { 'Film / Highlights': 82, Stats: 76, GPA: 80, Offers: 45, Height: 42, Weight: 28, State: 53, 'Grad Year': 46, 'Test Scores': 40 },
            'LS':   { 'Film / Highlights': 78, GPA: 76, Stats: 53, Height: 51, Weight: 55, Offers: 39, State: 50, 'Grad Year': 44, 'Test Scores': 36 }
        },
        'NAIA': {
            'all':  { GPA: 75, Height: 68, Weight: 65, 'Film / Highlights': 66, Stats: 60, Offers: 53, State: 52, 'Grad Year': 44, 'Test Scores': 32 },
            'QB':   { 'Film / Highlights': 78, GPA: 76, Stats: 73, Height: 70, Offers: 59, Weight: 52, State: 49, 'Grad Year': 46, 'Test Scores': 36 },
            'RB':   { 'Film / Highlights': 73, Stats: 69, GPA: 71, Weight: 67, Offers: 55, Height: 53, State: 51, 'Grad Year': 42, 'Test Scores': 29 },
            'WR':   { 'Film / Highlights': 76, GPA: 73, Height: 71, Stats: 63, Offers: 57, Weight: 45, State: 50, 'Grad Year': 45, 'Test Scores': 31 },
            'TE':   { Height: 79, Weight: 76, GPA: 72, 'Film / Highlights': 64, Offers: 52, Stats: 50, State: 48, 'Grad Year': 41, 'Test Scores': 28 },
            'OT':   { Weight: 84, Height: 82, GPA: 66, Offers: 47, 'Film / Highlights': 51, Stats: 26, State: 44, 'Grad Year': 38, 'Test Scores': 23 },
            'OG':   { Weight: 81, Height: 76, GPA: 63, Offers: 44, 'Film / Highlights': 47, Stats: 23, State: 42, 'Grad Year': 36, 'Test Scores': 21 },
            'C':    { Weight: 77, Height: 70, GPA: 67, Offers: 41, 'Film / Highlights': 45, Stats: 21, State: 45, 'Grad Year': 34, 'Test Scores': 25 },
            'DE':   { Height: 76, Weight: 74, Stats: 66, 'Film / Highlights': 70, GPA: 64, Offers: 56, State: 50, 'Grad Year': 42, 'Test Scores': 25 },
            'DT':   { Weight: 85, Height: 71, Stats: 55, 'Film / Highlights': 58, GPA: 60, Offers: 50, State: 46, 'Grad Year': 38, 'Test Scores': 20 },
            'NT':   { Weight: 88, Height: 65, GPA: 55, Stats: 49, 'Film / Highlights': 53, Offers: 45, State: 43, 'Grad Year': 35, 'Test Scores': 18 },
            'ILB':  { GPA: 72, 'Film / Highlights': 69, Height: 68, Weight: 70, Stats: 65, Offers: 56, State: 53, 'Grad Year': 41, 'Test Scores': 30 },
            'OLB':  { GPA: 69, Height: 72, 'Film / Highlights': 68, Weight: 66, Stats: 62, Offers: 58, State: 51, 'Grad Year': 43, 'Test Scores': 27 },
            'CB':   { 'Film / Highlights': 79, GPA: 73, Height: 67, Offers: 63, Stats: 61, Weight: 42, State: 54, 'Grad Year': 46, 'Test Scores': 32 },
            'S':    { 'Film / Highlights': 72, GPA: 71, Height: 66, Stats: 65, Offers: 59, Weight: 56, State: 52, 'Grad Year': 44, 'Test Scores': 29 },
            'K':    { 'Film / Highlights': 83, Stats: 77, GPA: 80, Offers: 46, Height: 35, Weight: 22, State: 56, 'Grad Year': 49, 'Test Scores': 40 },
            'P':    { 'Film / Highlights': 80, Stats: 74, GPA: 78, Offers: 43, Height: 40, Weight: 26, State: 54, 'Grad Year': 47, 'Test Scores': 38 },
            'LS':   { 'Film / Highlights': 76, GPA: 74, Stats: 51, Height: 49, Weight: 53, Offers: 37, State: 51, 'Grad Year': 45, 'Test Scores': 34 }
        },
        'NJCAA': {
            'all':  { 'Film / Highlights': 71, Height: 69, Weight: 66, Stats: 65, GPA: 59, Offers: 57, State: 50, 'Grad Year': 47, 'Test Scores': 28 },
            'QB':   { 'Film / Highlights': 81, Stats: 77, Height: 74, GPA: 66, Offers: 63, Weight: 56, State: 46, 'Grad Year': 50, 'Test Scores': 33 },
            'RB':   { 'Film / Highlights': 76, Stats: 73, Weight: 71, Offers: 60, Height: 57, GPA: 55, State: 49, 'Grad Year': 45, 'Test Scores': 25 },
            'WR':   { 'Film / Highlights': 79, Height: 75, Stats: 68, Offers: 62, Weight: 49, GPA: 57, State: 47, 'Grad Year': 48, 'Test Scores': 27 },
            'TE':   { Height: 82, Weight: 79, 'Film / Highlights': 68, Offers: 57, Stats: 54, GPA: 56, State: 45, 'Grad Year': 43, 'Test Scores': 24 },
            'OT':   { Weight: 87, Height: 85, Offers: 53, 'Film / Highlights': 56, GPA: 50, Stats: 30, State: 42, 'Grad Year': 40, 'Test Scores': 20 },
            'OG':   { Weight: 84, Height: 79, Offers: 49, 'Film / Highlights': 52, GPA: 47, Stats: 27, State: 40, 'Grad Year': 38, 'Test Scores': 18 },
            'C':    { Weight: 80, Height: 73, Offers: 46, 'Film / Highlights': 50, GPA: 51, Stats: 24, State: 43, 'Grad Year': 36, 'Test Scores': 21 },
            'DE':   { Height: 80, Weight: 78, Stats: 70, 'Film / Highlights': 73, Offers: 62, GPA: 51, State: 47, 'Grad Year': 44, 'Test Scores': 22 },
            'DT':   { Weight: 88, Height: 75, Stats: 59, 'Film / Highlights': 62, Offers: 55, GPA: 48, State: 44, 'Grad Year': 40, 'Test Scores': 17 },
            'NT':   { Weight: 91, Height: 69, Stats: 53, 'Film / Highlights': 57, GPA: 44, Offers: 50, State: 41, 'Grad Year': 37, 'Test Scores': 15 },
            'ILB':  { 'Film / Highlights': 72, Height: 71, Weight: 73, Stats: 69, GPA: 61, Offers: 59, State: 51, 'Grad Year': 43, 'Test Scores': 27 },
            'OLB':  { Height: 76, 'Film / Highlights': 71, Weight: 70, Stats: 66, Offers: 61, GPA: 57, State: 49, 'Grad Year': 45, 'Test Scores': 24 },
            'CB':   { 'Film / Highlights': 83, Height: 73, Offers: 67, Stats: 65, Weight: 47, GPA: 59, State: 52, 'Grad Year': 48, 'Test Scores': 29 },
            'S':    { 'Film / Highlights': 76, Height: 70, Stats: 68, Offers: 63, Weight: 60, GPA: 58, State: 50, 'Grad Year': 46, 'Test Scores': 26 },
            'K':    { 'Film / Highlights': 87, Stats: 81, GPA: 72, Offers: 50, Height: 38, Weight: 25, State: 54, 'Grad Year': 51, 'Test Scores': 37 },
            'P':    { 'Film / Highlights': 84, Stats: 78, GPA: 70, Offers: 47, Height: 43, Weight: 29, State: 52, 'Grad Year': 49, 'Test Scores': 34 },
            'LS':   { 'Film / Highlights': 80, GPA: 68, Stats: 55, Height: 52, Weight: 57, Offers: 41, State: 50, 'Grad Year': 47, 'Test Scores': 31 }
        }
    };

    function renderTrendBars() {
        const div = trendDivisionFilter.value;
        const pos = trendPositionFilter.value;
        const data = (trendData[div] && trendData[div][pos]) || trendData['all']['all'];

        // Sort by percentage descending
        const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);

        trendBarChart.innerHTML = sorted.map(([label, pct]) => `
            <div class="ai-rep-bar-row">
                <span class="ai-rep-bar-label">${label}</span>
                <div class="ai-rep-bar-track">
                    <div class="ai-rep-bar-fill" style="width: 0%"></div>
                </div>
                <span class="ai-rep-bar-value">${pct}%</span>
            </div>
        `).join('');

        // Animate bars in after render
        requestAnimationFrame(() => {
            trendBarChart.querySelectorAll('.ai-rep-bar-fill').forEach((bar, i) => {
                setTimeout(() => {
                    bar.style.width = sorted[i][1] + '%';
                }, i * 60);
            });
        });
    }

    if (trendDivisionFilter && trendPositionFilter) {
        trendDivisionFilter.addEventListener('change', renderTrendBars);
        trendPositionFilter.addEventListener('change', renderTrendBars);
        renderTrendBars();
    }

    // ============ INITIAL LOAD ============

    await Promise.all([
        loadBestFitSchools(true),
        loadSearchAppearances(true),
        loadProfileCompletion()
    ]);
})();
