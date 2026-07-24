// AI Rep Page - Dynamic (connected to backend)

(async function initAiRep() {
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
