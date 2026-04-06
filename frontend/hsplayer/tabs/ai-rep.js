// AI Rep Page - Dynamic (connected to backend)

(async function initAiRep() {
    const BATCH_SIZE = 5;
    let currentPeriod = '7d';
    let currentOffset = 0;
    let totalCount = 0;

    // DOM references
    const matchList = document.getElementById('aiRepMatchList');
    const showMoreBtn = document.getElementById('aiRepShowMore');
    const badge = document.getElementById('aiRepBadge');
    const periodFilter = document.getElementById('aiRepPeriodFilter');
    const loadingEl = document.getElementById('aiRepLoading');
    const matchSection = document.getElementById('aiRepMatchSection');
    const profileSection = document.getElementById('aiRepProfileSection');
    const divCard = document.getElementById('aiRepDivCard');
    const attrCard = document.getElementById('aiRepAttrCard');
    const completionPct = document.getElementById('aiRepCompletionPct');
    const progressFill = document.getElementById('aiRepProgressFill');
    const recommendations = document.getElementById('aiRepRecommendations');
    const allComplete = document.getElementById('aiRepAllComplete');
    const topAttributes = document.getElementById('aiRepTopAttributes');

    const periodLabels = { '7d': 'this week', '30d': 'this month', 'all': 'all time' };

    // Animate entrance for hero + static cards
    const heroEl = document.querySelector('.ai-rep-hero');
    if (heroEl) {
        heroEl.classList.add('ai-rep-animate-in');
        setTimeout(() => heroEl.classList.add('ai-rep-visible'), 80);
    }

    // ============ MATCH FEED ============

    async function loadMatches(reset) {
        if (reset) {
            currentOffset = 0;
            matchList.innerHTML = '';
        }

        // Show loading on first load only
        if (reset) {
            loadingEl.style.display = 'flex';

            showMoreBtn.style.display = 'none';
            divCard.style.display = 'none';
            attrCard.style.display = 'none';
        }

        try {
            const data = await API.aiRep.getMatches(currentPeriod, currentOffset, BATCH_SIZE);
            totalCount = data.totalCount;

            // Hide loading
            loadingEl.style.display = 'none';

            // Update badge
            badge.textContent = `${totalCount} match${totalCount !== 1 ? 'es' : ''} ${periodLabels[currentPeriod]}`;

            if (totalCount === 0) {
                // Hide entire match feed section — don't discourage players with 0 matches
                matchSection.style.display = 'none';
                return;
            }

            // Has matches — show section
            matchSection.style.display = '';
            divCard.style.display = '';
            attrCard.style.display = '';

            // Render match cards
            data.matches.forEach(match => {
                matchList.insertAdjacentHTML('beforeend', renderMatchCard(match));
            });

            // Animate new cards in
            animateNewCards();

            // Show/hide show more
            const loaded = currentOffset + data.matches.length;
            showMoreBtn.style.display = loaded < totalCount ? 'flex' : 'none';

            // Update division chart and top attributes (only on reset)
            if (reset) {
                renderDivisionChart(data.divisionDistribution);
                renderTopAttributes(data.topAttributes);
            }
        } catch (err) {
            console.error('Failed to load AI Rep matches:', err);
            loadingEl.style.display = 'none';
            badge.textContent = 'Error loading matches';
        }
    }

    function renderMatchCard(match) {
        const date = new Date(match.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const tags = match.matched_on.map(label =>
            `<span class="ai-rep-tag-match">${label}</span>`
        ).join('');
        const matchedOnHTML = tags
            ? `<div class="ai-rep-match-body">
                   <span class="ai-rep-criteria-label">Matched on</span>
                   <div class="ai-rep-tags">${tags}</div>
               </div>`
            : '';

        return `
        <div class="ai-rep-match-card ai-rep-animate-in">
            <div class="ai-rep-match-card-header">
                <div class="ai-rep-match-headline">
                    <span class="ai-rep-division-badge">${match.coach_division}</span>
                    <span class="ai-rep-match-text">A ${match.coach_division} coach matched with your profile</span>
                </div>
                <span class="ai-rep-match-date">${date}</span>
            </div>
            ${matchedOnHTML}
        </div>`;
    }

    function renderDivisionChart(distribution) {
        const divisions = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];
        const maxCount = Math.max(...divisions.map(d => distribution[d] || 0), 1);

        divisions.forEach(div => {
            const row = document.querySelector(`.ai-rep-bar-row[data-division="${div}"]`);
            if (!row) return;
            const count = distribution[div] || 0;
            const pct = (count / maxCount) * 100;
            row.querySelector('.ai-rep-bar-fill').style.width = pct + '%';
            row.querySelector('.ai-rep-bar-value').textContent = count;
        });

        // Animate bars
        divCard.classList.add('ai-rep-animate-in');
        setTimeout(() => divCard.classList.add('ai-rep-visible'), 100);
    }

    function renderTopAttributes(attributes) {
        if (!attributes.length) {
            topAttributes.innerHTML = '<span class="ai-rep-tag-attribute" style="opacity:0.5">No data yet</span>';
            return;
        }
        topAttributes.innerHTML = attributes.map(attr =>
            `<span class="ai-rep-tag-attribute">${attr.label} (${attr.percent}%)</span>`
        ).join('');

        attrCard.classList.add('ai-rep-animate-in');
        setTimeout(() => attrCard.classList.add('ai-rep-visible'), 150);
    }

    function animateNewCards() {
        const cards = matchList.querySelectorAll('.ai-rep-animate-in:not(.ai-rep-visible)');
        cards.forEach((el, i) => {
            setTimeout(() => el.classList.add('ai-rep-visible'), 80 + (i * 50));
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
                recommendations.innerHTML = data.incompleteFields.map((field, i) => {
                    const priority = i === 0 ? 'high' : i < 3 ? 'med' : 'low';
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
                }).join('');
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

    function getFieldReason(field) {
        const reasons = {
            'Highlights/Film': 'Coaches frequently filter by film availability. Adding highlights significantly increases your search visibility.',
            'Stats': 'Coaches can search by game statistics. Adding your stats helps you appear in performance-based searches.',
            'GPA': 'Many coaches include academic filters in their searches. Adding your GPA opens up more results.',
            'Offers': 'Coaches can filter by offer count and division. Listing your offers boosts your profile ranking.',
            'Position': 'Position is one of the most common search filters. Make sure your position is set.',
            'Height': 'Height is a top search filter for coaches. Adding it helps you appear in size-based searches.',
            'Weight': 'Weight is commonly used in coach searches. Adding it improves your match rate.',
            'State': 'Coaches often search by state or region. Setting your state helps local coaches find you.',
            'Graduation Year': 'Coaches filter by class year to find recruits in their target window.',
            'Bio': 'A complete bio adds to your profile score and helps coaches learn about you.',
            'Profile Photo': 'Profiles with photos rank higher in search results.',
            'College Division': 'Setting your college division helps coaches searching for transfer players at specific levels.',
            'Eligibility': 'Coaches searching the portal filter by remaining eligibility. Adding yours increases visibility.'
        };
        return reasons[field] || 'Adding this information helps coaches find you in AI searches.';
    }

    // ============ EVENT LISTENERS ============

    periodFilter.addEventListener('change', () => {
        currentPeriod = periodFilter.value;
        loadMatches(true);
    });

    showMoreBtn.addEventListener('click', () => {
        currentOffset += BATCH_SIZE;
        loadMatches(false);
    });

    // ============ INITIAL LOAD ============

    await Promise.all([loadMatches(true), loadProfileCompletion()]);
})();
