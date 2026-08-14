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
                            background:rgba(185,28,28,0.14);border:1px solid rgba(185,28,28,0.35);
                            display:flex;align-items:center;justify-content:center;color:#b91c1c;">
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
    // THIS player's own recruiting-profile completeness, sent once per best-fit
    // response. Drives the school modal's "your recruiting profile is incomplete"
    // callout; stays null (callout hidden) until the first response lands.
    let viewerProfile = null;

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
            // This player's own recruiting-profile completeness, for the school
            // modal's 'your recruiting profile is incomplete' callout.
            if (data.viewerProfile) viewerProfile = data.viewerProfile;

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
            // All five criteria, including unscoreable ones (present:false) so the
            // modal shows the full picture rather than only what matched.
            matches: (school.dimensions || []).map(d => ({ label: d.label, detail: d.detail, score: d.score, present: d.present })),
            staff: school.staff || [],
            viewerProfile: viewerProfile,
            profileHref: new URL('my-profile.html', window.location.href).href,
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

    // Numeric mm/dd/yy (owner decision, July 2026) — short and fixed-width, so the
    // date never grows wide enough to squeeze the school name beside it. Built from
    // the date parts rather than toLocaleDateString so the format is identical on
    // every device locale (an iOS device set to en-GB would render dd/mm/yy).
    function formatAppearanceDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${mm}/${dd}/${yy}`;
    }

    // One row per searching school: logo + name + division, with the date on the
    // right. Mirrors the Best-Fit Schools row layout so the two sections read as
    // one system. Logo is the controlled getSchoolLogoHTML emitter (safe per
    // lesson #114); the name itself is always escaped.
    function renderAppearanceCard(item) {
        const date = formatAppearanceDate(item.created_at);
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

    // ============ INITIAL LOAD ============

    await Promise.all([
        loadBestFitSchools(true),
        loadSearchAppearances(true),
        loadProfileCompletion()
    ]);
})();
