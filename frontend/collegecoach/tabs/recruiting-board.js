document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Default board configuration
    const DEFAULT_OFFENSE_POSITIONS = [
        { group: 'ol-group', positions: ['LT', 'LG', 'C', 'RG', 'RT'] },
        { group: 'skill-group', positions: ['QB', 'RB', 'WR', 'TE'] }
    ];

    const DEFAULT_DEFENSE_POSITIONS = [
        { group: 'dl-group', positions: ['DE', 'DT', 'NG', 'OLB', 'ILB'] },
        { group: 'secondary-group', positions: ['FS', 'SS', 'CB'] }
    ];

    // Specs (Special Teams) — added in migration 039. Existing boards stored
    // `specs_positions = '[]'` after backfill; the defensive fallback in
    // loadPersonalBoardById / loadSharedGroupBoard renders this default
    // when the API returns an empty array, so legacy boards visually pick
    // up the new section without any data migration.
    const DEFAULT_SPECS_POSITIONS = [
        { group: 'specs-group', positions: ['K', 'P', 'LS'] }
    ];

    // ==================== Per-tab "How this works" info modal ====================
    // One modal element (`#rbInfoModal`) shared by all 4 subtabs. The body is
    // populated from RB_INFO_COPY keyed by the subtab's data-tab name. Auto-opens
    // the first time a coach lands on each tab (persisted via localStorage), then
    // only on explicit click of the .rb-info-btn buttons in each tab's header.
    const RB_INFO_COPY = {
        'personal-boards': {
            title: 'How Personal Boards Works',
            body: `
                <p><strong>What it is</strong></p>
                <p>Your private football field view for ranking recruits by position. Only you can see your personal boards. You can have up to 5.</p>
                <h4>How to use it</h4>
                <ol>
                    <li>Click + to create a new board (e.g., "2026 Class", "Transfer Targets", "Spring Eval").</li>
                    <li>Use Add Position or Remove Position to customize the offense, defense, and specs columns to match your scheme.</li>
                    <li>Promote recruits here from your Pipeline. You'll set a final grade, final color, and final notes, pulled from all the evaluations in their history.</li>
                    <li>Drag and drop recruits to reorder them within a position, or move them between positions.</li>
                    <li>Toggle Offense, Defense, or Specs to switch views.</li>
                </ol>
                <h4>Good to know</h4>
                <ul>
                    <li>Each promoted recruit carries a frozen evaluation history of every coach who graded them on the way here.</li>
                    <li>Click a recruit's card to edit their final grade or move them to another board.</li>
                </ul>
            `,
        },
        'pipeline': {
            title: 'How Pipeline Works',
            body: `
                <p><strong>What it is</strong></p>
                <p>Your personal short list of recruits you're actively evaluating. This is where you grade players and decide who's worth promoting to a board.</p>
                <h4>How to use it</h4>
                <ol>
                    <li>Add recruits from the Team Pool or directly from a player's profile.</li>
                    <li>Click a recruit to open their evaluation card. Set a grade from 0 to 100, pick a color tag, and add notes.</li>
                    <li>Use the filters at the top to slice your pipeline by position, grad year, state, or measurables.</li>
                    <li>When you're ready to commit, promote them to a Personal Board or Shared Board. Their evaluation history travels with them.</li>
                </ol>
                <h4>The three views</h4>
                <ul>
                    <li><strong>My Pipeline:</strong> every recruit you're evaluating.</li>
                    <li><strong>Sent:</strong> recruits you've handed off to other coaches at your school. Tracks pending, accepted, and rejected.</li>
                    <li><strong>Received:</strong> recruits another coach sent you with their evaluation attached. Review their grade and notes, then Accept (adds to your pipeline) or Reject.</li>
                </ul>
                <h4>Color tags</h4>
                <p>Dark Green, Light Green, Yellow, Orange, Red, Dark Red. Your school sets the meaning. Use them consistently.</p>
            `,
        },
        'team-pool': {
            title: 'How Team Pool Works',
            body: `
                <p><strong>What it is</strong></p>
                <p>Your school's shared inbox of recruits who filled out your team's questionnaire. Every coach at your school sees the same pool.</p>
                <h4>How to use it</h4>
                <ol>
                    <li>Click Copy Questionnaire Link and share it with recruits (email, DMs, camp flyers, your school's recruiting page).</li>
                    <li>When a recruit submits, they appear here automatically. Re-submissions update their info, and you'll see a submission count.</li>
                    <li>Use the filters (position, grad year, state, height, weight, GPA) to narrow the list.</li>
                    <li>Click any recruit to open their full submission, including transcript, contact info, and their DR profile if they have one.</li>
                    <li>Hit Add to Pipeline to start evaluating them.</li>
                </ol>
                <h4>Good to know</h4>
                <ul>
                    <li>&#10003; "In my pipeline" means you've already added this recruit.</li>
                    <li>&#10003; "In another coach's pipeline" means another coach at your school is already on them.</li>
                    <li>Recruits without a DR account won't have a profile picture. That's normal.</li>
                </ul>
            `,
        },
        'shared-boards': {
            title: 'How Shared Boards Works',
            body: `
                <p><strong>What it is</strong></p>
                <p>Collaborative recruiting boards for your position group or full staff. Think Google Docs for recruiting boards. Everyone at your school can grade and rank together.</p>
                <h4>How to use it</h4>
                <ol>
                    <li>Create a Group (e.g., "OL Staff", "Defensive Staff") and invite coaches from your school. Invites only go to coaches with matching team names.</li>
                    <li>Inside the group, create up to 5 shared boards (e.g., "2026 Class", "Priority Targets").</li>
                    <li>Promote recruits from your Pipeline to a shared board. The board's final grade is suggested from the average of every coach's grade in the recruit's evaluation history.</li>
                    <li>Members with Editor permission can add, move, grade, and rename. Viewers see everything read only.</li>
                    <li>Click Group Info to manage members, change permissions, or transfer ownership.</li>
                </ol>
                <h4>Permissions</h4>
                <ul>
                    <li><strong>Owner:</strong> full control, including deleting the group.</li>
                    <li><strong>Editor:</strong> add, move, grade, and rename recruits and boards. Invite new members.</li>
                    <li><strong>Viewer:</strong> read only.</li>
                </ul>
                <h4>Good to know</h4>
                <ul>
                    <li>One group per coach.</li>
                    <li>Leaving a group as the owner auto transfers ownership to another editor.</li>
                    <li>Deleting a group removes all its boards for every member. This is permanent.</li>
                </ul>
            `,
        },
    };
    const RB_INFO_SEEN_KEY = (tab) => `rbInfoSeen_${tab}`;

    // Track whether we've called lockBodyScroll for the info modal so close
    // handlers don't double-unlock if invoked twice (overlay + Got it both
    // firing in quick succession, etc.). ModalUtils itself ref-counts, but
    // local guarding keeps the count balanced.
    let _rbInfoModalScrollLocked = false;

    function openInfoModal(tabName) {
        const copy = RB_INFO_COPY[tabName];
        const modal = document.getElementById('rbInfoModal');
        const titleEl = document.getElementById('rbInfoModalTitle');
        const bodyEl = document.getElementById('rbInfoModalBody');
        if (!copy || !modal || !titleEl || !bodyEl) return;
        titleEl.textContent = copy.title;
        bodyEl.innerHTML = copy.body;
        // Reset body scroll position so each open starts at the top of the copy.
        bodyEl.scrollTop = 0;
        modal.classList.add('active');
        if (!_rbInfoModalScrollLocked && window.ModalUtils && typeof window.ModalUtils.lockBodyScroll === 'function') {
            window.ModalUtils.lockBodyScroll();
            _rbInfoModalScrollLocked = true;
        }
        try { localStorage.setItem(RB_INFO_SEEN_KEY(tabName), '1'); } catch (_) { /* localStorage unavailable */ }
    }

    function closeInfoModal() {
        const modal = document.getElementById('rbInfoModal');
        if (modal) modal.classList.remove('active');
        if (_rbInfoModalScrollLocked && window.ModalUtils && typeof window.ModalUtils.unlockBodyScroll === 'function') {
            window.ModalUtils.unlockBodyScroll();
            _rbInfoModalScrollLocked = false;
        }
    }

    function maybeAutoOpenInfoModal(tabName) {
        if (!RB_INFO_COPY[tabName]) return;
        let seen = null;
        try { seen = localStorage.getItem(RB_INFO_SEEN_KEY(tabName)); } catch (_) { /* localStorage unavailable */ }
        if (!seen) openInfoModal(tabName);
    }

    // Wire click handlers for all .rb-info-btn buttons across the 4 tab headers.
    document.querySelectorAll('.rb-info-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = btn.dataset.infoFor;
            if (tab) openInfoModal(tab);
        });
    });
    // Close handlers — overlay click, close (×) button, and "Got it" footer button.
    const _rbInfoOverlay = document.getElementById('rbInfoModalOverlay');
    const _rbInfoClose = document.getElementById('rbInfoModalClose');
    const _rbInfoGotIt = document.getElementById('rbInfoModalGotItBtn');
    if (_rbInfoOverlay) _rbInfoOverlay.addEventListener('click', closeInfoModal);
    if (_rbInfoClose) _rbInfoClose.addEventListener('click', closeInfoModal);
    if (_rbInfoGotIt) _rbInfoGotIt.addEventListener('click', closeInfoModal);

    // "Copy Questionnaire Link" inside the team-switch redacted banner. Same
    // per-school link the Team Pool tab uses — cached after first fetch so
    // repeated clicks don't hammer the API.
    let _redactedQuestionnaireUrl = null;
    const _redactedCopyBtn = document.getElementById('evalRedactedSendQuestionnaireBtn');
    if (_redactedCopyBtn) {
        _redactedCopyBtn.addEventListener('click', async () => {
            try {
                if (!_redactedQuestionnaireUrl) {
                    const linkData = await API.get('/recruiting-board/my-questionnaire');
                    _redactedQuestionnaireUrl = (linkData && linkData.public_url) || null;
                }
                if (!_redactedQuestionnaireUrl) {
                    if (typeof showToast === 'function') {
                        showToast('Could not load your questionnaire link. Try the Team Pool tab.', 'error');
                    }
                    return;
                }
                await navigator.clipboard.writeText(_redactedQuestionnaireUrl);
                if (typeof showToast === 'function') {
                    showToast('Questionnaire link copied to clipboard', 'success');
                }
            } catch (_) {
                if (typeof showToast === 'function') {
                    showToast('Could not copy. Open the Team Pool tab and copy the link manually.', 'error');
                }
            }
        });
    }

    // Track if board has unsaved changes
    let hasUnsavedChanges = false;
    let saveTimeout = null;
    let positionsLoaded = false;

    // Board state
    // currentBoardMode: 'personal' or 'shared' — which API set the field's data goes to.
    // currentBoardType: 'personal' (legacy class-year-keyed) or 'shared'. Kept for shared flows
    //   that still reference it. The new personal-board flow uses currentBoardMode='personal'
    //   and currentPersonalBoardId.
    let currentBoardMode = 'personal';
    let currentBoardType = 'personal';
    let currentBoardId = null;
    let currentBoardRole = null; // 'owner' or 'collaborator'
    let ownedSharedBoards = [];
    let collaboratorBoards = [];

    // Personal boards (named, multi-board)
    const PERSONAL_BOARD_CAP = 5;
    let personalBoards = [];          // [{id, board_name, offense_positions, defense_positions}]
    let currentPersonalBoardId = null;
    let sharedTabInitialized = false; // shared-board init runs lazily on first Shared tab open

    // ==================== Subtab + Personal Board Flow ====================

    const personalBoardSelect = document.getElementById('personalBoardSelect');
    const createPersonalBoardBtn = document.getElementById('createPersonalBoardBtn');
    const deletePersonalBoardBtn = document.getElementById('deletePersonalBoardBtn');
    const renamePersonalBoardBtn = document.getElementById('renamePersonalBoardBtn');
    const personalBoardRenameInput = document.getElementById('personalBoardRenameInput');
    const pbEmptyState = document.getElementById('pbEmptyState');
    const pbCreateFirstBtn = document.getElementById('pbCreateFirstBtn');

    // ---------- Inline rename helper (used by personal + shared boards + group) ----------
    // Hides `display`, shows `input` pre-filled with the current value, focuses it,
    // commits on Enter/blur, reverts on Escape. `commit(newName)` does the API call
    // and is responsible for re-rendering the display with the new name.
    function startInlineRename({ display, input, getCurrentValue, commit, onCancel }) {
        if (!display || !input) return;
        const original = getCurrentValue();
        input.value = original;
        display.style.display = 'none';
        input.style.display = '';
        input.focus();
        input.select();

        let resolved = false;
        const finish = async (apply) => {
            if (resolved) return;
            resolved = true;
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKey);
            const newName = input.value.trim();
            input.style.display = 'none';
            display.style.display = '';
            if (apply && newName && newName !== original) {
                try {
                    await commit(newName);
                } catch (e) {
                    const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                    t((e && (e.error || e.message)) || 'Failed to rename', 'error');
                    if (onCancel) onCancel(original);
                }
            } else if (onCancel) {
                onCancel(original);
            }
        };
        const onBlur = () => finish(true);
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKey);
    }

    // (legacy updateBoardSelector deleted — superseded by renderSharedGroupSelector + renderSharedBoardSelector)

    // ---------- Subtab switching ----------
    function camelTab(tabName) {
        // 'personal-boards' -> 'personalBoards', 'pipeline' -> 'pipeline', 'shared-boards' -> 'sharedBoards'
        return tabName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    async function activateSubtab(tabName) {
        document.querySelectorAll('.rb-subtab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Plan 8 mobile: nudge the newly-active subtab into the visible
        // region of the horizontally-scrollable container. block:'nearest'
        // avoids any vertical page scroll when the button is already
        // vertically in view. requestAnimationFrame defers past the
        // .active class flip's reflow so layout is settled.
        const activeBtn = document.querySelector(`.rb-subtab[data-tab="${tabName}"]`);
        if (activeBtn && window.matchMedia('(max-width: 768px)').matches) {
            requestAnimationFrame(() => {
                try {
                    activeBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
                } catch (_) { /* older Safari ignores options — degrade silently */ }
            });
        }

        const targetId = `${camelTab(tabName)}Tab`;
        document.querySelectorAll('.rb-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === targetId);
        });
        // Body class drives visibility of the shared football field / controls.
        // Hidden on Pipeline AND Team Pool — neither subtab uses the field.
        document.body.classList.toggle('rb-tab-pipeline', tabName === 'pipeline');
        document.body.classList.toggle('rb-tab-team-pool', tabName === 'team-pool');
        localStorage.setItem('lastViewedRecruitingBoardSubtab', tabName);

        if (tabName === 'shared-boards') {
            if (!sharedTabInitialized) {
                await initializeSharedBoardsTab();
            } else if (currentSharedBoardId && currentSharedGroupId) {
                // Always re-render the active shared board on tab activation.
                // The football field DOM is shared with personal-boards, so
                // whoever rendered last wins — if we skip here we may leave
                // the field showing the personal board's positions/players.
                await loadSharedGroupBoard(currentSharedBoardId);
            }
        }
        if (tabName === 'personal-boards' && currentPersonalBoardId) {
            // Always re-render the active personal board on tab activation.
            // Same reason as shared-boards above — the field DOM is shared,
            // so the last tab's render lingers until we explicitly re-mount.
            await loadPersonalBoardById(currentPersonalBoardId);
        }
        if (tabName === 'team-pool') {
            if (!teamPoolInitialized) {
                await initializeTeamPoolTab();
            } else {
                await refreshTeamPool();
            }
        }
        if (tabName === 'pipeline') {
            await initializePipelineTab();
        }

        // Auto-open the "How this works" info modal the first time a coach
        // lands on each subtab. Tracked via localStorage so subsequent visits
        // don't auto-open — the (i) buttons in each tab header remain
        // available for explicit re-open.
        maybeAutoOpenInfoModal(tabName);
    }

    // Pipeline tab body is empty in Plan 3.5 — Plan 4 fills it. The Copy
    // Questionnaire Link button moved to the Team Pool header.

    document.querySelectorAll('.rb-subtab').forEach(btn => {
        btn.addEventListener('click', () => activateSubtab(btn.dataset.tab));
    });

    // ---------- Personal Boards init + load ----------
    async function initializePersonalBoardsTab() {
        try {
            const res = await API.get('/recruiting-board/personal');
            personalBoards = res.boards || [];
            renderPersonalBoardSelector();

            if (personalBoards.length === 0) {
                showPersonalEmptyState();
                return;
            }

            const lastViewedId = localStorage.getItem('lastViewedPersonalBoardId');
            const targetId = (lastViewedId && personalBoards.some(b => b.id === lastViewedId))
                ? lastViewedId
                : personalBoards[0].id;

            personalBoardSelect.value = targetId;
            await loadPersonalBoardById(targetId);
        } catch (error) {
            console.error('Error initializing personal boards:', error);
        }
    }

    function renderPersonalBoardSelector() {
        if (!personalBoardSelect) return;
        personalBoardSelect.innerHTML = '';
        personalBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.board_name;
            personalBoardSelect.appendChild(option);
        });
        // Update button states
        if (createPersonalBoardBtn) {
            createPersonalBoardBtn.disabled = personalBoards.length >= PERSONAL_BOARD_CAP;
            createPersonalBoardBtn.title = createPersonalBoardBtn.disabled
                ? `You can have up to ${PERSONAL_BOARD_CAP} personal boards`
                : 'Create new board';
        }
        if (deletePersonalBoardBtn) {
            deletePersonalBoardBtn.disabled = personalBoards.length === 0;
        }
    }

    function showPersonalEmptyState() {
        document.body.classList.add('rb-personal-empty');
        if (pbEmptyState) pbEmptyState.style.display = 'flex';
        const selectorRow = document.querySelector('.pb-board-selector-row');
        if (selectorRow) selectorRow.style.display = 'none';
        currentPersonalBoardId = null;
    }

    function hidePersonalEmptyState() {
        document.body.classList.remove('rb-personal-empty');
        if (pbEmptyState) pbEmptyState.style.display = 'none';
        const selectorRow = document.querySelector('.pb-board-selector-row');
        if (selectorRow) selectorRow.style.display = 'flex';
    }

    async function loadPersonalBoardById(boardId) {
        currentBoardMode = 'personal';
        currentBoardType = 'personal'; // legacy var still consulted in some places
        currentPersonalBoardId = boardId;
        currentBoardId = null;
        currentBoardRole = 'owner';
        positionsLoaded = false;

        hidePersonalEmptyState();
        updateBoardUI();
        localStorage.setItem('lastViewedPersonalBoardId', boardId);
        // Same defensive cleanup as loadSharedGroupBoard — clear any stale
        // field-hiding body classes so the football field is guaranteed
        // visible while a real board is being rendered.
        document.body.classList.remove('rb-shared-no-boards', 'rb-shared-empty', 'rb-personal-empty', 'rb-tab-pipeline', 'rb-tab-team-pool');

        try {
            const configData = await API.get(`/recruiting-board/personal/${boardId}/config`);
            // Defensive fallback: empty arrays would render an empty field.
            // Specs is auto-populated with DEFAULT_SPECS_POSITIONS for legacy
            // boards that have specs_positions = '[]' post-migration.
            const off = (Array.isArray(configData.offensePositions) && configData.offensePositions.length > 0)
                ? configData.offensePositions
                : DEFAULT_OFFENSE_POSITIONS;
            const def = (Array.isArray(configData.defensePositions) && configData.defensePositions.length > 0)
                ? configData.defensePositions
                : DEFAULT_DEFENSE_POSITIONS;
            const spc = (Array.isArray(configData.specsPositions) && configData.specsPositions.length > 0)
                ? configData.specsPositions
                : DEFAULT_SPECS_POSITIONS;
            renderBoard(off, def, spc);
            positionsLoaded = true;
        } catch (error) {
            console.error('Error loading personal board config:', error);
            renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS, DEFAULT_SPECS_POSITIONS);
            positionsLoaded = true;
        }

        await loadPlayersForBoard(null);
    }

    if (personalBoardSelect) {
        personalBoardSelect.addEventListener('change', function() {
            loadPersonalBoardById(this.value);
        });
    }

    // Inline rename for the currently-selected personal board.
    if (renamePersonalBoardBtn) {
        renamePersonalBoardBtn.addEventListener('click', () => {
            if (!currentPersonalBoardId) return;
            startInlineRename({
                display: personalBoardSelect,
                input: personalBoardRenameInput,
                getCurrentValue: () => {
                    const b = personalBoards.find(b => b.id === currentPersonalBoardId);
                    return b ? b.board_name : '';
                },
                commit: async (newName) => {
                    const res = await API.put(`/recruiting-board/personal/${currentPersonalBoardId}/name`, { boardName: newName });
                    const newBoardName = res.board ? res.board.board_name : newName;
                    const board = personalBoards.find(b => b.id === currentPersonalBoardId);
                    if (board) board.board_name = newBoardName;
                    renderPersonalBoardSelector();
                    personalBoardSelect.value = currentPersonalBoardId;
                    const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                    t('Board renamed');
                }
            });
        });
    }

    // ---------- Personal board create/delete modals ----------
    const createPersonalBoardModal = document.getElementById('createPersonalBoardModal');
    const newPersonalBoardNameInput = document.getElementById('newPersonalBoardNameInput');

    function openCreatePersonalBoardModal() {
        if (personalBoards.length >= PERSONAL_BOARD_CAP) {
            const fn = (typeof window.showToast === 'function') ? window.showToast : showToast;
            fn(`You can only have up to ${PERSONAL_BOARD_CAP} personal boards.`, 'warning');
            return;
        }
        if (newPersonalBoardNameInput) newPersonalBoardNameInput.value = '';
        if (createPersonalBoardModal) createPersonalBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => newPersonalBoardNameInput && newPersonalBoardNameInput.focus(), 100);
    }

    function closeCreatePersonalBoardModal() {
        if (createPersonalBoardModal) createPersonalBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (createPersonalBoardBtn) createPersonalBoardBtn.addEventListener('click', openCreatePersonalBoardModal);
    if (pbCreateFirstBtn) pbCreateFirstBtn.addEventListener('click', openCreatePersonalBoardModal);
    document.getElementById('createPersonalBoardModalOverlay')?.addEventListener('click', closeCreatePersonalBoardModal);
    document.getElementById('createPersonalBoardModalClose')?.addEventListener('click', closeCreatePersonalBoardModal);
    document.getElementById('createPersonalBoardCancelBtn')?.addEventListener('click', closeCreatePersonalBoardModal);

    document.getElementById('createPersonalBoardSubmitBtn')?.addEventListener('click', async () => {
        const boardName = (newPersonalBoardNameInput?.value || '').trim();
        const toast = (typeof window.showToast === 'function') ? window.showToast : showToast;
        if (!boardName) {
            toast('Please enter a board name', 'error');
            return;
        }

        const submitBtn = document.getElementById('createPersonalBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const res = await API.post('/recruiting-board/personal', { boardName });
            const newBoard = res.board;
            personalBoards.push(newBoard);
            renderPersonalBoardSelector();
            personalBoardSelect.value = newBoard.id;
            closeCreatePersonalBoardModal();
            await loadPersonalBoardById(newBoard.id);
            toast('Board created');
        } catch (error) {
            console.error('Error creating personal board:', error);
            toast(error.error || error.message || 'Failed to create board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Board';
        }
    });

    const deletePersonalBoardModal = document.getElementById('deletePersonalBoardModal');

    function openDeletePersonalBoardModal() {
        if (!currentPersonalBoardId) return;
        const board = personalBoards.find(b => b.id === currentPersonalBoardId);
        if (!board) return;
        const nameEl = document.getElementById('deletePersonalBoardName');
        if (nameEl) nameEl.textContent = board.board_name;
        if (deletePersonalBoardModal) deletePersonalBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDeletePersonalBoardModal() {
        if (deletePersonalBoardModal) deletePersonalBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (deletePersonalBoardBtn) deletePersonalBoardBtn.addEventListener('click', openDeletePersonalBoardModal);
    document.getElementById('deletePersonalBoardModalOverlay')?.addEventListener('click', closeDeletePersonalBoardModal);
    document.getElementById('deletePersonalBoardModalClose')?.addEventListener('click', closeDeletePersonalBoardModal);
    document.getElementById('deletePersonalBoardCancelBtn')?.addEventListener('click', closeDeletePersonalBoardModal);

    document.getElementById('deletePersonalBoardSubmitBtn')?.addEventListener('click', async () => {
        if (!currentPersonalBoardId) return;
        const toast = (typeof window.showToast === 'function') ? window.showToast : showToast;
        const submitBtn = document.getElementById('deletePersonalBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Deleting...';

        try {
            const deletedId = currentPersonalBoardId;
            await API.delete(`/recruiting-board/personal/${deletedId}`);
            personalBoards = personalBoards.filter(b => b.id !== deletedId);
            // Drop cached movePositionConfigs entry for this board
            delete movePositionConfigs[`personal:${deletedId}`];
            renderPersonalBoardSelector();
            closeDeletePersonalBoardModal();

            if (personalBoards.length === 0) {
                if (localStorage.getItem('lastViewedPersonalBoardId') === deletedId) {
                    localStorage.removeItem('lastViewedPersonalBoardId');
                }
                showPersonalEmptyState();
                // Clear the field of any leftover content
                document.querySelectorAll('.recruits-list').forEach(l => l.innerHTML = '');
                document.getElementById('offenseField').innerHTML = '';
                document.getElementById('defenseField').innerHTML = '';
            } else {
                const next = personalBoards[0];
                personalBoardSelect.value = next.id;
                await loadPersonalBoardById(next.id);
            }
            toast('Board deleted');
        } catch (error) {
            console.error('Error deleting personal board:', error);
            toast(error.error || error.message || 'Failed to delete board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Delete';
        }
    });

    // ==================== Shared Groups (Phase 2 — Google-Docs-style sharing) ====================
    // State for the Shared Boards tab.
    let sharedGroups = [];           // [{id, group_name, my_permission, is_owner, member_count}]
    let currentSharedGroupId = null;
    let currentSharedGroupPermission = null; // 'editor' | 'viewer'
    let currentSharedGroupIsOwner = false;
    let currentSharedGroupName = null;
    let groupBoards = [];            // [{id, board_name, ...}]
    let currentSharedBoardId = null;
    const SHARED_GROUP_CAP = 1;
    const SHARED_BOARD_PER_GROUP_CAP = 5;

    const sharedGroupSelect = document.getElementById('sharedGroupSelect');
    const sharedBoardSelect = document.getElementById('sharedBoardSelect');
    const sgEmptyState = document.getElementById('sgEmptyState');
    const sgGroupSelectorRow = document.getElementById('sgGroupSelectorRow');
    const sgBoardSelectorRow = document.getElementById('sgBoardSelectorRow');
    const sgNoBoardsState = document.getElementById('sgNoBoardsState');
    const sgPermissionChip = document.getElementById('sgPermissionChip');
    const createSharedGroupBtn = document.getElementById('createSharedGroupBtn');
    const groupInfoBtn = document.getElementById('groupInfoBtn');
    const leaveSharedGroupBtn = document.getElementById('leaveSharedGroupBtn');
    const createSharedBoardBtn = document.getElementById('createSharedBoardBtn');
    const deleteSharedBoardBtn = document.getElementById('deleteSharedBoardBtn');

    async function initializeSharedBoardsTab() {
        if (sharedTabInitialized) return;
        sharedTabInitialized = true;

        try {
            const res = await API.get('/recruiting-board/groups');
            sharedGroups = res.groups || [];

            if (sharedGroups.length === 0) {
                showSharedEmptyState();
                return;
            }

            renderSharedGroupSelector();
            const lastViewedId = localStorage.getItem('lastViewedSharedGroupId');
            const targetId = (lastViewedId && sharedGroups.some(g => g.id === lastViewedId))
                ? lastViewedId
                : sharedGroups[0].id;
            if (sharedGroupSelect) sharedGroupSelect.value = targetId;
            await loadSharedGroup(targetId);
        } catch (error) {
            console.error('Error initializing shared groups:', error);
        }
    }

    function renderSharedGroupSelector() {
        if (!sharedGroupSelect) return;
        sharedGroupSelect.innerHTML = '';
        sharedGroups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.group_name;
            sharedGroupSelect.appendChild(opt);
        });
    }

    function showSharedEmptyState() {
        if (sgEmptyState) sgEmptyState.style.display = 'flex';
        if (sgGroupSelectorRow) sgGroupSelectorRow.style.display = 'none';
        if (sgBoardSelectorRow) sgBoardSelectorRow.style.display = 'none';
        if (sgNoBoardsState) sgNoBoardsState.style.display = 'none';
        const divider = document.getElementById('sgSectionDivider');
        if (divider) divider.style.display = 'none';
        document.body.classList.add('rb-shared-empty');
        currentSharedGroupId = null;
        currentSharedBoardId = null;
        groupBoards = [];
    }

    function hideSharedEmptyState() {
        if (sgEmptyState) sgEmptyState.style.display = 'none';
        if (sgGroupSelectorRow) sgGroupSelectorRow.style.display = 'flex';
        // Divider only appears once we're in a group — visible whenever the
        // group selector row is visible.
        const divider = document.getElementById('sgSectionDivider');
        if (divider) divider.style.display = 'block';
        document.body.classList.remove('rb-shared-empty');
    }

    function renderPermissionChip() {
        if (!sgPermissionChip) return;
        sgPermissionChip.classList.remove('sg-perm-owner', 'sg-perm-editor', 'sg-perm-viewer');
        if (currentSharedGroupIsOwner) {
            sgPermissionChip.textContent = 'Owner';
            sgPermissionChip.classList.add('sg-perm-owner');
        } else if (currentSharedGroupPermission === 'editor') {
            sgPermissionChip.textContent = 'Editor';
            sgPermissionChip.classList.add('sg-perm-editor');
        } else {
            sgPermissionChip.textContent = 'View only';
            sgPermissionChip.classList.add('sg-perm-viewer');
        }
    }

    // Render the (now-static) group name label and show/hide the rename pencil
    // based on the current coach's permission. Editor or owner can rename;
    // viewers see the label only.
    function renderGroupNameDisplay() {
        const name = currentSharedGroupName || '';
        // Modal title label
        const labelEl = document.getElementById('sgGroupNameLabel');
        if (labelEl) labelEl.textContent = name;
        // Row label (in the selector row, next to the permission chip)
        const rowLabelEl = document.getElementById('sgGroupNameRowLabel');
        if (rowLabelEl) rowLabelEl.textContent = name;
        const editBtnEl = document.getElementById('sgGroupNameEditBtn');
        if (editBtnEl) {
            editBtnEl.style.display = (currentSharedGroupPermission === 'editor') ? 'inline-flex' : 'none';
        }
    }

    // Apply read-only / editor affordances based on current group permission.
    // Called every time the active group board (re)renders. Also called from
    // createPlayerCard so newly-added cards get draggable=false for viewers.
    function applySharedPermissionToUI() {
        if (currentBoardMode !== 'group') return; // only matters for group boards
        const isViewer = currentSharedGroupPermission === 'viewer';
        const editorOnly = isViewer ? 'none' : '';

        if (createSharedBoardBtn) createSharedBoardBtn.style.display = editorOnly;
        if (deleteSharedBoardBtn) deleteSharedBoardBtn.style.display = editorOnly;
        const renameSharedBtn = document.getElementById('renameSharedBoardBtn');
        if (renameSharedBtn) renameSharedBtn.style.display = editorOnly;

        const addPosBtn = document.getElementById('addPositionBtn');
        const removePosBtn = document.getElementById('removePositionBtn');
        if (addPosBtn) addPosBtn.style.display = editorOnly;
        if (removePosBtn) removePosBtn.style.display = editorOnly;

        document.querySelectorAll('.position-label-input').forEach(i => { i.readOnly = isViewer; });
        document.querySelectorAll('.recruit-card').forEach(c => { c.draggable = !isViewer; });
    }

    async function loadSharedGroup(groupId) {
        currentSharedGroupId = groupId;
        currentSharedBoardId = null;
        groupBoards = [];
        positionsLoaded = false;
        localStorage.setItem('lastViewedSharedGroupId', groupId);

        hideSharedEmptyState();

        try {
            const groupRes = await API.get(`/recruiting-board/groups/${groupId}`);
            currentSharedGroupPermission = groupRes.my_permission;
            currentSharedGroupIsOwner = !!groupRes.is_owner;
            currentSharedGroupName = groupRes.group_name;
            renderPermissionChip();
            renderGroupNameDisplay();

            const boardsRes = await API.get(`/recruiting-board/groups/${groupId}/boards`);
            groupBoards = boardsRes.boards || [];

            if (groupBoards.length === 0) {
                if (sgBoardSelectorRow) sgBoardSelectorRow.style.display = 'none';
                if (sgNoBoardsState) {
                    sgNoBoardsState.style.display = 'flex';
                    // Hide the "Create First Board" CTA for viewers (they can't create)
                    const createFirstBtn = document.getElementById('sgCreateFirstBoardBtn');
                    if (createFirstBtn) {
                        createFirstBtn.style.display = currentSharedGroupPermission === 'editor' ? '' : 'none';
                    }
                }
                document.body.classList.add('rb-shared-no-boards');
                currentBoardMode = 'group';
                return;
            }

            document.body.classList.remove('rb-shared-no-boards');
            if (sgBoardSelectorRow) sgBoardSelectorRow.style.display = 'flex';
            if (sgNoBoardsState) sgNoBoardsState.style.display = 'none';

            renderSharedBoardSelector();

            const lastBoardId = localStorage.getItem(`lastViewedSharedBoardId_${groupId}`);
            const targetBoardId = (lastBoardId && groupBoards.some(b => b.id === lastBoardId))
                ? lastBoardId
                : groupBoards[0].id;
            sharedBoardSelect.value = targetBoardId;
            await loadSharedGroupBoard(targetBoardId);
        } catch (error) {
            console.error('Error loading shared group:', error);
            const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
            t(error.error || 'Failed to load group', 'error');
        }
    }

    function renderSharedBoardSelector() {
        if (!sharedBoardSelect) return;
        sharedBoardSelect.innerHTML = '';
        groupBoards.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.board_name;
            sharedBoardSelect.appendChild(opt);
        });
        if (createSharedBoardBtn) {
            createSharedBoardBtn.disabled = groupBoards.length >= SHARED_BOARD_PER_GROUP_CAP;
            createSharedBoardBtn.title = createSharedBoardBtn.disabled
                ? `Up to ${SHARED_BOARD_PER_GROUP_CAP} boards per group`
                : 'Create new board';
        }
        if (deleteSharedBoardBtn) {
            deleteSharedBoardBtn.disabled = groupBoards.length === 0;
        }
    }

    async function loadSharedGroupBoard(boardId) {
        currentBoardMode = 'group';
        currentBoardType = 'shared'; // legacy var; some shared paths still consult it
        currentSharedBoardId = boardId;
        currentBoardId = boardId; // some shared/legacy code reads currentBoardId
        currentBoardRole = currentSharedGroupIsOwner ? 'owner' : (currentSharedGroupPermission === 'editor' ? 'collaborator' : 'collaborator');
        positionsLoaded = false;
        localStorage.setItem(`lastViewedSharedBoardId_${currentSharedGroupId}`, boardId);
        // Defensive cleanup — clear every body class that hides the football
        // field. One of these can get left on across renders (e.g. when an
        // invited coach accepts and lands on a group that has boards, the
        // earlier `rb-shared-no-boards` state from initial load can persist
        // and keep the field hidden).
        document.body.classList.remove('rb-shared-no-boards', 'rb-shared-empty', 'rb-personal-empty', 'rb-tab-pipeline', 'rb-tab-team-pool');

        try {
            const cfg = await API.get(`/recruiting-board/groups/${currentSharedGroupId}/boards/${boardId}/config`);
            // Fallback to defaults when the stored config is missing, malformed,
            // or empty. The previous `||` check only caught null/undefined, so a
            // legacy board with `offense_positions = []` would render an empty
            // football field. This handles all three cases safely. Specs is
            // auto-populated with K/P/LS for legacy boards (specs_positions = '[]'
            // post-migration 039).
            const off = (Array.isArray(cfg.offensePositions) && cfg.offensePositions.length > 0)
                ? cfg.offensePositions
                : DEFAULT_OFFENSE_POSITIONS;
            const def = (Array.isArray(cfg.defensePositions) && cfg.defensePositions.length > 0)
                ? cfg.defensePositions
                : DEFAULT_DEFENSE_POSITIONS;
            const spc = (Array.isArray(cfg.specsPositions) && cfg.specsPositions.length > 0)
                ? cfg.specsPositions
                : DEFAULT_SPECS_POSITIONS;
            renderBoard(off, def, spc);
            positionsLoaded = true;
        } catch (error) {
            console.error('Error loading group board config:', error);
            renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS, DEFAULT_SPECS_POSITIONS);
            positionsLoaded = true;
        }

        await loadPlayersForBoard(null);
        applySharedPermissionToUI();
    }

    if (sharedGroupSelect) {
        sharedGroupSelect.addEventListener('change', () => loadSharedGroup(sharedGroupSelect.value));
    }
    if (sharedBoardSelect) {
        sharedBoardSelect.addEventListener('change', () => loadSharedGroupBoard(sharedBoardSelect.value));
    }

    // Inline rename for the currently-selected shared (group) board. Editor or
    // owner only — viewers don't see the pencil button (hidden by applySharedPermissionToUI).
    const renameSharedBoardBtn = document.getElementById('renameSharedBoardBtn');
    const sharedBoardRenameInput = document.getElementById('sharedBoardRenameInput');
    if (renameSharedBoardBtn && sharedBoardSelect && sharedBoardRenameInput) {
        renameSharedBoardBtn.addEventListener('click', () => {
            if (!currentSharedGroupId || !currentSharedBoardId) return;
            startInlineRename({
                display: sharedBoardSelect,
                input: sharedBoardRenameInput,
                getCurrentValue: () => {
                    const b = groupBoards.find(b => b.id === currentSharedBoardId);
                    return b ? b.board_name : '';
                },
                commit: async (newName) => {
                    const res = await API.put(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/name`, { boardName: newName });
                    const newBoardName = res.board ? res.board.board_name : newName;
                    const board = groupBoards.find(b => b.id === currentSharedBoardId);
                    if (board) board.board_name = newBoardName;
                    renderSharedBoardSelector();
                    sharedBoardSelect.value = currentSharedBoardId;
                    const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                    t('Board renamed');
                }
            });
        });
    }

    // Inline rename for the GROUP itself. Editor or owner only — viewers don't see
    // the pencil button (set by renderGroupNameDisplay below).
    const sgGroupNameLabel = document.getElementById('sgGroupNameLabel');
    const sgGroupNameInput = document.getElementById('sgGroupNameInput');
    const sgGroupNameEditBtn = document.getElementById('sgGroupNameEditBtn');
    const sgGroupNameDisplayWrap = document.getElementById('sgGroupNameDisplay');
    if (sgGroupNameEditBtn && sgGroupNameLabel && sgGroupNameInput) {
        sgGroupNameEditBtn.addEventListener('click', () => {
            if (!currentSharedGroupId) return;
            startInlineRename({
                display: sgGroupNameLabel,
                input: sgGroupNameInput,
                getCurrentValue: () => currentSharedGroupName || '',
                commit: async (newName) => {
                    const res = await API.put(`/recruiting-board/groups/${currentSharedGroupId}/name`, { groupName: newName });
                    const fresh = res.group ? res.group.group_name : newName;
                    currentSharedGroupName = fresh;
                    sgGroupNameLabel.textContent = fresh;
                    const rowLabel = document.getElementById('sgGroupNameRowLabel');
                    if (rowLabel) rowLabel.textContent = fresh;
                    // Also keep the cached groups list in sync
                    const g = sharedGroups.find(g => g.id === currentSharedGroupId);
                    if (g) g.group_name = fresh;
                    const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                    t('Group renamed');
                }
            });
        });
    }

    // ---------- Shared Group: Create Group flow (with staged member list) ----------
    const createSharedGroupModal = document.getElementById('createSharedGroupModal');
    const newSharedGroupNameInput = document.getElementById('newSharedGroupNameInput');
    const sgCreateFirstBtn = document.getElementById('sgCreateFirstBtn');

    // Each staged-list entry: { user_id, first_name, last_name, team_name, profile_image_url, permission }
    let createGroupStagedMembers = [];
    let infoStagedMembers = [];

    function openCreateSharedGroupModal() {
        if (sharedGroups.length >= SHARED_GROUP_CAP) {
            const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
            t('You can only be part of one shared group at a time.', 'warning');
            return;
        }
        createGroupStagedMembers = [];
        if (newSharedGroupNameInput) newSharedGroupNameInput.value = '';
        renderCreateGroupStagedList();
        const searchInput = document.getElementById('createGroupMemberSearchInput');
        const results = document.getElementById('createGroupMemberSearchResults');
        if (searchInput) searchInput.value = '';
        if (results) results.innerHTML = '';
        if (createSharedGroupModal) createSharedGroupModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => newSharedGroupNameInput && newSharedGroupNameInput.focus(), 100);
    }

    function closeCreateSharedGroupModal() {
        if (createSharedGroupModal) createSharedGroupModal.classList.remove('active');
        document.body.style.overflow = '';
        createGroupStagedMembers = [];
    }

    if (createSharedGroupBtn) createSharedGroupBtn.addEventListener('click', openCreateSharedGroupModal);
    if (sgCreateFirstBtn) sgCreateFirstBtn.addEventListener('click', openCreateSharedGroupModal);
    document.getElementById('createSharedGroupModalOverlay')?.addEventListener('click', closeCreateSharedGroupModal);
    document.getElementById('createSharedGroupModalClose')?.addEventListener('click', closeCreateSharedGroupModal);
    document.getElementById('createSharedGroupCancelBtn')?.addEventListener('click', closeCreateSharedGroupModal);

    document.getElementById('createSharedGroupSubmitBtn')?.addEventListener('click', async () => {
        const groupName = (newSharedGroupNameInput?.value || '').trim();
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        if (!groupName) { t('Please enter a group name', 'error'); return; }

        const submitBtn = document.getElementById('createSharedGroupSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        try {
            const res = await API.post('/recruiting-board/groups', { groupName });
            const newGroup = res.group;

            // Send staged invites (best-effort; surface failures in summary)
            let invited = 0, failed = 0;
            for (const m of createGroupStagedMembers) {
                try {
                    await API.post(`/recruiting-board/groups/${newGroup.id}/invite`, {
                        inviteeUserId: m.user_id,
                        permission: m.permission
                    });
                    invited++;
                } catch (e) {
                    failed++;
                }
            }

            // Refresh sharedGroups list and select the new one
            const listRes = await API.get('/recruiting-board/groups');
            sharedGroups = listRes.groups || [];
            renderSharedGroupSelector();
            if (sharedGroupSelect) sharedGroupSelect.value = newGroup.id;
            closeCreateSharedGroupModal();
            await loadSharedGroup(newGroup.id);

            const inviteSummary = invited > 0
                ? `${invited} invite${invited === 1 ? '' : 's'} sent` + (failed > 0 ? `, ${failed} failed` : '')
                : (failed > 0 ? `${failed} invite${failed === 1 ? '' : 's'} failed` : '');
            t(`Group created${inviteSummary ? '. ' + inviteSummary : ''}`);
        } catch (error) {
            console.error('Error creating group:', error);
            t(error.error || error.message || 'Failed to create group', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Group';
        }
    });

    function renderCreateGroupStagedList() {
        renderStagedList(createGroupStagedMembers, 'createGroupStagedList', 'createGroupStagedCount', null);
    }

    // Shared staged-list renderer used by both create-group and group-info modals.
    // listElId: ID of the container; countElId: count badge ID; saveBtnElId: save button to enable/disable (or null).
    function renderStagedList(arr, listElId, countElId, saveBtnElId) {
        const list = document.getElementById(listElId);
        const count = document.getElementById(countElId);
        const saveBtn = saveBtnElId ? document.getElementById(saveBtnElId) : null;
        if (count) count.textContent = `(${arr.length})`;
        if (saveBtn) saveBtn.disabled = arr.length === 0;
        if (!list) return;
        if (arr.length === 0) {
            list.innerHTML = '<p class="sg-staged-empty">No coaches staged yet</p>';
            return;
        }
        list.innerHTML = arr.map((m, i) => {
            const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim();
            const avatarHtml = m.profile_image_url
                ? `<img src="${m.profile_image_url}" alt="${fullName}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            const teamPart = [m.team_name, m.state].filter(Boolean).join(', ');
            const subheader = [teamPart, m.college_division].filter(Boolean).join(' • ');
            return `<div class="sg-staged-row" data-idx="${i}">
                <div class="sg-staged-info">
                    <div class="sg-search-result-avatar sg-coach-avatar">${avatarHtml}</div>
                    <div class="sg-search-result-details">
                        <span class="sg-staged-name">${escapeHtml(fullName)}</span>
                        <span class="sg-staged-school sg-coach-subheader">${escapeHtml(subheader)}</span>
                    </div>
                </div>
                <select class="sg-staged-perm-select" data-idx="${i}">
                    <option value="viewer"${m.permission === 'viewer' ? ' selected' : ''}>Viewer</option>
                    <option value="editor"${m.permission === 'editor' ? ' selected' : ''}>Editor</option>
                </select>
                <button class="sg-staged-remove" data-idx="${i}" title="Remove from list">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>`;
        }).join('');
        // Wire up per-row controls
        list.querySelectorAll('.sg-staged-perm-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const idx = parseInt(e.target.dataset.idx, 10);
                arr[idx].permission = e.target.value;
            });
        });
        list.querySelectorAll('.sg-staged-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.dataset.idx, 10);
                arr.splice(idx, 1);
                if (listElId === 'createGroupStagedList') {
                    renderCreateGroupStagedList();
                    // If the search dropdown is still showing this coach, flip
                    // their button back to "Add" so they can be re-staged.
                    if (_searchRenderers.create) _searchRenderers.create();
                } else {
                    renderInfoStagedList();
                    if (_searchRenderers.info) _searchRenderers.info();
                }
            });
        });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------- Shared search-coaches (same-school only, enforced server-side) ----------

    // Cache the most recent search results per context so stageCoach can
    // re-render the dropdown after each Add (to flip the just-added row's
    // button to "Added") WITHOUT clearing the search input or refetching.
    const _lastSearchResults = { create: [], info: [] };

    function setupMemberSearch(inputId, resultsId, ctx, getStagedArr, getGroupId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        if (!input || !results) return;
        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => doSearch(input.value), 300);
        });
        // Focus → show all teammates (empty-query browse mode). Triggers only
        // when the input is empty so typing-then-focusing doesn't re-fetch.
        input.addEventListener('focus', () => {
            if (!input.value || input.value.length === 0) {
                doSearch('');
            }
        });
        async function doSearch(q) {
            // Single-character queries are too noisy — wait for 0 or 2+ chars.
            if (q && q.length === 1) {
                _lastSearchResults[ctx] = [];
                results.innerHTML = '';
                return;
            }
            try {
                const groupId = getGroupId ? getGroupId() : null;
                const qParam = q ? `query=${encodeURIComponent(q)}` : '';
                const groupParam = groupId ? `groupId=${groupId}` : '';
                const qs = [qParam, groupParam].filter(Boolean).join('&');
                const url = `/recruiting-board/groups/search-coaches${qs ? '?' + qs : ''}`;
                const res = await API.get(url);
                _lastSearchResults[ctx] = res.coaches || [];
                renderResults(_lastSearchResults[ctx]);
            } catch (e) {
                results.innerHTML = '<p class="sg-staged-empty">Error searching coaches</p>';
            }
        }
        function renderResults(coaches) {
            if (coaches.length === 0) {
                results.innerHTML = '<p class="sg-staged-empty">No coaches found</p>';
                return;
            }
            const stagedIds = new Set(getStagedArr().map(m => String(m.user_id)));
            // Keep already-staged rows visible — flip their button to "Added"
            // (disabled) so the user sees what they already added without
            // having to re-type the search.
            results.innerHTML = coaches.map(c => {
                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                const avatarHtml = c.profile_image_url
                    ? `<img src="${c.profile_image_url}" alt="${name}">`
                    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                const teamPart = [c.team_name, c.state].filter(Boolean).join(', ');
                const subheader = [teamPart, c.college_division].filter(Boolean).join(' • ');
                const isStaged = stagedIds.has(String(c.user_id));
                const btnHtml = isStaged
                    ? '<button class="sg-search-add-btn sg-search-added-btn" disabled>Added</button>'
                    : '<button class="sg-search-add-btn">Add</button>';
                return `<div class="sg-search-result-item${isStaged ? ' sg-search-result-staged' : ''}" data-uid="${c.user_id}">
                    <div class="sg-search-result-info">
                        <div class="sg-search-result-avatar sg-coach-avatar">${avatarHtml}</div>
                        <div class="sg-search-result-details">
                            <span class="sg-search-result-name">${escapeHtml(name)}</span>
                            <span class="sg-search-result-school sg-coach-subheader">${escapeHtml(subheader)}</span>
                        </div>
                    </div>
                    ${btnHtml}
                </div>`;
            }).join('');
            results.querySelectorAll('.sg-search-result-item').forEach(item => {
                const btn = item.querySelector('.sg-search-add-btn:not(:disabled)');
                if (!btn) return;
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const uid = item.dataset.uid;
                    const coach = coaches.find(c => String(c.user_id) === String(uid));
                    if (coach) handlePickCoach(coach, ctx);
                });
            });
        }
        // Expose renderResults so stageCoach can refresh the dropdown after
        // each Add without a refetch.
        _searchRenderers[ctx] = () => renderResults(_lastSearchResults[ctx]);
    }
    // Per-context renderer hooks (filled by setupMemberSearch). stageCoach
    // calls these to update the just-added row's button to "Added".
    const _searchRenderers = { create: null, info: null };

    // Server-side filter on /groups/search-coaches guarantees the picker only
    // surfaces coaches at the requester's school, so we can stage unconditionally.
    function handlePickCoach(coach, ctx) {
        stageCoach(coach, ctx);
    }

    function stageCoach(coach, ctx) {
        const arr = ctx === 'create' ? createGroupStagedMembers : infoStagedMembers;
        if (arr.some(m => String(m.user_id) === String(coach.user_id))) return;
        arr.push({
            user_id: coach.user_id,
            first_name: coach.first_name,
            last_name: coach.last_name,
            team_name: coach.team_name,
            state: coach.state,
            college_division: coach.college_division,
            profile_image_url: coach.profile_image_url,
            permission: 'viewer'
        });
        if (ctx === 'create') {
            renderCreateGroupStagedList();
        } else {
            renderInfoStagedList();
        }
        // Refresh the dropdown so the just-added row flips to "Added" —
        // search input + results stay in place so the user can add more.
        if (_searchRenderers[ctx]) _searchRenderers[ctx]();
    }

    // Wire up the create-group modal's member search
    setupMemberSearch(
        'createGroupMemberSearchInput',
        'createGroupMemberSearchResults',
        'create',
        () => createGroupStagedMembers,
        () => null /* no groupId yet */
    );

    // ---------- Shared Group: Leave + Delete + Group Info ----------
    const leaveSharedGroupModal = document.getElementById('leaveSharedGroupModal');
    const deleteSharedGroupModal = document.getElementById('deleteSharedGroupModal');

    function openLeaveSharedGroupModal() {
        if (!currentSharedGroupId) return;
        const nameEl = document.getElementById('leaveSharedGroupName');
        const text = document.getElementById('leaveSharedGroupConfirmText');
        if (nameEl) nameEl.textContent = currentSharedGroupName || 'this group';
        if (text) {
            text.textContent = currentSharedGroupIsOwner
                ? 'Are you sure you want to leave this group? Ownership will transfer to another member, or the group will be deleted if you are the only one.'
                : 'Are you sure you want to leave this group? You will no longer have access to its boards.';
        }
        if (leaveSharedGroupModal) leaveSharedGroupModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLeaveSharedGroupModal() {
        if (leaveSharedGroupModal) leaveSharedGroupModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (leaveSharedGroupBtn) leaveSharedGroupBtn.addEventListener('click', openLeaveSharedGroupModal);
    document.getElementById('leaveSharedGroupModalOverlay')?.addEventListener('click', closeLeaveSharedGroupModal);
    document.getElementById('leaveSharedGroupModalClose')?.addEventListener('click', closeLeaveSharedGroupModal);
    document.getElementById('leaveSharedGroupCancelBtn')?.addEventListener('click', closeLeaveSharedGroupModal);

    document.getElementById('leaveSharedGroupSubmitBtn')?.addEventListener('click', async () => {
        if (!currentSharedGroupId) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        const submitBtn = document.getElementById('leaveSharedGroupSubmitBtn');
        submitBtn.disabled = true; submitBtn.textContent = 'Leaving...';
        try {
            await API.post(`/recruiting-board/groups/${currentSharedGroupId}/leave`);
            const leftId = currentSharedGroupId;
            sharedGroups = sharedGroups.filter(g => g.id !== leftId);
            localStorage.removeItem('lastViewedSharedGroupId');
            localStorage.removeItem(`lastViewedSharedBoardId_${leftId}`);
            closeLeaveSharedGroupModal();
            renderSharedGroupSelector();
            if (sharedGroups.length === 0) {
                showSharedEmptyState();
                document.getElementById('offenseField').innerHTML = '';
                document.getElementById('defenseField').innerHTML = '';
            } else {
                if (sharedGroupSelect) sharedGroupSelect.value = sharedGroups[0].id;
                await loadSharedGroup(sharedGroups[0].id);
            }
            t('Left group');
        } catch (error) {
            console.error('Error leaving group:', error);
            t(error.error || error.message || 'Failed to leave group', 'error');
        } finally {
            submitBtn.disabled = false; submitBtn.textContent = 'Leave Group';
        }
    });

    // Delete-group is reachable from inside the Group Info modal (sgDeleteGroupFromInfoBtn)
    function openDeleteSharedGroupModal() {
        if (!currentSharedGroupId) return;
        const nameEl = document.getElementById('deleteSharedGroupName');
        if (nameEl) nameEl.textContent = currentSharedGroupName || '';
        if (deleteSharedGroupModal) deleteSharedGroupModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDeleteSharedGroupModal() {
        if (deleteSharedGroupModal) deleteSharedGroupModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    document.getElementById('deleteSharedGroupModalOverlay')?.addEventListener('click', closeDeleteSharedGroupModal);
    document.getElementById('deleteSharedGroupModalClose')?.addEventListener('click', closeDeleteSharedGroupModal);
    document.getElementById('deleteSharedGroupCancelBtn')?.addEventListener('click', closeDeleteSharedGroupModal);

    document.getElementById('deleteSharedGroupSubmitBtn')?.addEventListener('click', async () => {
        if (!currentSharedGroupId) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        const submitBtn = document.getElementById('deleteSharedGroupSubmitBtn');
        submitBtn.disabled = true; submitBtn.textContent = 'Deleting...';
        try {
            await API.delete(`/recruiting-board/groups/${currentSharedGroupId}`);
            const deletedId = currentSharedGroupId;
            sharedGroups = sharedGroups.filter(g => g.id !== deletedId);
            localStorage.removeItem('lastViewedSharedGroupId');
            localStorage.removeItem(`lastViewedSharedBoardId_${deletedId}`);
            closeDeleteSharedGroupModal();
            closeSharedGroupInfoModal();
            renderSharedGroupSelector();
            if (sharedGroups.length === 0) {
                showSharedEmptyState();
                document.getElementById('offenseField').innerHTML = '';
                document.getElementById('defenseField').innerHTML = '';
            } else {
                if (sharedGroupSelect) sharedGroupSelect.value = sharedGroups[0].id;
                await loadSharedGroup(sharedGroups[0].id);
            }
            t('Group deleted');
        } catch (error) {
            console.error('Error deleting group:', error);
            t(error.error || error.message || 'Failed to delete group', 'error');
        } finally {
            submitBtn.disabled = false; submitBtn.textContent = 'Delete Group';
        }
    });

    // ---------- Shared Group: Group Info modal ----------
    const sharedGroupInfoModal = document.getElementById('sharedGroupInfoModal');

    async function openSharedGroupInfoModal() {
        if (!currentSharedGroupId) return;
        infoStagedMembers = [];
        // Pre-populate the title from the cached state so the name shows
        // instantly — loadSharedGroupInfo() refreshes from the server below.
        renderGroupNameDisplay();
        if (sharedGroupInfoModal) sharedGroupInfoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        await loadSharedGroupInfo();
    }

    function closeSharedGroupInfoModal() {
        if (sharedGroupInfoModal) sharedGroupInfoModal.classList.remove('active');
        document.body.style.overflow = '';
        infoStagedMembers = [];
    }

    if (groupInfoBtn) groupInfoBtn.addEventListener('click', openSharedGroupInfoModal);
    document.getElementById('sharedGroupInfoModalOverlay')?.addEventListener('click', closeSharedGroupInfoModal);
    document.getElementById('sharedGroupInfoModalClose')?.addEventListener('click', closeSharedGroupInfoModal);
    document.getElementById('sharedGroupInfoCloseBtn')?.addEventListener('click', closeSharedGroupInfoModal);
    document.getElementById('sgDeleteGroupFromInfoBtn')?.addEventListener('click', openDeleteSharedGroupModal);

    async function loadSharedGroupInfo() {
        try {
            const grp = await API.get(`/recruiting-board/groups/${currentSharedGroupId}`);
            currentSharedGroupPermission = grp.my_permission;
            currentSharedGroupIsOwner = !!grp.is_owner;
            currentSharedGroupName = grp.group_name;

            // sgGroupNameLabel is the modal title now — renderGroupNameDisplay
            // populates it and toggles the rename pencil based on permission.
            renderGroupNameDisplay();

            const isEditor = currentSharedGroupPermission === 'editor';
            const isOwner = currentSharedGroupIsOwner;

            // Add-members section visible to editors/owners only
            const addSection = document.getElementById('sgInfoAddSection');
            if (addSection) addSection.style.display = isEditor ? '' : 'none';
            renderInfoStagedList();

            // Members list
            renderGroupMembersList(grp.members || [], grp.owner_user_id, isEditor, isOwner);

            // Pending invites list
            try {
                const pi = await API.get(`/recruiting-board/groups/${currentSharedGroupId}/pending-invites`);
                renderGroupPendingInvitesList(pi.pendingInvites || [], isEditor);
            } catch { renderGroupPendingInvitesList([], isEditor); }

            // Transfer ownership (owner only)
            const xferSection = document.getElementById('sgTransferSection');
            if (xferSection) xferSection.style.display = isOwner ? '' : 'none';
            if (isOwner) renderTransferOwnershipSelect(grp.members || [], grp.owner_user_id);

            // Danger zone (delete group) — visible to editors/owners
            const danger = document.getElementById('sgDangerSection');
            if (danger) danger.style.display = isEditor ? '' : 'none';
        } catch (error) {
            console.error('Error loading group info:', error);
        }
    }

    function renderInfoStagedList() {
        renderStagedList(infoStagedMembers, 'infoStagedList', 'infoStagedCount', 'sgSaveMembersBtn');
    }

    // Wire up the Group Info modal's member search (groupId comes from current state)
    setupMemberSearch(
        'infoMemberSearchInput',
        'infoMemberSearchResults',
        'info',
        () => infoStagedMembers,
        () => currentSharedGroupId
    );

    document.getElementById('sgSaveMembersBtn')?.addEventListener('click', async () => {
        if (!currentSharedGroupId || infoStagedMembers.length === 0) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        const btn = document.getElementById('sgSaveMembersBtn');
        btn.disabled = true; btn.textContent = 'Sending...';
        let invited = 0, failed = 0;
        for (const m of infoStagedMembers) {
            try {
                await API.post(`/recruiting-board/groups/${currentSharedGroupId}/invite`, {
                    inviteeUserId: m.user_id,
                    permission: m.permission
                });
                invited++;
            } catch { failed++; }
        }
        infoStagedMembers = [];
        await loadSharedGroupInfo();
        t(invited > 0
            ? `${invited} invite${invited === 1 ? '' : 's'} sent` + (failed > 0 ? `, ${failed} failed` : '')
            : `Failed to send invites`,
          failed > 0 && invited === 0 ? 'error' : 'success');
        btn.textContent = 'Send Invites';
    });

    function renderGroupMembersList(members, ownerUserId, isEditor, isOwner) {
        const list = document.getElementById('sgMembersList');
        if (!list) return;
        list.innerHTML = members.map(m => {
            const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim();
            const avatarHtml = m.profile_image_url
                ? `<img src="${m.profile_image_url}" alt="${fullName}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            const isThisOwner = String(m.user_id) === String(ownerUserId);
            const chipClass = isThisOwner ? 'sg-perm-owner' : (m.permission === 'editor' ? 'sg-perm-editor' : 'sg-perm-viewer');
            const chipLabel = isThisOwner ? 'Owner' : (m.permission === 'editor' ? 'Editor' : 'View only');

            // Permission select: only editors/owners see it, but the OWNER's row is uneditable here
            let controls = `<span class="sg-permission-chip ${chipClass}">${chipLabel}</span>`;
            if (isEditor && !isThisOwner) {
                controls = `<select class="sg-member-perm-select" data-uid="${m.user_id}">
                    <option value="viewer"${m.permission === 'viewer' ? ' selected' : ''}>Viewer</option>
                    <option value="editor"${m.permission === 'editor' ? ' selected' : ''}>Editor</option>
                </select>
                <button class="sg-member-remove" data-uid="${m.user_id}" data-name="${escapeHtml(fullName)}" title="Remove member">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>`;
            }

            const teamPart = [m.team_name, m.state].filter(Boolean).join(', ');
            const subheader = [teamPart, m.college_division].filter(Boolean).join(' • ');
            return `<div class="sg-member-row">
                <div class="sg-member-info">
                    <div class="sg-member-avatar sg-coach-avatar">${avatarHtml}</div>
                    <div class="sg-search-result-details">
                        <span class="sg-member-name">${escapeHtml(fullName)}</span>
                        <span class="sg-member-school sg-coach-subheader">${escapeHtml(subheader)}</span>
                    </div>
                </div>
                ${controls}
            </div>`;
        }).join('');

        // Wire permission selects
        list.querySelectorAll('.sg-member-perm-select').forEach(sel => {
            sel.addEventListener('change', async e => {
                const uid = e.target.dataset.uid;
                const newPerm = e.target.value;
                const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                try {
                    await API.put(`/recruiting-board/groups/${currentSharedGroupId}/members/${uid}/permission`, { permission: newPerm });
                    t('Permission updated');
                } catch (err) {
                    t(err.error || 'Failed to update permission', 'error');
                    await loadSharedGroupInfo();
                }
            });
        });

        // Wire remove buttons
        list.querySelectorAll('.sg-member-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                openSgRemoveMemberModal(btn.dataset.uid, btn.dataset.name);
            });
        });
    }

    function renderGroupPendingInvitesList(pending, isEditor) {
        const section = document.getElementById('sgPendingSection');
        const list = document.getElementById('sgPendingList');
        if (!section || !list) return;
        if (pending.length === 0) {
            section.style.display = 'none';
            list.innerHTML = '';
            return;
        }
        section.style.display = '';
        list.innerHTML = pending.map(p => {
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            const avatarHtml = p.profile_image_url
                ? `<img src="${p.profile_image_url}" alt="${fullName}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            const cancelBtn = isEditor ? `<button class="sg-member-remove" data-uid="${p.invitee_user_id}" title="Cancel invite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>` : '';
            const teamPart = [p.team_name, p.state].filter(Boolean).join(', ');
            const subheader = [teamPart, p.college_division].filter(Boolean).join(' • ');
            const permLabel = (p.permission || 'viewer') === 'editor' ? 'Editor' : 'Viewer';
            return `<div class="sg-member-row">
                <div class="sg-member-info">
                    <div class="sg-member-avatar sg-coach-avatar">${avatarHtml}</div>
                    <div class="sg-search-result-details">
                        <span class="sg-member-name">${escapeHtml(fullName)}</span>
                        <span class="sg-member-school sg-coach-subheader">${escapeHtml(subheader)} · ${escapeHtml(permLabel)}</span>
                    </div>
                </div>
                <span class="sg-pending-badge">Pending</span>
                ${cancelBtn}
            </div>`;
        }).join('');
        list.querySelectorAll('.sg-member-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
                try {
                    await API.delete(`/recruiting-board/groups/${currentSharedGroupId}/invite/${btn.dataset.uid}`);
                    await loadSharedGroupInfo();
                    t('Invite cancelled');
                } catch (e) {
                    t('Failed to cancel invite', 'error');
                }
            });
        });
    }

    function renderTransferOwnershipSelect(members, ownerUserId) {
        const sel = document.getElementById('sgTransferSelect');
        const btn = document.getElementById('sgTransferBtn');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select a member...</option>';
        members.forEach(m => {
            if (String(m.user_id) === String(ownerUserId)) return;
            const opt = document.createElement('option');
            opt.value = m.user_id;
            const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim();
            opt.textContent = `${fullName} (${m.permission === 'editor' ? 'Editor' : 'Viewer'})`;
            sel.appendChild(opt);
        });
        if (btn) btn.disabled = !sel.value;
        sel.addEventListener('change', () => { if (btn) btn.disabled = !sel.value; });
    }

    document.getElementById('sgTransferBtn')?.addEventListener('click', () => {
        const sel = document.getElementById('sgTransferSelect');
        if (!sel || !sel.value) return;
        const opt = sel.options[sel.selectedIndex];
        document.getElementById('sgTransferConfirmName').textContent = opt.textContent;
        document.getElementById('sgTransferConfirmModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        document.getElementById('sgTransferConfirmSubmitBtn').dataset.targetUid = sel.value;
    });

    function closeTransferConfirmModal() {
        const m = document.getElementById('sgTransferConfirmModal');
        if (m) m.classList.remove('active');
        document.body.style.overflow = '';
    }
    document.getElementById('sgTransferConfirmModalOverlay')?.addEventListener('click', closeTransferConfirmModal);
    document.getElementById('sgTransferConfirmModalClose')?.addEventListener('click', closeTransferConfirmModal);
    document.getElementById('sgTransferConfirmCancelBtn')?.addEventListener('click', closeTransferConfirmModal);

    document.getElementById('sgTransferConfirmSubmitBtn')?.addEventListener('click', async (e) => {
        const newOwnerUid = e.currentTarget.dataset.targetUid;
        if (!newOwnerUid || !currentSharedGroupId) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        e.currentTarget.disabled = true;
        try {
            await API.post(`/recruiting-board/groups/${currentSharedGroupId}/transfer-ownership`, { newOwnerUserId: newOwnerUid });
            closeTransferConfirmModal();
            await loadSharedGroupInfo();
            // Reload the group so the new permission chip + permission state propagate
            await loadSharedGroup(currentSharedGroupId);
            t('Ownership transferred');
        } catch (err) {
            t(err.error || 'Failed to transfer ownership', 'error');
        } finally {
            e.currentTarget.disabled = false;
        }
    });

    // Remove-member confirm
    let _sgRemoveMember = null;
    function openSgRemoveMemberModal(uid, name) {
        _sgRemoveMember = { uid, name };
        document.getElementById('sgRemoveMemberName').textContent = name;
        document.getElementById('sgRemoveMemberModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeSgRemoveMemberModal() {
        const m = document.getElementById('sgRemoveMemberModal');
        if (m) m.classList.remove('active');
        document.body.style.overflow = '';
        _sgRemoveMember = null;
    }
    document.getElementById('sgRemoveMemberModalOverlay')?.addEventListener('click', closeSgRemoveMemberModal);
    document.getElementById('sgRemoveMemberModalClose')?.addEventListener('click', closeSgRemoveMemberModal);
    document.getElementById('sgRemoveMemberCancelBtn')?.addEventListener('click', closeSgRemoveMemberModal);

    document.getElementById('sgRemoveMemberSubmitBtn')?.addEventListener('click', async () => {
        if (!_sgRemoveMember || !currentSharedGroupId) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        try {
            await API.delete(`/recruiting-board/groups/${currentSharedGroupId}/members/${_sgRemoveMember.uid}`);
            closeSgRemoveMemberModal();
            await loadSharedGroupInfo();
            t('Member removed');
        } catch (err) {
            t(err.error || 'Failed to remove member', 'error');
        }
    });

    // ---------- Shared Board (inside a group): Create + Delete board ----------
    const createSharedBoardModal = document.getElementById('createSharedBoardModal');
    const newSharedBoardNameInput = document.getElementById('newSharedBoardNameInput');
    const sgCreateFirstBoardBtn = document.getElementById('sgCreateFirstBoardBtn');

    function openCreateSharedBoardModal() {
        if (!currentSharedGroupId) return;
        if (groupBoards.length >= SHARED_BOARD_PER_GROUP_CAP) {
            const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
            t(`Up to ${SHARED_BOARD_PER_GROUP_CAP} boards per group`, 'warning');
            return;
        }
        if (newSharedBoardNameInput) newSharedBoardNameInput.value = '';
        if (createSharedBoardModal) createSharedBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => newSharedBoardNameInput && newSharedBoardNameInput.focus(), 100);
    }

    function closeCreateSharedBoardModal() {
        if (createSharedBoardModal) createSharedBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (createSharedBoardBtn) createSharedBoardBtn.addEventListener('click', openCreateSharedBoardModal);
    if (sgCreateFirstBoardBtn) sgCreateFirstBoardBtn.addEventListener('click', openCreateSharedBoardModal);
    document.getElementById('createSharedBoardModalOverlay')?.addEventListener('click', closeCreateSharedBoardModal);
    document.getElementById('createSharedBoardModalClose')?.addEventListener('click', closeCreateSharedBoardModal);
    document.getElementById('createSharedBoardCancelBtn')?.addEventListener('click', closeCreateSharedBoardModal);

    document.getElementById('createSharedBoardSubmitBtn')?.addEventListener('click', async () => {
        const boardName = (newSharedBoardNameInput?.value || '').trim();
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        if (!boardName) { t('Please enter a board name', 'error'); return; }
        const submitBtn = document.getElementById('createSharedBoardSubmitBtn');
        submitBtn.disabled = true; submitBtn.textContent = 'Creating...';
        try {
            const res = await API.post(`/recruiting-board/groups/${currentSharedGroupId}/boards`, { boardName });
            const newBoard = res.board;
            groupBoards.push(newBoard);
            // Hide the no-boards CTA, show the selector row
            if (sgNoBoardsState) sgNoBoardsState.style.display = 'none';
            document.body.classList.remove('rb-shared-no-boards');
            if (sgBoardSelectorRow) sgBoardSelectorRow.style.display = 'flex';
            renderSharedBoardSelector();
            sharedBoardSelect.value = newBoard.id;
            closeCreateSharedBoardModal();
            await loadSharedGroupBoard(newBoard.id);
            t('Board created');
        } catch (err) {
            console.error('Error creating shared board:', err);
            t(err.error || 'Failed to create board', 'error');
        } finally {
            submitBtn.disabled = false; submitBtn.textContent = 'Create Board';
        }
    });

    const deleteSharedBoardModal = document.getElementById('deleteSharedBoardModal');

    function openDeleteSharedBoardModal() {
        if (!currentSharedGroupId || !currentSharedBoardId) return;
        const board = groupBoards.find(b => b.id === currentSharedBoardId);
        document.getElementById('deleteSharedBoardName').textContent = board ? board.board_name : '';
        if (deleteSharedBoardModal) deleteSharedBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDeleteSharedBoardModal() {
        if (deleteSharedBoardModal) deleteSharedBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (deleteSharedBoardBtn) deleteSharedBoardBtn.addEventListener('click', openDeleteSharedBoardModal);
    document.getElementById('deleteSharedBoardModalOverlay')?.addEventListener('click', closeDeleteSharedBoardModal);
    document.getElementById('deleteSharedBoardModalClose')?.addEventListener('click', closeDeleteSharedBoardModal);
    document.getElementById('deleteSharedBoardCancelBtn')?.addEventListener('click', closeDeleteSharedBoardModal);

    document.getElementById('deleteSharedBoardSubmitBtn')?.addEventListener('click', async () => {
        if (!currentSharedGroupId || !currentSharedBoardId) return;
        const t = (typeof window.showToast === 'function') ? window.showToast : showToast;
        const submitBtn = document.getElementById('deleteSharedBoardSubmitBtn');
        submitBtn.disabled = true; submitBtn.textContent = 'Deleting...';
        try {
            const deletedId = currentSharedBoardId;
            await API.delete(`/recruiting-board/groups/${currentSharedGroupId}/boards/${deletedId}`);
            groupBoards = groupBoards.filter(b => b.id !== deletedId);
            localStorage.removeItem(`lastViewedSharedBoardId_${currentSharedGroupId}`);
            closeDeleteSharedBoardModal();
            renderSharedBoardSelector();
            if (groupBoards.length === 0) {
                if (sgBoardSelectorRow) sgBoardSelectorRow.style.display = 'none';
                if (sgNoBoardsState) {
                    sgNoBoardsState.style.display = 'flex';
                    const cf = document.getElementById('sgCreateFirstBoardBtn');
                    if (cf) cf.style.display = currentSharedGroupPermission === 'editor' ? '' : 'none';
                }
                document.body.classList.add('rb-shared-no-boards');
                document.getElementById('offenseField').innerHTML = '';
                document.getElementById('defenseField').innerHTML = '';
            } else {
                sharedBoardSelect.value = groupBoards[0].id;
                await loadSharedGroupBoard(groupBoards[0].id);
            }
            t('Board deleted');
        } catch (err) {
            t(err.error || 'Failed to delete board', 'error');
        } finally {
            submitBtn.disabled = false; submitBtn.textContent = 'Delete Board';
        }
    });

    // Load players for current board
    async function loadPlayersForBoard(classYear) {
        try {
            // Clear existing players
            document.querySelectorAll('.recruits-list').forEach(list => {
                list.innerHTML = '';
            });

            let playersData;
            if (currentBoardMode === 'personal') {
                if (!currentPersonalBoardId) return;
                playersData = await API.get(`/recruiting-board/personal/${currentPersonalBoardId}/players`);
            } else if (currentBoardMode === 'group') {
                if (!currentSharedGroupId || !currentSharedBoardId) return;
                playersData = await API.get(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/players`);
            }

            loadPlayersIntoBoard(playersData || []);
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    // Update UI based on current board
    function updateBoardUI(_boardData = null) {
        // Per-mode UI is handled elsewhere now: personal-mode by hide/show in
        // loadPersonalBoardById, group-mode by applySharedPermissionToUI. Kept
        // as a no-op shell so legacy call sites don't blow up.
    }

    // Load players into the board based on their positions
    function loadPlayersIntoBoard(players) {
        players.forEach(player => {
            const position = player.position;
            const recruitsList = document.querySelector(`.recruits-list[data-position="${position}"]`);

            if (recruitsList) {
                const playerCard = createPlayerCard(player);
                recruitsList.appendChild(playerCard);
            }
        });

        // Update rankings after loading
        document.querySelectorAll('.recruits-list').forEach(list => {
            updateRankings(list);
        });
    }

    // Lightweight player-only refresh. Re-fetches players for the currently-
    // loaded board (matching targetBoardId) and re-mounts cards into existing
    // .recruits-list nodes. Does NOT call renderBoard, does NOT touch body
    // classes (lesson learned: prior loadSharedGroupBoard call from the
    // Final Grade save path leaked field visibility into the pipeline
    // subtab). Safe to call from any subtab — only mutates .recruits-list
    // children inside the football field. If the user has switched to a
    // different board since the patch was issued, no-ops cleanly.
    async function refreshOnBoardPlayersOnly(targetBoardId) {
        if (!targetBoardId) return;
        try {
            let playersData;
            if (currentBoardMode === 'personal') {
                if (currentPersonalBoardId !== targetBoardId) return;
                playersData = await API.get(`/recruiting-board/personal/${targetBoardId}/players`);
            } else if (currentBoardMode === 'group') {
                if (currentSharedBoardId !== targetBoardId) return;
                if (!currentSharedGroupId) return;
                playersData = await API.get(`/recruiting-board/groups/${currentSharedGroupId}/boards/${targetBoardId}/players`);
            } else {
                return;
            }
            document.querySelectorAll('.football-field .recruits-list').forEach(list => {
                list.innerHTML = '';
            });
            loadPlayersIntoBoard(playersData || []);
            if (currentBoardMode === 'group' && typeof applySharedPermissionToUI === 'function') {
                applySharedPermissionToUI();
            }
        } catch (err) {
            console.error('refreshOnBoardPlayersOnly failed:', err);
            // Silent fallback — the synchronous DOM patch already happened.
        }
    }

    // Patch an on-board card's color swatch + grade pill in place. Called
    // from saveFinalGradeFromModal so the info modal's "source of truth"
    // edit is reflected on the football-field card without a board reload.
    // Matches via data-player-id + data-position so the right copy of the
    // recruit is updated when the same player sits at multiple positions.
    // playerIdAlt is the secondary identifier (e.g. user_id when playerId
    // is pool_entry_id, or vice versa) — used as a fallback when the primary
    // identifier doesn't match. Some recruits exist in DB with BOTH ids
    // (pool entry that's been linked to a DR account), and the on-board
    // card may have stored a different one than the modal's playerId.
    function updateBoardCardFinalDisplay(playerId, position, finalGrade, finalColorTag, playerIdAlt) {
        if (!playerId || !position) return;
        let cards = document.querySelectorAll(
            `.recruit-card[data-player-id="${playerId}"][data-position="${position}"]`
        );
        if (!cards.length && playerIdAlt) {
            cards = document.querySelectorAll(
                `.recruit-card[data-player-id="${playerIdAlt}"][data-position="${position}"]`
            );
        }
        if (!cards.length) return;
        const finalColorHex = COLOR_HEX[finalColorTag] || null;
        const hasColor = !!finalColorHex;
        cards.forEach(card => {
            // Swatch — leftmost vertical bar
            const swatch = card.querySelector('.recruit-final-color');
            if (swatch) {
                if (hasColor) {
                    swatch.classList.remove('recruit-final-color-empty');
                    swatch.setAttribute('data-color', finalColorTag);
                    swatch.style.background = finalColorHex;
                    swatch.setAttribute('title', `Final color: ${finalColorTag.replace('_', ' ')}`);
                } else {
                    swatch.classList.add('recruit-final-color-empty');
                    swatch.setAttribute('data-color', '');
                    swatch.style.background = '';
                    swatch.setAttribute('title', 'No final color set');
                }
            }
            // Grade pill — rightmost badge. Add/remove/update depending on
            // whether finalGrade is set.
            let pill = card.querySelector('.recruit-final-grade');
            if (Number.isFinite(finalGrade)) {
                if (!pill) {
                    pill = document.createElement('span');
                    pill.className = 'recruit-final-grade';
                    pill.setAttribute('title', 'Final grade');
                    card.appendChild(pill);
                }
                pill.textContent = String(finalGrade);
                if (hasColor) {
                    pill.style.background = finalColorHex;
                    pill.style.color = gradePillTextColor(finalColorHex);
                } else {
                    pill.style.background = '';
                    pill.style.color = '';
                }
            } else if (pill) {
                pill.remove();
            }
        });
    }

    // Create a player card element
    function createPlayerCard(player) {
        const card = document.createElement('div');
        card.className = 'recruit-card';
        card.draggable = true;
        // Use user_id when present (DR-account recruit), fall back to
        // pool_entry_id for questionnaire-only recruits. The remove + move
        // routes accept either UUID and match against both fields.
        card.dataset.playerId = player.user_id || player.pool_entry_id || '';
        card.dataset.playerType = player.player_type;
        card.dataset.position = player.position;
        card.dataset.username = player.username || '';
        card.dataset.source = player.source || (player.user_id ? 'dr_profile' : 'questionnaire');

        // Determine styling based on player type
        const isTransfer = player.player_type === 'transfer';
        const cardClass = isTransfer ? 'transfer-player' : 'hs-player';
        card.classList.add(cardClass);
        if (!player.user_id) card.classList.add('questionnaire-only');

        // Format height
        let heightDisplay = '';
        if (player.height) {
            if (typeof player.height === 'number') {
                const feet = Math.floor(player.height / 12);
                const inches = player.height % 12;
                heightDisplay = `${feet}'${inches}"`;
            } else {
                heightDisplay = player.height;
            }
        }

        const nameLine = `${player.first_name} ${player.last_name}`;
        const physicalLine = [heightDisplay, player.weight ? `${player.weight} lbs` : ''].filter(Boolean).join(' • ');

        // Final synthesis: color swatch sits on the leftmost edge of the card
        // (vertical bar style matching the pipeline-card swatch convention).
        // Empty swatch when no color set keeps card layout consistent.
        const finalColorHex = COLOR_HEX[player.final_color_tag] || null;
        const finalColorHtml = finalColorHex
            ? `<span class="recruit-final-color" data-color="${player.final_color_tag}" style="background:${finalColorHex};" title="Final color: ${player.final_color_tag.replace('_', ' ')}"></span>`
            : '<span class="recruit-final-color recruit-final-color-empty" data-color="" title="No final color set"></span>';
        // Grade badge background mirrors the final color so the at-a-glance read
        // is consistent (color stripe + grade pill = one signal). gradePillTextColor
        // picks black-on-light / white-on-dark for readability across the 6 tokens.
        let finalGradeHtml = '';
        if (Number.isFinite(player.final_grade)) {
            const gradeStyle = finalColorHex
                ? `style="background:${finalColorHex}; color:${gradePillTextColor(finalColorHex)};"`
                : '';
            finalGradeHtml = `<span class="recruit-final-grade" ${gradeStyle} title="Final grade">${player.final_grade}</span>`;
        }

        card.innerHTML = `
            ${finalColorHtml}
            <div class="recruit-info">
                <div class="recruit-name">${nameLine}</div>
                <div class="recruit-details">${physicalLine}</div>
            </div>
            ${finalGradeHtml}
        `;

        // Add drag listeners (desktop)
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        // Add touch drag listeners (mobile)
        initTouchDragForCard(card);

        // Add click to show context menu
        card.addEventListener('click', (e) => {
            if (!card.classList.contains('dragging') && !touchDragJustEnded) {
                e.stopPropagation();
                showPlayerContextMenu(card, player);
            }
        });

        return card;
    }

    // Show context menu for player card
    function showPlayerContextMenu(card, player) {
        const existingMenu = document.querySelector('.player-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'player-context-menu';
        // Two actions only: Show Info (opens the on-board Info modal) and
        // Remove from Board (with confirmation). Remove is hidden for shared-
        // board viewers — the backend route is gated on requireGroupAccess
        // ('editor') so they couldn't actually remove anyway.
        const isSharedViewer = currentBoardMode === 'shared'
            && currentSharedGroupPermission === 'viewer';
        const removeHtml = isSharedViewer ? '' : `
            <button class="context-menu-item delete-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Remove from Board
            </button>`;
        menu.innerHTML = `
            <button class="context-menu-item show-info-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Show Info
            </button>
            ${removeHtml}
        `;

        // Position the menu relative to the card
        const positionMenu = () => {
            const cardRect = card.getBoundingClientRect();
            const menuHeight = menu.offsetHeight || 150; // Estimate if not yet rendered
            const viewportHeight = window.innerHeight;

            // Check if menu would go below viewport
            let top = cardRect.bottom + 5;
            if (top + menuHeight > viewportHeight) {
                // Position above the card instead
                top = cardRect.top - menuHeight - 5;
            }

            menu.style.top = `${top}px`;
            menu.style.left = `${cardRect.left}px`;
        };

        menu.style.position = 'fixed';
        menu.style.zIndex = '1000';

        document.body.appendChild(menu);
        positionMenu();

        // Update position on scroll. Walk up from the card and attach to
        // every scrollable ancestor so the menu tracks the card when any
        // container scrolls — including the horizontal scroll on
        // .football-field (the position-columns row), the vertical scroll
        // on individual .position-column lists, and the page itself.
        const collectScrollContainers = (startEl) => {
            const containers = [];
            const seen = new Set();
            let el = startEl ? startEl.parentElement : null;
            while (el && el !== document.body) {
                if (seen.has(el)) break;
                seen.add(el);
                const style = window.getComputedStyle(el);
                const ox = style.overflowX;
                const oy = style.overflowY;
                if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') {
                    containers.push(el);
                }
                el = el.parentElement;
            }
            containers.push(window);
            return containers;
        };
        const scrollContainers = collectScrollContainers(card);

        // Declared up here so handleScroll can call cleanupMenu directly when
        // the card scrolls out of view. scrollContainers must already exist
        // (the cleanup needs to remove every listener it added).
        const cleanupMenu = () => {
            menu.remove();
            scrollContainers.forEach(container => {
                container.removeEventListener('scroll', handleScroll);
            });
        };

        const handleScroll = () => {
            // If the card has scrolled out of view of any ancestor scroll
            // container, close the menu (don't try to track an invisible card).
            const cardRect = card.getBoundingClientRect();
            for (const container of scrollContainers) {
                if (container === window) continue;
                const cRect = container.getBoundingClientRect();
                const offBottom = cardRect.bottom < cRect.top;
                const offTop    = cardRect.top    > cRect.bottom;
                const offRight  = cardRect.right  < cRect.left;
                const offLeft   = cardRect.left   > cRect.right;
                if (offBottom || offTop || offRight || offLeft) {
                    cleanupMenu();
                    return;
                }
            }
            positionMenu();
        };

        scrollContainers.forEach(container => {
            container.addEventListener('scroll', handleScroll, { passive: true });
        });

        const showInfoBtn = menu.querySelector('.show-info-btn');
        if (showInfoBtn) showInfoBtn.addEventListener('click', () => {
            cleanupMenu();
            // Sync player.position from the card's CURRENT DOM container before
            // opening the modal — the captured player object in this closure
            // can be stale after a drag (handleDrop updates the DOM dataset
            // but not the in-memory player). Without this, the PUT /…/final
            // route 404s with "Player not found in specified position".
            const livePosition = (card.parentElement && card.parentElement.dataset && card.parentElement.dataset.position) || player.position;
            player.position = livePosition;
            openBoardPlayerInfoModal(player);
        });

        const deleteBtn = menu.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', () => {
            cleanupMenu();
            // Same drag-sync rationale as Show Info: ensure remove targets the
            // current on-board position, not a stale closure value.
            const livePosition = (card.parentElement && card.parentElement.dataset && card.parentElement.dataset.position) || player.position;
            player.position = livePosition;
            showRemoveConfirmModal(player, card);
        });

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !card.contains(e.target)) {
                menu.remove();
                scrollContainers.forEach(container => {
                    container.removeEventListener('scroll', handleScroll);
                });
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    // ==================== Remove Player Modal ====================
    let cardToRemove = null;
    const removeModal = document.getElementById('removeRecruitingBoardModal');
    const removeModalOverlay = document.getElementById('removeRecruitingBoardModalOverlay');
    const removeModalClose = document.getElementById('removeRecruitingBoardModalClose');
    const removeModalCancel = document.getElementById('removeRecruitingBoardCancelBtn');
    const removeModalSubmit = document.getElementById('removeRecruitingBoardSubmitBtn');
    const removeConfirmText = document.getElementById('removeConfirmText');
    const removeBoardInfo = document.getElementById('removeBoardInfo');

    function closeRemoveModal() {
        removeModal.classList.remove('active');
        document.body.style.overflow = '';
        cardToRemove = null;
    }

    if (removeModalOverlay) removeModalOverlay.addEventListener('click', closeRemoveModal);
    if (removeModalClose) removeModalClose.addEventListener('click', closeRemoveModal);
    if (removeModalCancel) removeModalCancel.addEventListener('click', closeRemoveModal);

    if (removeModalSubmit) {
        removeModalSubmit.addEventListener('click', async () => {
            if (!cardToRemove) return;

            removeModalSubmit.disabled = true;
            removeModalSubmit.textContent = 'Removing...';

            try {
                const playerId = cardToRemove.dataset.playerId;
                const position = cardToRemove.dataset.position;

                if (currentBoardMode === 'personal') {
                    await API.delete(`/recruiting-board/personal/${currentPersonalBoardId}/players/${playerId}?position=${position}`);
                } else if (currentBoardMode === 'group') {
                    await API.delete(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/players/${playerId}?position=${position}`);
                }

                cardToRemove.remove();
                const parentList = document.querySelector(`.recruits-list[data-position="${position}"]`);
                if (parentList) {
                    updateRankings(parentList);
                }
                closeRemoveModal();
            } catch (error) {
                console.error('Error removing player:', error);
                removeConfirmText.innerHTML = '<strong style="color: #ef4444;">Error:</strong> Failed to remove player from board. Please try again.';
                removeBoardInfo.textContent = '';
            } finally {
                removeModalSubmit.disabled = false;
                removeModalSubmit.textContent = 'Remove';
            }
        });
    }

    function showRemoveConfirmModal(player, card) {
        const playerName = `${player.first_name} ${player.last_name}`;
        const position = card.dataset.position;

        cardToRemove = card;
        removeConfirmText.innerHTML = `Are you sure you want to remove <strong>${playerName}</strong> from the recruiting board?`;
        if (currentBoardMode === 'personal') {
            const board = personalBoards.find(b => b.id === currentPersonalBoardId);
            removeBoardInfo.textContent = `${board ? board.board_name : 'Personal Board'} • ${position}`;
        } else if (currentBoardMode === 'group') {
            const groupBoard = groupBoards.find(b => b.id === currentSharedBoardId);
            const label = groupBoard
                ? `${groupBoard.board_name}${currentSharedGroupName ? ' (' + currentSharedGroupName + ')' : ''}`
                : 'Shared Board';
            removeBoardInfo.textContent = `${label} • ${position}`;
        } else {
            removeBoardInfo.textContent = position;
        }

        removeModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // ==================== Move Player Modal ====================
    let playerToMove = null;
    let cardToMove = null;
    let moveTargetBoards = [];
    let movePositionConfigs = {};

    const moveModal = document.getElementById('movePlayerModal');
    const moveModalOverlay = document.getElementById('movePlayerModalOverlay');
    const moveModalClose = document.getElementById('movePlayerModalClose');
    const moveModalCancel = document.getElementById('movePlayerCancelBtn');
    const moveModalSubmit = document.getElementById('movePlayerSubmitBtn');
    const movePlayerName = document.getElementById('movePlayerName');
    const moveTargetBoardSelect = document.getElementById('moveTargetBoard');
    const moveTargetPositionSelect = document.getElementById('moveTargetPosition');
    const copyInsteadOfMoveCheckbox = document.getElementById('copyInsteadOfMove');
    const moveModalTitle = document.getElementById('moveModalTitle');

    function closeMoveModal() {
        if (moveModal) {
            moveModal.classList.remove('active');
            moveModal.classList.remove('copy-mode');
            document.body.style.overflow = '';
            playerToMove = null;
            cardToMove = null;
            if (copyInsteadOfMoveCheckbox) copyInsteadOfMoveCheckbox.checked = false;
            updateMoveModalUI();
        }
    }

    // Update UI when copy checkbox changes
    function updateMoveModalUI() {
        const isCopyMode = copyInsteadOfMoveCheckbox && copyInsteadOfMoveCheckbox.checked;
        if (moveModal) {
            if (isCopyMode) {
                moveModal.classList.add('copy-mode');
            } else {
                moveModal.classList.remove('copy-mode');
            }
        }
        if (moveModalTitle) {
            moveModalTitle.textContent = isCopyMode ? 'Copy to Another Board' : 'Move to Another Board';
        }
        if (moveModalSubmit) {
            moveModalSubmit.textContent = isCopyMode ? 'Copy Player' : 'Move Player';
        }
    }

    if (copyInsteadOfMoveCheckbox) {
        copyInsteadOfMoveCheckbox.addEventListener('change', updateMoveModalUI);
    }

    if (moveModalOverlay) moveModalOverlay.addEventListener('click', closeMoveModal);
    if (moveModalClose) moveModalClose.addEventListener('click', closeMoveModal);
    if (moveModalCancel) moveModalCancel.addEventListener('click', closeMoveModal);

    // Populate positions dropdown based on selected board
    async function loadMovePositions(boardId, boardType) {
        moveTargetPositionSelect.innerHTML = '<option value="">Loading positions...</option>';

        try {
            let config;
            if (boardType === 'personal') {
                const cacheKey = `personal:${boardId}`;
                if (movePositionConfigs[cacheKey]) {
                    config = movePositionConfigs[cacheKey];
                } else {
                    config = await API.get(`/recruiting-board/personal/${boardId}/config`);
                    movePositionConfigs[cacheKey] = config;
                }
            } else if (boardType === 'group') {
                const cacheKey = `group:${boardId}`;
                if (movePositionConfigs[cacheKey]) {
                    config = movePositionConfigs[cacheKey];
                } else {
                    // Find the groupId for this target board
                    const target = moveTargetBoards.find(b => b.id === boardId);
                    if (!target || !target.groupId) {
                        moveTargetPositionSelect.innerHTML = '<option value="">Unknown board</option>';
                        return;
                    }
                    config = await API.get(`/recruiting-board/groups/${target.groupId}/boards/${boardId}/config`);
                    movePositionConfigs[cacheKey] = config;
                }
            }

            // Populate positions
            moveTargetPositionSelect.innerHTML = '<option value="">Select Position</option>';
            const allPositions = [];

            if (config.offensePositions) {
                config.offensePositions.forEach(group => {
                    if (group.positions) {
                        group.positions.forEach(pos => allPositions.push(pos));
                    }
                });
            }
            if (config.defensePositions) {
                config.defensePositions.forEach(group => {
                    if (group.positions) {
                        group.positions.forEach(pos => allPositions.push(pos));
                    }
                });
            }

            const uniquePositions = [...new Set(allPositions)];
            uniquePositions.forEach(pos => {
                const option = document.createElement('option');
                option.value = pos;
                option.textContent = pos;
                moveTargetPositionSelect.appendChild(option);
            });

            if (uniquePositions.length === 0) {
                moveTargetPositionSelect.innerHTML = '<option value="">No positions configured</option>';
            }
        } catch (error) {
            console.error('Error loading positions for move:', error);
            moveTargetPositionSelect.innerHTML = '<option value="">Error loading positions</option>';
        }

        updateMoveSubmitState();
    }

    // Handle board selection change
    if (moveTargetBoardSelect) {
        moveTargetBoardSelect.addEventListener('change', async () => {
            const selectedValue = moveTargetBoardSelect.value;

            if (!selectedValue) {
                moveTargetPositionSelect.innerHTML = '<option value="">Select a board first</option>';
                updateMoveSubmitState();
                return;
            }

            const selectedBoard = moveTargetBoards.find(b => b.id === selectedValue);
            if (selectedBoard) {
                await loadMovePositions(selectedBoard.id, selectedBoard.type);
            }
        });
    }

    if (moveTargetPositionSelect) {
        moveTargetPositionSelect.addEventListener('change', updateMoveSubmitState);
    }

    function updateMoveSubmitState() {
        if (moveModalSubmit) {
            moveModalSubmit.disabled = !moveTargetBoardSelect.value || !moveTargetPositionSelect.value;
        }
    }

    // Submit move/copy player
    if (moveModalSubmit) {
        moveModalSubmit.addEventListener('click', async () => {
            if (!playerToMove || !cardToMove) return;

            const targetBoardId = moveTargetBoardSelect.value;
            const targetPosition = moveTargetPositionSelect.value;
            const targetBoard = moveTargetBoards.find(b => b.id === targetBoardId);
            const isCopyMode = copyInsteadOfMoveCheckbox && copyInsteadOfMoveCheckbox.checked;

            if (!targetBoard || !targetPosition) {
                showToast('Please select a board and position', 'error');
                return;
            }

            moveModalSubmit.disabled = true;
            moveModalSubmit.textContent = isCopyMode ? 'Copying...' : 'Moving...';

            try {
                const sourcePosition = cardToMove.dataset.position;
                const playerId = cardToMove.dataset.playerId;

                // If not copy mode, remove from current board first
                if (!isCopyMode) {
                    if (currentBoardMode === 'personal') {
                        await API.delete(`/recruiting-board/personal/${currentPersonalBoardId}/players/${playerId}?position=${sourcePosition}`);
                    } else if (currentBoardMode === 'group') {
                        await API.delete(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/players/${playerId}?position=${sourcePosition}`);
                    }
                }

                // Build player data for target board
                const playerData = {
                    user_id: playerToMove.user_id,
                    username: playerToMove.username,
                    first_name: playerToMove.first_name,
                    last_name: playerToMove.last_name,
                    height: playerToMove.height,
                    weight: playerToMove.weight,
                    team_name: playerToMove.team_name,
                    state: playerToMove.state,
                    college_division: playerToMove.college_division,
                    profile_image_url: playerToMove.profile_image_url,
                    player_type: playerToMove.player_type,
                    position: targetPosition
                };

                // Add to target board
                if (targetBoard.type === 'personal') {
                    await API.post(`/recruiting-board/personal/${targetBoard.id}/players`, playerData);
                } else if (targetBoard.type === 'group') {
                    await API.post(`/recruiting-board/groups/${targetBoard.groupId}/boards/${targetBoard.id}/players`, playerData);
                }

                // If move mode (not copy), remove the card from current view
                if (!isCopyMode) {
                    cardToMove.remove();
                    const parentList = document.querySelector(`.recruits-list[data-position="${sourcePosition}"]`);
                    if (parentList) {
                        updateRankings(parentList);
                    }
                    showToast(`${playerToMove.first_name} ${playerToMove.last_name} moved to ${targetBoard.name}`, 'success');
                } else {
                    showToast(`${playerToMove.first_name} ${playerToMove.last_name} copied to ${targetBoard.name}`, 'success');
                }

                closeMoveModal();
            } catch (error) {
                console.error('Error moving/copying player:', error);
                showToast(error.message || `Failed to ${isCopyMode ? 'copy' : 'move'} player`, 'error');
            } finally {
                moveModalSubmit.disabled = false;
                const isCopyModeNow = copyInsteadOfMoveCheckbox && copyInsteadOfMoveCheckbox.checked;
                moveModalSubmit.textContent = isCopyModeNow ? 'Copy Player' : 'Move Player';
            }
        });
    }

    async function showMovePlayerModal(player, card) {
        playerToMove = player;
        cardToMove = card;

        const playerFullName = `${player.first_name} ${player.last_name}`;
        const sourcePosition = card.dataset.position;

        if (movePlayerName) {
            let sourceName = '';
            if (currentBoardMode === 'personal') {
                const board = personalBoards.find(b => b.id === currentPersonalBoardId);
                sourceName = board ? board.board_name : 'Personal Board';
            } else if (currentBoardMode === 'group') {
                const board = groupBoards.find(b => b.id === currentSharedBoardId);
                sourceName = board
                    ? `${board.board_name}${currentSharedGroupName ? ' — ' + currentSharedGroupName : ''}`
                    : (currentSharedGroupName || 'Shared Board');
            }
            movePlayerName.innerHTML = `Move <strong>${playerFullName}</strong> from ${sourcePosition}${sourceName ? ' (' + sourceName + ')' : ''}`;
        }

        // Load available boards (exclude current board)
        moveTargetBoardSelect.innerHTML = '<option value="">Loading boards...</option>';
        moveTargetPositionSelect.innerHTML = '<option value="">Select a board first</option>';
        moveModalSubmit.disabled = true;

        try {
            moveTargetBoards = [];

            // Personal boards (every named personal board owned by the current coach,
            // excluding the source board if we're moving from personal mode).
            const personalRes = await API.get('/recruiting-board/personal');
            (personalRes.boards || []).forEach(board => {
                const isSource = currentBoardMode === 'personal' && board.id === currentPersonalBoardId;
                if (!isSource) {
                    moveTargetBoards.push({ id: board.id, name: board.board_name, type: 'personal' });
                }
            });

            // Group boards (only groups where the current coach has 'editor' permission,
            // excluding the source board if we're moving from group mode).
            const groupsRes = await API.get('/recruiting-board/groups');
            for (const g of (groupsRes.groups || [])) {
                if (g.my_permission !== 'editor') continue;
                try {
                    const gb = await API.get(`/recruiting-board/groups/${g.id}/boards`);
                    for (const b of (gb.boards || [])) {
                        const isSource = currentBoardMode === 'group' && b.id === currentSharedBoardId;
                        if (!isSource) {
                            moveTargetBoards.push({
                                id: b.id,
                                name: `${b.board_name} (${g.group_name})`,
                                type: 'group',
                                groupId: g.id
                            });
                        }
                    }
                } catch (e) { /* skip group on error */ }
            }

            moveTargetBoardSelect.innerHTML = '<option value="">Select a Board</option>';
            moveTargetBoards.forEach(board => {
                const option = document.createElement('option');
                option.value = board.id;
                option.textContent = board.name;
                moveTargetBoardSelect.appendChild(option);
            });
            if (moveTargetBoards.length === 0) {
                moveTargetBoardSelect.innerHTML = '<option value="">No other boards available</option>';
            }
        } catch (error) {
            console.error('Error loading boards for move:', error);
            moveTargetBoardSelect.innerHTML = '<option value="">Error loading boards</option>';
        }

        moveModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }


    // ==================== Toast Notification ====================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            padding: 1rem 1.5rem;
            background: ${type === 'error' ? '#ef4444' : 'var(--cerulean)'};
            color: white;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 2000;
            animation: slideUp 0.3s ease;
        `;
        toast.textContent = message;

        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==================== Board Rendering ====================
    // Renders three sections: Offense, Defense, Specs (Special Teams).
    // All three are populated identically — the toggle buttons control
    // visibility via the .hidden class on the field containers.
    function renderBoard(offensePositions, defensePositions, specsPositions) {
        const offenseField = document.getElementById('offenseField');
        const defenseField = document.getElementById('defenseField');
        const specsField = document.getElementById('specsField');

        offenseField.innerHTML = '';
        defenseField.innerHTML = '';
        if (specsField) specsField.innerHTML = '';

        offensePositions.forEach(groupConfig => {
            const group = document.createElement('div');
            group.className = `position-group ${groupConfig.group}`;

            groupConfig.positions.forEach(pos => {
                const slot = createPositionSlotFromConfig(pos);
                group.appendChild(slot);
            });

            offenseField.appendChild(group);
        });

        defensePositions.forEach(groupConfig => {
            const group = document.createElement('div');
            group.className = `position-group ${groupConfig.group}`;

            groupConfig.positions.forEach(pos => {
                const slot = createPositionSlotFromConfig(pos);
                group.appendChild(slot);
            });

            defenseField.appendChild(group);
        });

        if (specsField && Array.isArray(specsPositions)) {
            specsPositions.forEach(groupConfig => {
                const group = document.createElement('div');
                group.className = `position-group ${groupConfig.group}`;

                groupConfig.positions.forEach(pos => {
                    const slot = createPositionSlotFromConfig(pos);
                    group.appendChild(slot);
                });

                specsField.appendChild(group);
            });
        }

        document.querySelectorAll('.recruits-list').forEach(list => {
            initDragDropForList(list);
        });

        setTimeout(initAllColumnDragDrop, 100);
    }

    function createPositionSlotFromConfig(positionName) {
        const slot = document.createElement('div');
        slot.className = 'position-slot';
        slot.dataset.position = positionName;

        slot.innerHTML = `
            <input type="text" class="position-label-input" value="${positionName}" maxlength="10" placeholder="Position">
            <div class="recruits-list" data-position="${positionName}"></div>
        `;

        const input = slot.querySelector('.position-label-input');

        input.addEventListener('change', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        input.addEventListener('blur', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        input.addEventListener('focus', function() {
            this.select();
        });

        return slot;
    }

    // ==================== Column Drag-Drop ====================
    let draggedColumn = null;
    let columnSourceGroup = null;

    function initAllColumnDragDrop() {
        document.querySelectorAll('.position-slot').forEach(slot => {
            slot.classList.add('draggable');
            slot.draggable = true;
            slot.removeEventListener('dragstart', handleColumnDragStart);
            slot.removeEventListener('dragend', handleColumnDragEnd);
            slot.removeEventListener('dragover', handleColumnDragOver);
            slot.removeEventListener('dragenter', handleColumnDragEnter);
            slot.removeEventListener('dragleave', handleColumnDragLeave);
            slot.removeEventListener('drop', handleColumnDrop);
            slot.addEventListener('dragstart', handleColumnDragStart);
            slot.addEventListener('dragend', handleColumnDragEnd);
            slot.addEventListener('dragover', handleColumnDragOver);
            slot.addEventListener('dragenter', handleColumnDragEnter);
            slot.addEventListener('dragleave', handleColumnDragLeave);
            slot.addEventListener('drop', handleColumnDrop);
        });
        // Add touch drag listeners for mobile
        initTouchDragForColumns();
    }

    function handleColumnDragStart(e) {
        if (e.target.classList.contains('position-label-input') ||
            e.target.closest('.recruit-card')) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        draggedColumn = this;
        columnSourceGroup = this.parentElement;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'column');
    }

    function handleColumnDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.position-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        draggedColumn = null;
        columnSourceGroup = null;
    }

    function handleColumnDragOver(e) {
        if (!draggedColumn) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleColumnDragEnter(e) {
        if (!draggedColumn || this === draggedColumn) return;
        if (this.parentElement === columnSourceGroup) {
            this.classList.add('drag-over');
        }
    }

    function handleColumnDragLeave(e) {
        if (e.target === this) {
            this.classList.remove('drag-over');
        }
    }

    function handleColumnDrop(e) {
        if (!draggedColumn || this === draggedColumn) return;
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');

        if (this.parentElement !== columnSourceGroup) return;

        const group = this.parentElement;
        const slots = Array.from(group.querySelectorAll('.position-slot'));
        const fromIndex = slots.indexOf(draggedColumn);
        const toIndex = slots.indexOf(this);

        if (fromIndex < toIndex) {
            group.insertBefore(draggedColumn, this.nextSibling);
        } else {
            group.insertBefore(draggedColumn, this);
        }

        scheduleSave();
    }

    // ==================== Board Configuration ====================
    function getBoardConfiguration() {
        const offenseField = document.getElementById('offenseField');
        const defenseField = document.getElementById('defenseField');
        const specsField = document.getElementById('specsField');

        const offensePositions = [];
        offenseField.querySelectorAll('.position-group').forEach(group => {
            const groupClass = Array.from(group.classList).find(c => c !== 'position-group') || 'custom-group';
            const positions = Array.from(group.querySelectorAll('.position-label-input')).map(input => input.value);
            offensePositions.push({ group: groupClass, positions });
        });

        const defensePositions = [];
        defenseField.querySelectorAll('.position-group').forEach(group => {
            const groupClass = Array.from(group.classList).find(c => c !== 'position-group') || 'custom-group';
            const positions = Array.from(group.querySelectorAll('.position-label-input')).map(input => input.value);
            defensePositions.push({ group: groupClass, positions });
        });

        const specsPositions = [];
        if (specsField) {
            specsField.querySelectorAll('.position-group').forEach(group => {
                const groupClass = Array.from(group.classList).find(c => c !== 'position-group') || 'custom-group';
                const positions = Array.from(group.querySelectorAll('.position-label-input')).map(input => input.value);
                specsPositions.push({ group: groupClass, positions });
            });
        }

        return { offensePositions, defensePositions, specsPositions };
    }

    async function saveBoardConfiguration() {
        const config = getBoardConfiguration();

        try {
            if (currentBoardMode === 'personal') {
                if (!currentPersonalBoardId) return;
                await API.put(`/recruiting-board/personal/${currentPersonalBoardId}/config`, config);
            } else if (currentBoardMode === 'group') {
                if (!currentSharedGroupId || !currentSharedBoardId) return;
                await API.put(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/config`, config);
            }
            hasUnsavedChanges = false;
        } catch (error) {
            console.error('Error saving board configuration:', error);
        }
    }

    function scheduleSave() {
        hasUnsavedChanges = true;
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(saveBoardConfiguration, 500);
    }

    // ==================== Toggle Offense/Defense/Specs ====================
    // Three mutually-exclusive sections — Offense (default), Defense, Specs
    // (Special Teams). Only one field visible at a time; the others get the
    // .hidden class. localStorage remembers the last-viewed side. Each click
    // also exits remove-mode for safety.
    const offenseBtn = document.getElementById('offenseBtn');
    const defenseBtn = document.getElementById('defenseBtn');
    const specsBtn = document.getElementById('specsBtn');
    const offenseField = document.getElementById('offenseField');
    const defenseField = document.getElementById('defenseField');
    const specsField = document.getElementById('specsField');

    function activateBoardSide(side) {
        const sides = [
            { side: 'offense', btn: offenseBtn, field: offenseField },
            { side: 'defense', btn: defenseBtn, field: defenseField },
            { side: 'specs',   btn: specsBtn,   field: specsField   }
        ];
        sides.forEach(s => {
            if (!s.btn || !s.field) return;
            if (s.side === side) {
                s.btn.classList.add('active');
                s.field.classList.remove('hidden');
            } else {
                s.btn.classList.remove('active');
                s.field.classList.add('hidden');
            }
        });
        localStorage.setItem('lastViewedRecruitingBoardSide', side);
        exitRemoveMode();
    }

    // Restore last viewed side from localStorage (offense is the default; only
    // need to act on non-default values since offense is active in the markup).
    const lastViewedSide = localStorage.getItem('lastViewedRecruitingBoardSide');
    if (lastViewedSide === 'defense' || lastViewedSide === 'specs') {
        activateBoardSide(lastViewedSide);
    }

    if (offenseBtn) offenseBtn.addEventListener('click', () => activateBoardSide('offense'));
    if (defenseBtn) defenseBtn.addEventListener('click', () => activateBoardSide('defense'));
    if (specsBtn)   specsBtn.addEventListener('click',   () => activateBoardSide('specs'));

    // ==================== Position Management ====================
    const addPositionBtn = document.getElementById('addPositionBtn');
    const removePositionBtn = document.getElementById('removePositionBtn');
    const removeModeIndicator = document.getElementById('removeModeIndicator');
    let isRemoveMode = false;
    let positionCounter = 0;

    function getActiveField() {
        if (!offenseField.classList.contains('hidden')) return offenseField;
        if (!defenseField.classList.contains('hidden')) return defenseField;
        return specsField;
    }

    function createPositionSlot(positionName = 'NEW') {
        positionCounter++;
        const uniqueId = `pos-${Date.now()}-${positionCounter}`;

        const slot = document.createElement('div');
        slot.className = 'position-slot';
        slot.dataset.position = uniqueId;

        slot.innerHTML = `
            <input type="text" class="position-label-input" value="${positionName}" maxlength="10" placeholder="Position">
            <div class="recruits-list" data-position="${uniqueId}"></div>
        `;

        const input = slot.querySelector('.position-label-input');
        input.addEventListener('change', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        input.addEventListener('blur', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        input.addEventListener('focus', function() {
            this.select();
        });

        if (isRemoveMode) {
            slot.classList.add('remove-mode');
            slot.addEventListener('click', handlePositionRemove);
        }

        return slot;
    }

    addPositionBtn.addEventListener('click', function() {
        const activeField = getActiveField();
        let lastGroup = activeField.querySelector('.position-group:last-child');

        if (!lastGroup) {
            lastGroup = document.createElement('div');
            lastGroup.className = 'position-group custom-group';
            activeField.appendChild(lastGroup);
        }

        const newSlot = createPositionSlot('NEW');
        lastGroup.appendChild(newSlot);

        const input = newSlot.querySelector('.position-label-input');
        input.focus();
        input.select();

        initDragDropForList(newSlot.querySelector('.recruits-list'));
        scheduleSave();
    });

    async function handlePositionRemove(e) {
        e.stopPropagation();
        const slot = e.currentTarget;

        const recruitsList = slot.querySelector('.recruits-list');
        const hasRecruits = recruitsList && recruitsList.children.length > 0;

        if (hasRecruits) {
            if (!(await showConfirmModal({ title: 'Remove Position', message: 'This position has recruits. Are you sure you want to remove it?', confirmText: 'Remove', cancelText: 'Cancel' }))) {
                return;
            }
        }

        slot.remove();

        const groups = document.querySelectorAll('.position-group');
        groups.forEach(group => {
            if (group.children.length === 0) {
                group.remove();
            }
        });

        scheduleSave();
    }

    function enterRemoveMode() {
        isRemoveMode = true;
        removePositionBtn.classList.add('active');
        removeModeIndicator.classList.remove('hidden');

        const activeField = getActiveField();
        const slots = activeField.querySelectorAll('.position-slot');
        slots.forEach(slot => {
            slot.classList.add('remove-mode');
            slot.addEventListener('click', handlePositionRemove);
        });
    }

    function exitRemoveMode() {
        isRemoveMode = false;
        removePositionBtn.classList.remove('active');
        removeModeIndicator.classList.add('hidden');

        const allSlots = document.querySelectorAll('.position-slot');
        allSlots.forEach(slot => {
            slot.classList.remove('remove-mode');
            slot.removeEventListener('click', handlePositionRemove);
        });
    }

    removePositionBtn.addEventListener('click', function() {
        if (isRemoveMode) {
            exitRemoveMode();
        } else {
            enterRemoveMode();
        }
    });

    // ==================== Drag and Drop for Player Cards ====================
    let draggedElement = null;
    let sourceContainer = null;

    function initDragDropForList(list) {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('drop', handleDrop);
        list.addEventListener('dragenter', handleDragEnter);
        list.addEventListener('dragleave', handleDragLeave);
    }

    function handleDragStart(e) {
        e.stopPropagation();
        draggedElement = this;
        sourceContainer = this.parentElement;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'player-card');
    }

    function handleDragEnd(e) {
        cleanupDragState();
    }

    function cleanupDragState() {
        document.querySelectorAll('.recruit-card.dragging').forEach(card => {
            card.classList.remove('dragging');
        });

        document.querySelectorAll('.recruits-list').forEach(list => {
            list.classList.remove('drag-over');
        });

        draggedElement = null;
        sourceContainer = null;
    }

    document.addEventListener('dragend', cleanupDragState);
    document.addEventListener('drop', function(e) {
        if (!e.target.closest('.recruits-list')) {
            cleanupDragState();
        }
    });
    document.addEventListener('mouseup', function() {
        setTimeout(cleanupDragState, 100);
    });

    function handleDragOver(e) {
        if (!draggedElement) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        if (draggedElement) {
            this.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !this.contains(relatedTarget)) {
            this.classList.remove('drag-over');
        }
    }

    function handleDrop(e) {
        if (!draggedElement) return false;

        e.stopPropagation();
        e.preventDefault();

        this.classList.remove('drag-over');

        const targetPosition = this.dataset.position;
        const sourcePosition = sourceContainer.dataset.position;
        const playerId = draggedElement.dataset.playerId;
        const afterElement = getDragAfterElement(this, e.clientY);

        if (afterElement == null) {
            this.appendChild(draggedElement);
        } else {
            this.insertBefore(draggedElement, afterElement);
        }

        if (targetPosition !== sourcePosition) {
            draggedElement.dataset.position = targetPosition;
            updatePlayerPosition(playerId, sourcePosition, targetPosition);
        }

        updateRankings(this);
        if (sourceContainer !== this) {
            updateRankings(sourceContainer);
        }

        return false;
    }

    async function updatePlayerPosition(playerId, oldPosition, newPosition) {
        try {
            if (currentBoardMode === 'personal') {
                if (!currentPersonalBoardId) return;
                await API.put(`/recruiting-board/personal/${currentPersonalBoardId}/players/${playerId}/position`, {
                    oldPosition, newPosition
                });
            } else if (currentBoardMode === 'group') {
                if (!currentSharedGroupId || !currentSharedBoardId) return;
                await API.put(`/recruiting-board/groups/${currentSharedGroupId}/boards/${currentSharedBoardId}/players/${playerId}/position`, {
                    oldPosition, newPosition
                });
            }
        } catch (error) {
            console.error('Error updating player position:', error);
        }
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.recruit-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateRankings(container) {
        const recruitCards = container.querySelectorAll('.recruit-card');
        recruitCards.forEach((card, index) => {
            const rankElement = card.querySelector('.recruit-rank');
            if (rankElement) {
                rankElement.textContent = index + 1;
            }
        });
    }

    // ==================== Touch Drag and Drop ====================
    let touchDragActive = false;
    let touchLongPressTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchClone = null;
    let touchDragType = null; // 'card' or 'column'
    let touchDragJustEnded = false;
    const LONG_PRESS_MS = 400;
    const TOUCH_DRAG_THRESHOLD = 10;

    function createTouchClone(element) {
        const rect = element.getBoundingClientRect();
        const clone = document.createElement('div');
        clone.className = 'touch-drag-clone';
        clone.innerHTML = element.innerHTML;
        clone.style.width = rect.width + 'px';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        document.body.appendChild(clone);
        return clone;
    }

    function moveTouchClone(clone, x, y) {
        if (!clone) return;
        const width = clone.offsetWidth;
        const height = clone.offsetHeight;
        clone.style.left = (x - width / 2) + 'px';
        clone.style.top = (y - height / 2) + 'px';
    }

    function removeTouchClone() {
        if (touchClone && touchClone.parentNode) {
            touchClone.parentNode.removeChild(touchClone);
        }
        touchClone = null;
    }

    function getDropTargetUnderFinger(x, y, selector) {
        const cx = Math.max(0, Math.min(x, window.innerWidth - 1));
        const cy = Math.max(0, Math.min(y, window.innerHeight - 1));
        const el = document.elementFromPoint(cx, cy);
        return el ? el.closest(selector) : null;
    }

    function cleanupTouchDrag() {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
        removeTouchClone();
        document.body.classList.remove('touch-dragging');

        document.querySelectorAll('.recruit-card.dragging').forEach(c => c.classList.remove('dragging'));
        document.querySelectorAll('.recruits-list.drag-over').forEach(l => l.classList.remove('drag-over'));
        document.querySelectorAll('.position-slot.dragging').forEach(s => s.classList.remove('dragging'));
        document.querySelectorAll('.position-slot.drag-over').forEach(s => s.classList.remove('drag-over'));

        touchDragActive = false;
        touchDragType = null;
        draggedElement = null;
        sourceContainer = null;
        draggedColumn = null;
        columnSourceGroup = null;
    }

    // --- Player card touch handlers ---
    function handleCardTouchStart(e) {
        if (e.touches.length > 1) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        const card = this;

        touchLongPressTimer = setTimeout(function() {
            touchDragActive = true;
            touchDragType = 'card';
            draggedElement = card;
            sourceContainer = card.parentElement;
            card.classList.add('dragging');
            touchClone = createTouchClone(card);
            moveTouchClone(touchClone, touchStartX, touchStartY);
            document.body.classList.add('touch-dragging');
            if (navigator.vibrate) navigator.vibrate(50);
        }, LONG_PRESS_MS);
    }

    function handleCardTouchMove(e) {
        if (!touchDragActive) {
            if (touchLongPressTimer) {
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (Math.sqrt(dx * dx + dy * dy) > TOUCH_DRAG_THRESHOLD) {
                    clearTimeout(touchLongPressTimer);
                    touchLongPressTimer = null;
                }
            }
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        moveTouchClone(touchClone, touch.clientX, touch.clientY);

        document.querySelectorAll('.recruits-list.drag-over').forEach(l => l.classList.remove('drag-over'));
        const targetList = getDropTargetUnderFinger(touch.clientX, touch.clientY, '.recruits-list');
        if (targetList) {
            targetList.classList.add('drag-over');
        }
    }

    function handleCardTouchEnd(e) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;

        if (!touchDragActive || touchDragType !== 'card') return;
        e.preventDefault();

        const touch = e.changedTouches[0];
        const targetList = getDropTargetUnderFinger(touch.clientX, touch.clientY, '.recruits-list');

        if (targetList && draggedElement) {
            const targetPosition = targetList.dataset.position;
            const sourcePosition = sourceContainer.dataset.position;
            const playerId = draggedElement.dataset.playerId;
            const afterElement = getDragAfterElement(targetList, touch.clientY);

            if (afterElement == null) {
                targetList.appendChild(draggedElement);
            } else {
                targetList.insertBefore(draggedElement, afterElement);
            }

            if (targetPosition !== sourcePosition) {
                draggedElement.dataset.position = targetPosition;
                updatePlayerPosition(playerId, sourcePosition, targetPosition);
            }

            updateRankings(targetList);
            if (sourceContainer !== targetList) {
                updateRankings(sourceContainer);
            }
        }

        cleanupTouchDrag();
        touchDragJustEnded = true;
        setTimeout(function() { touchDragJustEnded = false; }, 300);
    }

    function handleCardTouchCancel() {
        cleanupTouchDrag();
    }

    // --- Position column touch handlers ---
    function handleColumnTouchStart(e) {
        if (e.touches.length > 1) return;
        if (e.target.classList.contains('position-label-input') || e.target.closest('.recruit-card')) return;

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        const slot = this;

        touchLongPressTimer = setTimeout(function() {
            touchDragActive = true;
            touchDragType = 'column';
            draggedColumn = slot;
            columnSourceGroup = slot.parentElement;
            slot.classList.add('dragging');
            touchClone = createTouchClone(slot);
            moveTouchClone(touchClone, touchStartX, touchStartY);
            document.body.classList.add('touch-dragging');
            if (navigator.vibrate) navigator.vibrate(50);
        }, LONG_PRESS_MS);
    }

    function handleColumnTouchMove(e) {
        if (!touchDragActive) {
            if (touchLongPressTimer) {
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (Math.sqrt(dx * dx + dy * dy) > TOUCH_DRAG_THRESHOLD) {
                    clearTimeout(touchLongPressTimer);
                    touchLongPressTimer = null;
                }
            }
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        moveTouchClone(touchClone, touch.clientX, touch.clientY);

        document.querySelectorAll('.position-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
        const targetSlot = getDropTargetUnderFinger(touch.clientX, touch.clientY, '.position-slot');
        if (targetSlot && targetSlot !== draggedColumn && targetSlot.parentElement === columnSourceGroup) {
            targetSlot.classList.add('drag-over');
        }
    }

    function handleColumnTouchEnd(e) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;

        if (!touchDragActive || touchDragType !== 'column') return;
        e.preventDefault();

        const touch = e.changedTouches[0];
        const targetSlot = getDropTargetUnderFinger(touch.clientX, touch.clientY, '.position-slot');

        if (targetSlot && targetSlot !== draggedColumn && targetSlot.parentElement === columnSourceGroup) {
            const group = targetSlot.parentElement;
            const slots = Array.from(group.querySelectorAll('.position-slot'));
            const fromIndex = slots.indexOf(draggedColumn);
            const toIndex = slots.indexOf(targetSlot);

            if (fromIndex < toIndex) {
                group.insertBefore(draggedColumn, targetSlot.nextSibling);
            } else {
                group.insertBefore(draggedColumn, targetSlot);
            }
            scheduleSave();
        }

        cleanupTouchDrag();
    }

    function handleColumnTouchCancel() {
        cleanupTouchDrag();
    }

    // --- Attach touch listeners ---
    function initTouchDragForCard(card) {
        card.addEventListener('touchstart', handleCardTouchStart, { passive: true });
        card.addEventListener('touchmove', handleCardTouchMove, { passive: false });
        card.addEventListener('touchend', handleCardTouchEnd);
        card.addEventListener('touchcancel', handleCardTouchCancel);
    }

    function initTouchDragForColumns() {
        document.querySelectorAll('.position-slot').forEach(function(slot) {
            slot.addEventListener('touchstart', handleColumnTouchStart, { passive: true });
            slot.addEventListener('touchmove', handleColumnTouchMove, { passive: false });
            slot.addEventListener('touchend', handleColumnTouchEnd);
            slot.addEventListener('touchcancel', handleColumnTouchCancel);
        });
    }

    // ==================== Team Pool (Plan 3) ====================
    // Per-school recruit pool. Reads pool_entries from the questionnaire keyed
    // on the coach's normalized team_name. Browse-only in Plan 3 — Plan 4
    // adds "Add to My Pipeline".

    let teamPoolInitialized = false;
    // Single-handle min-only filters (Plan 3.5 — matches Discover Players UX).
    // `position` is now a single string (not array) since the dropdown is single-select.
    let teamPoolFilters = {
        position: '',
        grad_year: '',
        state: '',
        min_height: null,
        min_weight: null,
        min_gpa: null
    };

    const POOL_POSITIONS = [
        ['QB','Quarterback'],['RB','Running Back'],['FB','Fullback'],
        ['WR','Wide Receiver'],['TE','Tight End'],['OT','Offensive Tackle'],
        ['OG','Offensive Guard'],['C','Center'],['DE','Defensive End'],
        ['DT','Defensive Tackle'],['NT','Nose Tackle'],['ILB','Inside LB'],
        ['OLB','Outside LB'],['CB','Cornerback'],['S','Safety'],
        ['K','Kicker'],['P','Punter'],['LS','Long Snapper']
    ];

    const US_STATES = [
        ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
        ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
        ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
        ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
        ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
        ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
        ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
        ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
        ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
        ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
    ];

    function inchesToHeight(inches) {
        if (inches == null) return '—';
        const ft = Math.floor(inches / 12);
        const inch = inches % 12;
        return `${ft}'${inch}"`;
    }

    async function initializeTeamPoolTab() {
        const noTeamEl = document.getElementById('teamPoolNoTeam');
        const headerEl = document.getElementById('teamPoolHeader');
        const filtersEl = document.getElementById('teamPoolFilters');
        const listEl = document.getElementById('teamPoolList');
        const loadingEl = document.getElementById('teamPoolLoading');
        const emptyEl = document.getElementById('teamPoolEmpty');

        loadingEl.style.display = 'block';
        noTeamEl.style.display = 'none';
        headerEl.style.display = 'none';
        filtersEl.style.display = 'none';
        listEl.style.display = 'none';
        emptyEl.style.display = 'none';

        // Resolve coach's team_name via /auth/me
        let me;
        try {
            me = await API.auth.getCurrentUser();
        } catch (err) {
            loadingEl.style.display = 'none';
            noTeamEl.style.display = 'flex';
            return;
        }
        const teamName = (me && me.profile && me.profile.team_name) || null;
        if (!teamName) {
            loadingEl.style.display = 'none';
            noTeamEl.style.display = 'flex';
            return;
        }

        // Render school header (logo + name)
        try {
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../../assets');
            }
        } catch (_) { /* logos are best-effort */ }
        const logoWrap = document.getElementById('teamPoolLogo');
        if (typeof getSchoolLogoHTML === 'function') {
            logoWrap.innerHTML = getSchoolLogoHTML(teamName, '../../assets', 56) || '';
        }
        document.getElementById('teamPoolSchoolName').textContent = teamName;

        // Wire the Copy Questionnaire Link button (moved from Pipeline tab in 3.5).
        // Fetch the link once on init; cache it for the button click handler.
        try {
            const linkData = await API.get('/recruiting-board/my-questionnaire');
            const copyBtn = document.getElementById('poolCopyLinkBtn');
            if (copyBtn && linkData && linkData.public_url) {
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(linkData.public_url);
                        if (typeof showToast === 'function') {
                            showToast('Questionnaire link copied to clipboard', 'success');
                        }
                    } catch (_) {
                        if (typeof showToast === 'function') {
                            showToast('Could not copy. Select the URL manually.', 'error');
                        }
                    }
                });
            }
        } catch (_) {
            // Hide the button if we can't load the link (rare — should not happen
            // since we already verified team_name is set above).
            const copyBtn = document.getElementById('poolCopyLinkBtn');
            if (copyBtn) copyBtn.style.display = 'none';
        }

        // Position dropdown (single-select, matches Discover Players UX)
        const positionSel = document.getElementById('poolPosition');
        POOL_POSITIONS.forEach(([code, label]) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = `${label} (${code})`;
            positionSel.appendChild(opt);
        });

        // Graduation year dropdown
        const yearSel = document.getElementById('poolGradYear');
        for (let y = 2024; y <= 2032; y++) {
            const opt = document.createElement('option');
            opt.value = String(y); opt.textContent = String(y);
            yearSel.appendChild(opt);
        }

        // State dropdown
        const stateSel = document.getElementById('poolState');
        US_STATES.forEach(([abbr, name]) => {
            const opt = document.createElement('option');
            opt.value = abbr; opt.textContent = name;
            stateSel.appendChild(opt);
        });

        // Sliders — single-handle min-only. INPUT events just update the
        // display label; the actual filter doesn't fire until "Apply Filters".
        const heightSlider = document.getElementById('poolHeightSlider');
        const heightValue = document.getElementById('poolHeightValue');
        heightSlider.addEventListener('input', () => {
            heightValue.textContent = inchesToHeight(Number(heightSlider.value));
        });

        const weightSlider = document.getElementById('poolWeightSlider');
        const weightValue = document.getElementById('poolWeightValue');
        weightSlider.addEventListener('input', () => {
            weightValue.textContent = weightSlider.value;
        });

        const gpaSlider = document.getElementById('poolGpaSlider');
        const gpaValue = document.getElementById('poolGpaValue');
        gpaSlider.addEventListener('input', () => {
            // GPA slider stores 0-40 internally for step=1; display divides by 10.
            gpaValue.textContent = (Number(gpaSlider.value) / 10).toFixed(1);
        });

        // Apply Filters button — reads all inputs and refreshes
        document.getElementById('poolFiltersApply').addEventListener('click', () => {
            const heightMin = Number(heightSlider.value);
            const weightMin = Number(weightSlider.value);
            const gpaMinTenths = Number(gpaSlider.value);
            teamPoolFilters = {
                position: positionSel.value || '',
                grad_year: yearSel.value || '',
                state: stateSel.value || '',
                // Only send min_* if the user moved off the bottom (matches Discover)
                min_height: heightMin > Number(heightSlider.min) ? heightMin : null,
                min_weight: weightMin > Number(weightSlider.min) ? weightMin : null,
                min_gpa: gpaMinTenths > 0 ? (gpaMinTenths / 10) : null
            };
            refreshTeamPool();
        });

        // Reset All button — clears every input and refreshes
        document.getElementById('poolFiltersReset').addEventListener('click', () => {
            positionSel.value = '';
            yearSel.value = '';
            stateSel.value = '';
            heightSlider.value = heightSlider.min;
            weightSlider.value = weightSlider.min;
            gpaSlider.value = 0;
            heightValue.textContent = inchesToHeight(Number(heightSlider.min));
            weightValue.textContent = weightSlider.min;
            gpaValue.textContent = '0.0';
            teamPoolFilters = {
                position: '', grad_year: '', state: '',
                min_height: null, min_weight: null, min_gpa: null
            };
            refreshTeamPool();
        });

        // Filter panel collapse toggle — same UX as the Pipeline tab.
        wireFilterPanelToggle({
            containerId: 'teamPoolFilters',
            toggleBtnId: 'poolFiltersToggle',
            storageKey: 'poolFiltersHidden',
        });

        teamPoolInitialized = true;

        // Reveal UI + first load
        headerEl.style.display = 'block';
        filtersEl.style.display = 'block';
        await refreshTeamPool();
    }

    async function refreshTeamPool() {
        const listEl = document.getElementById('teamPoolList');
        const loadingEl = document.getElementById('teamPoolLoading');
        const emptyEl = document.getElementById('teamPoolEmpty');
        const countEl = document.getElementById('teamPoolCount');

        loadingEl.style.display = 'block';
        listEl.style.display = 'none';
        emptyEl.style.display = 'none';

        try {
            const data = await API.pool.list(teamPoolFilters);
            loadingEl.style.display = 'none';
            countEl.textContent = `${data.total} submission${data.total === 1 ? '' : 's'}`;
            // Also update the filter-results count footer
            const resultsCountEl = document.getElementById('poolResultsCount');
            if (resultsCountEl) resultsCountEl.textContent = data.total;

            if (!data.entries || data.entries.length === 0) {
                emptyEl.style.display = 'flex';
                listEl.innerHTML = '';
                return;
            }

            listEl.style.display = 'flex';
            listEl.innerHTML = '';
            for (const entry of data.entries) {
                listEl.appendChild(buildPoolRow(entry));
            }
        } catch (err) {
            loadingEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to load pool', 'error');
            }
        }
    }

    function buildPoolRow(entry) {
        // Gray when no DR account, cerulean when linked (Plan 3.5).
        const hasAccount = !!entry.linked_player_user_id;
        const accentColor = hasAccount ? '#1282a2' : '#9ca3af';
        const ringBg = hasAccount
            ? 'rgba(18, 130, 162, 0.18)'
            : 'rgba(156, 163, 175, 0.18)';

        const fullName = `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || 'Unknown';

        // Subheader = hsplayer format: Position • Height • Weight • GradYear
        const meta = [];
        if (entry.positions && entry.positions.length) meta.push(entry.positions.join('/'));
        if (entry.height_inches) meta.push(inchesToHeight(entry.height_inches));
        if (entry.weight_lbs) meta.push(`${entry.weight_lbs} lbs`);
        if (entry.graduation_year) meta.push(String(entry.graduation_year));
        const subheader = meta.join(' • ');

        // Avatar: only show a profile image when a DR account is linked
        // AND that account has one. Questionnaire-only entries always show
        // the silhouette fallback (Plan 3.5 — no questionnaire profile pics).
        const avatarInner = (hasAccount && entry.profile_image_url)
            ? `<img src="${escapeHtml(entry.profile_image_url)}" alt="" class="rb-pool-row-avatar-img">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>`;

        // Badges (DR member + Plan 4 cross-coach checkmark). Resubmission
        // badge intentionally omitted from the row — a new submission
        // already bumps the recruit to the top of the list (sorted by
        // last_submitted_at DESC), and the detail modal still surfaces the
        // full submission history.
        const badges = [];
        if (entry.is_in_any_pipeline_at_school) {
            badges.push('<span class="rb-pool-row-check" title="Already in a coach’s pipeline at this school">✓</span>');
        }
        if (hasAccount) {
            badges.push('<span class="rb-pool-row-badge dr">DR Member</span>');
        }

        // Plan 4 "Add to My Pipeline" action button (or disabled "In Your Pipeline")
        const actionBtnHtml = entry.is_in_my_pipeline
            ? '<button class="rb-pool-row-action in-pipeline" disabled>In Your Pipeline</button>'
            : '<button class="rb-pool-row-action add-pipeline" type="button">Add to Pipeline</button>';

        const row = document.createElement('div');
        row.className = 'rb-pool-row';
        row.dataset.entryId = entry.id;
        row.innerHTML = `
            <div class="rb-pool-row-avatar" style="border-color: ${accentColor}; background: ${ringBg}; color: ${accentColor};">
                ${avatarInner}
            </div>
            <div class="rb-pool-row-info">
                <div class="rb-pool-row-name">
                    ${escapeHtml(fullName)}
                    ${badges.join('')}
                </div>
                <div class="rb-pool-row-meta" style="color: ${accentColor};">${escapeHtml(subheader)}</div>
            </div>
            <div class="rb-pool-row-actions">${actionBtnHtml}</div>
        `;
        row.addEventListener('click', () => openPoolDetailModal(entry.id));
        const actionBtn = row.querySelector('.rb-pool-row-action.add-pipeline');
        if (actionBtn) {
            actionBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                addPoolEntryToPipeline(entry.id, { rowEl: row });
            });
        }
        return row;
    }

    // Plan 4 — Add a pool entry to the coach's pipeline, optimistically update
    // the row's checkmark + button + (if the modal is open for this entry)
    // the modal footer button too. Re-fetches pool data is not required; the
    // local row mutation matches what the next refreshTeamPool would produce.
    async function addPoolEntryToPipeline(entryId, { rowEl = null, modalBtn = null } = {}) {
        try {
            await API.pipeline.addFromPool(entryId);
            if (typeof showToast === 'function') showToast('Added to your pipeline', 'success');

            // Optimistic in-place update on the matching row (find it if not provided)
            const targetRow = rowEl || document.querySelector(`.rb-pool-row[data-entry-id="${entryId}"]`);
            if (targetRow) {
                const nameEl = targetRow.querySelector('.rb-pool-row-name');
                if (nameEl && !nameEl.querySelector('.rb-pool-row-check')) {
                    nameEl.insertAdjacentHTML('afterbegin',
                        '<span class="rb-pool-row-check" title="Already in a coach’s pipeline at this school">✓</span>');
                }
                const actionsEl = targetRow.querySelector('.rb-pool-row-actions');
                if (actionsEl) {
                    actionsEl.innerHTML = '<button class="rb-pool-row-action in-pipeline" disabled>In Your Pipeline</button>';
                }
            }
            // Sync the modal footer button if it's open for this entry
            const modalEntryEl = document.getElementById('poolDetailAddPipelineBtn');
            if (modalEntryEl && currentPoolModalEntryId === entryId) {
                modalEntryEl.outerHTML = '<button class="btn-submit" id="poolDetailAddPipelineBtn" disabled>In Your Pipeline</button>';
            }
        } catch (err) {
            const status = err && err.status;
            const msg = (err && err.message) || 'Failed to add to pipeline';
            if (typeof showToast === 'function') {
                showToast(msg, status === 409 ? 'warning' : 'error');
            }
        }
    }

    // Tracks which pool entry the detail modal currently has open — used by
    // the modal-footer Add-to-Pipeline button + the optimistic sync inside
    // addPoolEntryToPipeline so external triggers (pool card click) also
    // update the modal button if it's showing the same entry.
    let currentPoolModalEntryId = null;

    // ---------- Pool Entry Detail Modal ----------
    async function openPoolDetailModal(entryId) {
        const modal = document.getElementById('poolDetailModal');
        const nameEl = document.getElementById('poolDetailName');
        const drBadge = document.getElementById('poolDetailDrBadge');
        const resubBadge = document.getElementById('poolDetailResubmittedBadge');
        const drTabBtn = document.getElementById('poolDetailDrTabBtn');
        const avatarEl = document.getElementById('poolDetailAvatar');
        const qBody = document.getElementById('poolDetailQuestionnaire');
        const histBody = document.getElementById('poolDetailHistory');
        const drBody = document.getElementById('poolDetailDrProfile');
        const addPipelineBtn = document.getElementById('poolDetailAddPipelineBtn');
        if (!modal) return;
        currentPoolModalEntryId = entryId;

        const silhouetteSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

        // Reset state
        nameEl.textContent = 'Loading…';
        drBadge.style.display = 'none';
        resubBadge.style.display = 'none';
        drTabBtn.style.display = 'none';
        qBody.innerHTML = '<p class="pool-detail-loading">Loading…</p>';
        histBody.innerHTML = '';
        drBody.innerHTML = '';
        if (avatarEl) {
            avatarEl.style.borderColor = '#9ca3af';
            avatarEl.style.background = 'rgba(156, 163, 175, 0.18)';
            avatarEl.style.color = '#9ca3af';
            avatarEl.innerHTML = silhouetteSvg;
        }

        // Show modal + reset to first inner tab
        modal.classList.add('active');
        switchPoolDetailTab('questionnaire');

        try {
            const data = await API.pool.getEntry(entryId);
            const entry = data.entry || {};
            const submissions = data.submissions || [];
            const dr = data.dr_profile || null;
            const latest = submissions.length ? submissions[submissions.length - 1].submission_data : {};
            const personal = latest.personal || {};

            const fullName = `${personal.first_name || ''} ${personal.last_name || ''}`.trim() || entry.email || 'Recruit';
            nameEl.textContent = fullName;

            const hasAccount = !!entry.linked_player_user_id;
            const accentColor = hasAccount ? '#1282a2' : '#9ca3af';
            const ringBg = hasAccount
                ? 'rgba(18, 130, 162, 0.18)'
                : 'rgba(156, 163, 175, 0.18)';
            if (avatarEl) {
                avatarEl.style.borderColor = accentColor;
                avatarEl.style.background = ringBg;
                avatarEl.style.color = accentColor;
                avatarEl.innerHTML = (hasAccount && entry.profile_image_url)
                    ? `<img src="${escapeHtml(entry.profile_image_url)}" alt="" class="pool-detail-avatar-img">`
                    : silhouetteSvg;
            }

            if (hasAccount) {
                drBadge.style.display = 'inline-flex';
                drTabBtn.style.display = 'inline-flex';
            }
            if (entry.submission_count && entry.submission_count > 1) {
                resubBadge.style.display = 'inline-flex';
                resubBadge.textContent = `Resubmitted ${entry.submission_count}x`;
            }

            qBody.innerHTML = renderQuestionnaireView(latest, entry.transcript_url || null);
            histBody.innerHTML = renderSubmissionHistory(submissions);
            drBody.innerHTML = dr ? renderDrProfile(dr) : '<p class="pool-detail-empty">No Direct Recruit profile linked.</p>';

            // Plan 4 — modal footer "Add to Pipeline" button. Renders as
            // disabled "In Your Pipeline" when this coach already has them.
            // The button element is recreated rather than just disabled so
            // the click listener attached below is always fresh.
            const footer = document.querySelector('#poolDetailModal .recruiting-board-modal-footer');
            const existingBtn = document.getElementById('poolDetailAddPipelineBtn');
            if (footer && existingBtn) {
                if (entry.is_in_my_pipeline) {
                    existingBtn.outerHTML = '<button class="btn-submit" id="poolDetailAddPipelineBtn" disabled>In Your Pipeline</button>';
                } else {
                    existingBtn.outerHTML = '<button class="btn-submit" id="poolDetailAddPipelineBtn">Add to Pipeline</button>';
                    const freshBtn = document.getElementById('poolDetailAddPipelineBtn');
                    freshBtn.addEventListener('click', () => addPoolEntryToPipeline(entryId));
                }
                // Make sure it's visible (the HTML starts with display: none)
                document.getElementById('poolDetailAddPipelineBtn').style.display = '';
            }
        } catch (err) {
            qBody.innerHTML = `<p class="pool-detail-error">${escapeHtml((err && err.message) || 'Failed to load entry')}</p>`;
        }
    }

    function closePoolDetailModal() {
        const modal = document.getElementById('poolDetailModal');
        if (modal) modal.classList.remove('active');
        currentPoolModalEntryId = null;
    }

    // ====================================================================
    // PIPELINE TAB (Plan 4)
    // ====================================================================

    // Locked 6-color palette (Plan 4 Step 4.6). Tokens stored in DB; hex used
    // only for rendering swatches.
    const COLOR_HEX = {
        dark_green: '#15803d',
        light_green: '#86efac',
        yellow: '#facc15',
        orange: '#f97316',
        red: '#ef4444',
        dark_red: '#7f1d1d',
    };

    // Cache the logged-in coach's identity (id + name + title) so any helper
    // that needs to attribute an action to "the current coach" can read it
    // synchronously after the first fetch. Used by the History tab to inject
    // the current coach's own grade into the timeline (otherwise the chain
    // looks empty for recruits added directly from a profile or pulled from
    // the pool without ever being handed off).
    let _cachedCurrentUser = null;
    async function getCachedCurrentUser() {
        if (_cachedCurrentUser) return _cachedCurrentUser;
        try {
            const me = await API.auth.getCurrentUser();
            if (me && me.user) {
                _cachedCurrentUser = {
                    id: me.user.id,
                    name: ((me.profile && (me.profile.first_name || '')) + ' ' + (me.profile && (me.profile.last_name || ''))).trim() || null,
                    title: (me.profile && me.profile.position) || null,
                };
            }
        } catch (_) { /* non-fatal */ }
        return _cachedCurrentUser;
    }

    // ----- Final-synthesis helpers (Add to Shared Board) -------------------
    // Used by the Add-to-Board modal's Shared mode to prefill the Final Grade
    // slider + Final Color swatch, build the grading_history snapshot sent to
    // the server, and render the Evaluation History tab (compact: no notes).

    function computeFinalGradeMean(chain, ownGrade) {
        const vals = [];
        if (Array.isArray(chain)) {
            chain.forEach(e => {
                if (e && Number.isFinite(Number(e.grade))) vals.push(Number(e.grade));
            });
        }
        if (Number.isFinite(Number(ownGrade))) vals.push(Number(ownGrade));
        if (vals.length === 0) return 50;
        const sum = vals.reduce((a, b) => a + b, 0);
        return Math.round(sum / vals.length);
    }

    function computeMostCommonColor(chain, ownColor) {
        const counts = new Map();
        const lastSeen = new Map();   // for "most recent wins" tie-break
        let idx = 0;
        const tally = (tok) => {
            if (!tok || !COLOR_HEX[tok]) return;
            counts.set(tok, (counts.get(tok) || 0) + 1);
            lastSeen.set(tok, idx++);
        };
        if (Array.isArray(chain)) chain.forEach(e => tally(e && e.color_tag));
        tally(ownColor);
        if (counts.size === 0) return null;
        let bestTok = null, bestCount = -1, bestRecent = -1;
        for (const [tok, c] of counts.entries()) {
            const recent = lastSeen.get(tok);
            if (c > bestCount || (c === bestCount && recent > bestRecent)) {
                bestTok = tok; bestCount = c; bestRecent = recent;
            }
        }
        return bestTok;
    }

    function buildGradingHistorySnapshot(recruit, currentUser) {
        const chain = Array.isArray(recruit && recruit.evaluation_chain)
            ? recruit.evaluation_chain.map(e => ({ ...e }))   // shallow clone
            : [];
        // Skip the synthetic entry if the current coach already appears in the
        // chain (e.g. they hand-off-cycled). Dedupe by coach_id.
        const alreadyInChain = currentUser && chain.some(e => String(e.coach_id) === String(currentUser.id));
        if (currentUser && !alreadyInChain) {
            // Phase 3: the in-modal Save Grade button is gone. All grade
            // writes commit through the #gradeEntryModal → saveGradeEntry,
            // which mirrors the saved values onto the in-memory recruit. So
            // recruit.{grade,color_tag,notes} are always the latest — no
            // unsaved-DOM-snapshot peek needed (readLiveEvalValues deleted).
            const ownGrade = (recruit && recruit.grade != null) ? recruit.grade : null;
            const ownColor = (recruit && recruit.color_tag) || null;
            const ownNotes = (recruit && recruit.notes) || null;
            // Include the current coach's own row only if they actually evaluated
            // (any of grade / color / notes set). Coaches who promote without
            // their own evaluation just preserve the upstream chain.
            if (ownGrade != null || ownColor != null || (ownNotes && String(ownNotes).trim())) {
                chain.push({
                    coach_id: currentUser.id,
                    coach_name: currentUser.name || null,
                    coach_title: currentUser.title || null,
                    grade: ownGrade,
                    color_tag: ownColor,
                    notes: ownNotes,
                    evaluated_at: (recruit && recruit.updated_at) || new Date().toISOString(),
                });
            }
        }
        return chain;
    }

    // Compact variant of renderEvaluationChainTimeline used by the Add-to-Board
    // modal's Evaluation History tab. Drops notes and timestamps; keeps only
    // coach + grade + color swatch so coaches scan the chain at a glance.
    function renderEvaluationChainTimelineCompact(chain) {
        if (!Array.isArray(chain) || chain.length === 0) {
            return '<p class="addboard-history-empty">No prior evaluations yet.</p>';
        }
        // Newest evaluations first — mirrors renderEvaluationChainTimeline.
        const sorted = [...chain].sort((a, b) => {
            const ta = new Date(a && a.evaluated_at ? a.evaluated_at : 0).getTime();
            const tb = new Date(b && b.evaluated_at ? b.evaluated_at : 0).getTime();
            return tb - ta;
        });
        return sorted.map(entry => {
            const colorHex = COLOR_HEX[entry.color_tag] || null;
            const swatch = colorHex
                ? `<span class="addboard-history-swatch" style="background:${colorHex};"></span>`
                : '<span class="addboard-history-swatch addboard-history-swatch-empty"></span>';
            const grade = (entry.grade != null) ? entry.grade : '—';
            const name = escapeHtml(entry.coach_name || 'Coach');
            const title = entry.coach_title
                ? `<span class="addboard-history-title">${escapeHtml(entry.coach_title)}</span>`
                : '';
            return `
                <div class="addboard-history-row">
                    ${swatch}
                    <div class="addboard-history-coach">
                        <span class="addboard-history-name">${name}</span>
                        ${title}
                    </div>
                    <span class="addboard-history-grade">${escapeHtml(String(grade))}</span>
                </div>
            `;
        }).join('');
    }

    let pipelineInitialized = false;
    let currentPipelineRecruits = [];
    let currentEvalRecruit = null;       // The recruit currently open in the Eval Modal

    // Plan 5B: view switcher state (My Pipeline / Sent / Received).
    let currentPipelineView = 'my-pipeline';
    let sentLoadedOnce = false;
    let receivedLoadedOnce = false;
    let currentSentHandoffs = [];        // Plan 5A listOut shape: one per recruit
    let currentReceivedHandoffs = [];    // Plan 5A listIn shape: one per handoff

    // Plan 5B: client-side filters for the My Pipeline view. Same filter set
    // as the Team Pool tab, applied locally over currentPipelineRecruits so
    // Apply/Reset feel instant and don't fight the optimistic-prepend logic
    // used by the handoff accept path.
    let pipelineFilters = {
        position: '',
        grad_year: '',
        state: '',
        min_height: null,
        min_weight: null,
        min_gpa: null,
    };
    let pipelineFiltersInitialized = false;

    function applyPipelineFilters(recruits) {
        const f = pipelineFilters;
        const anyActive = f.position || f.grad_year || f.state
            || f.min_height != null || f.min_weight != null || f.min_gpa != null;
        if (!anyActive) return { list: recruits, active: false };
        const filtered = recruits.filter(r => {
            if (f.position) {
                const positions = Array.isArray(r.positions) ? r.positions : (r.positions ? [r.positions] : []);
                // Match if the recruit lists this position (case-insensitive, exact code match)
                if (!positions.some(p => String(p).toUpperCase() === f.position.toUpperCase())) return false;
            }
            if (f.grad_year && String(r.graduation_year) !== String(f.grad_year)) return false;
            if (f.state && String(r.state || '').toUpperCase() !== f.state.toUpperCase()) return false;
            if (f.min_height != null && (!r.height_inches || r.height_inches < f.min_height)) return false;
            if (f.min_weight != null && (!r.weight_lbs || r.weight_lbs < f.min_weight)) return false;
            if (f.min_gpa != null && (r.gpa == null || Number(r.gpa) < f.min_gpa)) return false;
            return true;
        });
        return { list: filtered, active: true };
    }

    async function initializePipelineTab() {
        if (pipelineInitialized) {
            await refreshPipeline();
            return;
        }
        pipelineInitialized = true;
        initializePipelineFilters();
        await refreshPipeline();
    }

    // Wire up the filter panel inside #pipelineMyView. Runs once per page load.
    // Filter dropdown options + slider event listeners + Apply/Reset handlers.
    function initializePipelineFilters() {
        if (pipelineFiltersInitialized) return;
        pipelineFiltersInitialized = true;

        const positionSel = document.getElementById('pipelineFilterPosition');
        if (positionSel) {
            POOL_POSITIONS.forEach(([code, label]) => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = `${label} (${code})`;
                positionSel.appendChild(opt);
            });
        }

        const yearSel = document.getElementById('pipelineFilterGradYear');
        if (yearSel) {
            for (let y = 2024; y <= 2032; y++) {
                const opt = document.createElement('option');
                opt.value = String(y); opt.textContent = String(y);
                yearSel.appendChild(opt);
            }
        }

        const stateSel = document.getElementById('pipelineFilterState');
        if (stateSel) {
            US_STATES.forEach(([abbr, name]) => {
                const opt = document.createElement('option');
                opt.value = abbr; opt.textContent = name;
                stateSel.appendChild(opt);
            });
        }

        const heightSlider = document.getElementById('pipelineFilterHeightSlider');
        const heightValue = document.getElementById('pipelineFilterHeightValue');
        if (heightSlider && heightValue) {
            heightSlider.addEventListener('input', () => {
                heightValue.textContent = inchesToHeight(Number(heightSlider.value));
            });
        }

        const weightSlider = document.getElementById('pipelineFilterWeightSlider');
        const weightValue = document.getElementById('pipelineFilterWeightValue');
        if (weightSlider && weightValue) {
            weightSlider.addEventListener('input', () => {
                weightValue.textContent = weightSlider.value;
            });
        }

        const gpaSlider = document.getElementById('pipelineFilterGpaSlider');
        const gpaValue = document.getElementById('pipelineFilterGpaValue');
        if (gpaSlider && gpaValue) {
            gpaSlider.addEventListener('input', () => {
                gpaValue.textContent = (Number(gpaSlider.value) / 10).toFixed(1);
            });
        }

        const applyBtn = document.getElementById('pipelineFiltersApply');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const heightMin = heightSlider ? Number(heightSlider.value) : 0;
                const weightMin = weightSlider ? Number(weightSlider.value) : 0;
                const gpaMinTenths = gpaSlider ? Number(gpaSlider.value) : 0;
                pipelineFilters = {
                    position: (positionSel && positionSel.value) || '',
                    grad_year: (yearSel && yearSel.value) || '',
                    state: (stateSel && stateSel.value) || '',
                    min_height: heightSlider && heightMin > Number(heightSlider.min) ? heightMin : null,
                    min_weight: weightSlider && weightMin > Number(weightSlider.min) ? weightMin : null,
                    min_gpa: gpaMinTenths > 0 ? (gpaMinTenths / 10) : null,
                };
                rerenderMyPipelineList();
            });
        }

        const resetBtn = document.getElementById('pipelineFiltersReset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (positionSel) positionSel.value = '';
                if (yearSel) yearSel.value = '';
                if (stateSel) stateSel.value = '';
                if (heightSlider) heightSlider.value = heightSlider.min;
                if (weightSlider) weightSlider.value = weightSlider.min;
                if (gpaSlider) gpaSlider.value = 0;
                if (heightValue && heightSlider) heightValue.textContent = inchesToHeight(Number(heightSlider.min));
                if (weightValue && weightSlider) weightValue.textContent = weightSlider.min;
                if (gpaValue) gpaValue.textContent = '0.0';
                pipelineFilters = {
                    position: '', grad_year: '', state: '',
                    min_height: null, min_weight: null, min_gpa: null,
                };
                rerenderMyPipelineList();
            });
        }

        // Hide/show toggle. State persisted to localStorage so the user's
        // collapsed preference survives reloads.
        wireFilterPanelToggle({
            containerId: 'pipelineFilters',
            toggleBtnId: 'pipelineFiltersToggle',
            storageKey: 'pipelineFiltersHidden',
        });
    }

    /**
     * Wire a filter panel's collapse toggle. Pattern shared by the Pipeline
     * tab's filter panel and the Team Pool tab's filter panel — both call
     * this helper with their own ids.
     */
    function wireFilterPanelToggle({ containerId, toggleBtnId, storageKey }) {
        const container = document.getElementById(containerId);
        const toggleBtn = document.getElementById(toggleBtnId);
        if (!container || !toggleBtn) return;
        // Plan 8: on a first visit (localStorage absent) default to collapsed
        // on mobile / expanded on desktop. We don't WRITE to localStorage
        // here — preserves "no preference yet" so a user who later resizes
        // to desktop sees the filters open by default. Once the user toggles
        // explicitly, the stored value takes over forever.
        const stored = localStorage.getItem(storageKey);
        let hidden;
        if (stored === null) {
            hidden = window.matchMedia('(max-width: 768px)').matches;
        } else {
            hidden = stored === 'true';
        }
        if (hidden) {
            container.classList.add('rb-pool-filters-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = container.classList.toggle('rb-pool-filters-collapsed');
            toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            localStorage.setItem(storageKey, String(isCollapsed));
        });
    }

    // Plan 5B: switch between My Pipeline / Sent / Received views inside
    // the Pipeline subtab. Lazy-loads Sent + Received on first access.
    // Switching to Received auto-fires markHandoffsSeen and clears all
    // three badge surfaces.
    async function switchPipelineView(view) {
        if (view !== 'my-pipeline' && view !== 'sent' && view !== 'received') return;
        currentPipelineView = view;

        // Toggle active state on the segmented buttons
        document.querySelectorAll('.pipeline-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Show the matching view container, hide the others
        const my = document.getElementById('pipelineMyView');
        const sent = document.getElementById('pipelineSentView');
        const recv = document.getElementById('pipelineReceivedView');
        if (my) my.style.display = view === 'my-pipeline' ? 'block' : 'none';
        if (sent) sent.style.display = view === 'sent' ? 'block' : 'none';
        if (recv) recv.style.display = view === 'received' ? 'block' : 'none';

        if (view === 'sent') {
            if (!sentLoadedOnce) {
                sentLoadedOnce = true;
                await loadHandoffsSent();
            } else {
                await loadHandoffsSent(); // always refresh on switch — cheap
            }
        }
        if (view === 'received') {
            if (!receivedLoadedOnce) {
                receivedLoadedOnce = true;
                await loadHandoffsReceived();
            } else {
                await loadHandoffsReceived();
            }
            // Auto mark-seen on every Received view open. markHandoffsSeen is
            // idempotent at count=0, so unconditional firing is safe.
            try {
                await API.pipeline.markHandoffsSeen();
                // Optimistically clear the three badge surfaces. We re-fetch
                // the unread count via mainpage-coach's poller on next interval
                // but the user shouldn't have to wait 30s to see the badge drop.
                clearHandoffBadgesOptimistically();
            } catch { /* swallow — badges will sync on next 30s poll */ }
        }
    }

    function clearHandoffBadgesOptimistically() {
        // Pipeline subtab badge
        const subBadge = document.querySelector('.rb-subtab[data-tab="pipeline"] .rb-subtab-badge');
        if (subBadge) {
            subBadge.style.display = 'none';
            subBadge.textContent = '';
        }
        // Inline view-switcher Received badge
        const inlineBadge = document.getElementById('pipelineReceivedBadge');
        if (inlineBadge) {
            inlineBadge.style.display = 'none';
            inlineBadge.textContent = '';
        }
        // Sidebar nav badge — defer to mainpage-coach which owns the
        // combined invites+handoffs count. window.updateUnreadHandoffsBadge
        // re-syncs the sidebar via updateRecruitingBoardSidebarBadge.
        if (typeof window.updateUnreadHandoffsBadge === 'function') {
            window.updateUnreadHandoffsBadge();
        }
    }

    async function refreshPipeline() {
        const listEl = document.getElementById('pipelineList');
        const loadingEl = document.getElementById('pipelineLoading');
        const emptyEl = document.getElementById('pipelineEmpty');
        if (!listEl) return;

        loadingEl.style.display = 'block';
        listEl.style.display = 'none';
        emptyEl.style.display = 'none';

        try {
            const data = await API.pipeline.getMy();
            currentPipelineRecruits = data.recruits || [];
            loadingEl.style.display = 'none';
            // Delegate rendering to rerenderMyPipelineList — it applies any
            // active client-side filters AND updates the result-count badges.
            rerenderMyPipelineList();
        } catch (err) {
            loadingEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to load pipeline', 'error');
            }
        }
    }

    function buildPipelineRow(recruit) {
        const hasAccount = !!recruit.linked_player_user_id;
        // Transfer recruits get the platform-wide red subheader treatment
        // (lesson #2) — Position • Height • Weight • YOE instead of grad year.
        // Non-transfer DR-linked recruits stay cerulean; questionnaire-only
        // (no DR account) stay neutral gray.
        const isTransfer = hasAccount && !!recruit.is_transfer;
        let accentColor, ringBg;
        if (isTransfer) {
            accentColor = '#b91c1c';
            ringBg = 'rgba(185, 28, 28, 0.18)';
        } else if (hasAccount) {
            accentColor = '#1282a2';
            ringBg = 'rgba(18, 130, 162, 0.18)';
        } else {
            accentColor = '#9ca3af';
            ringBg = 'rgba(156, 163, 175, 0.18)';
        }

        const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';

        const meta = [];
        if (recruit.positions && recruit.positions.length) meta.push(recruit.positions.join('/'));
        if (recruit.height_inches) meta.push(inchesToHeight(recruit.height_inches));
        if (recruit.weight_lbs) meta.push(`${recruit.weight_lbs} lbs`);
        if (isTransfer) {
            if (recruit.eligibility != null) {
                meta.push(`YOE: ${recruit.eligibility} year${recruit.eligibility === 1 ? '' : 's'}`);
            }
        } else if (recruit.graduation_year) {
            meta.push(String(recruit.graduation_year));
        }
        const subheader = meta.join(' • ');

        const avatarInner = (hasAccount && recruit.profile_image_url)
            ? `<img src="${escapeHtml(recruit.profile_image_url)}" alt="" class="rb-pool-row-avatar-img">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>`;

        const badges = [];
        if (hasAccount) badges.push('<span class="pipeline-badge dr">DR</span>');
        // Pool badge only when the recruit came in via the team pool. We don't
        // emit a "Direct add" sibling badge — that source is implicit when DR
        // is shown without Pool.
        if (recruit.source === 'pool') badges.push('<span class="pipeline-badge source">Pool</span>');

        // Grade pill — color-tinted when graded, neutral when not
        const colorHex = COLOR_HEX[recruit.color_tag] || null;
        let gradeHtml;
        if (recruit.grade != null) {
            const pillStyle = colorHex
                ? `style="background:${colorHex}; color:${gradePillTextColor(colorHex)}; border-color:${colorHex};"`
                : '';
            gradeHtml = `<div class="pipeline-grade-pill has-grade" ${pillStyle}>
                            <span class="pipeline-grade-number">${recruit.grade}</span>
                            <span class="pipeline-grade-label">Grade</span>
                         </div>`;
        } else {
            gradeHtml = `<div class="pipeline-grade-pill">
                            <span class="pipeline-grade-number">—</span>
                            <span class="pipeline-grade-label">Ungraded</span>
                         </div>`;
        }

        // Vertical color stripe on the far left of the card (mirrors the
        // promote-to-board visual planned in Plan 6: color swatch as primary
        // visual anchor).
        const stripeColor = colorHex || 'rgba(255, 255, 255, 0.08)';

        const row = document.createElement('div');
        row.className = 'pipeline-card';
        row.dataset.recruitId = recruit.id;
        row.innerHTML = `
            <div class="pipeline-card-stripe" style="background:${stripeColor};"></div>
            <div class="pipeline-card-avatar" style="border-color: ${accentColor}; background: ${ringBg}; color: ${accentColor};">
                ${avatarInner}
            </div>
            <div class="pipeline-card-info">
                <div class="pipeline-card-name-row">
                    <span class="pipeline-card-name">${escapeHtml(fullName)}</span>
                    ${badges.join('')}
                </div>
                <div class="pipeline-card-meta" style="color: ${accentColor};">${escapeHtml(subheader) || '<span class="pipeline-card-meta-empty">No details on file</span>'}</div>
            </div>
            ${gradeHtml}
        `;
        row.addEventListener('click', () => {
            try {
                openEvaluationModal(recruit);
            } catch (e) {
                console.error('[Pipeline Card] failed to open Evaluation Modal:', e, 'recruit:', recruit);
                if (typeof showToast === 'function') showToast('Could not open recruit details', 'error');
            }
        });
        return row;
    }

    // Pick black or white text for a grade pill based on the background's luminance.
    // Light colors (yellow, light_green) need black text for legibility.
    function gradePillTextColor(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return '#ffffff';
        const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
        // Relative luminance (per WCAG)
        const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return L > 0.6 ? '#1a1a1a' : '#ffffff';
    }

    // ====================================================================
    // HAND-OFFS — SENT + RECEIVED VIEWS + CHAIN TIMELINE (Plan 5B)
    // ====================================================================

    async function loadHandoffsSent() {
        const listEl = document.getElementById('handoffSentList');
        const loadingEl = document.getElementById('handoffSentLoading');
        const emptyEl = document.getElementById('handoffSentEmpty');
        const countEl = document.getElementById('pipelineSentCount');
        if (!listEl) return;

        loadingEl.style.display = 'block';
        listEl.style.display = 'none';
        emptyEl.style.display = 'none';

        try {
            const data = await API.pipeline.getHandoffsOut();
            currentSentHandoffs = data.handoffs || [];
            loadingEl.style.display = 'none';
            // Count just the still-pending recipients so the badge matches what
            // the receiver-side unread count would say.
            const pendingCount = currentSentHandoffs.reduce((n, item) => {
                const recipients = item.recipients || [];
                return n + recipients.filter(r => r.state === 'pending').length;
            }, 0);
            const totalCount = currentSentHandoffs.reduce((n, item) => n + (item.recipients || []).length, 0);
            const hasResolved = totalCount > pendingCount;
            if (countEl) {
                countEl.textContent = `${pendingCount} pending${hasResolved ? ` • ${totalCount - pendingCount} resolved` : ''}`;
            }

            // Show / wire the Clear Resolved button (declared in HTML, see
            // pipelineSentView). Visible only when there are resolved rows.
            const clearBtn = document.getElementById('handoffSentClearBtn');
            if (clearBtn) {
                clearBtn.style.display = hasResolved ? '' : 'none';
            }

            if (currentSentHandoffs.length === 0) {
                emptyEl.style.display = 'flex';
                listEl.innerHTML = '';
                return;
            }
            listEl.style.display = 'flex';
            listEl.innerHTML = '';
            for (const item of currentSentHandoffs) {
                listEl.appendChild(buildHandoffSentCard(item));
            }
        } catch (err) {
            loadingEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast((err && err.message) || 'Failed to load sent hand-offs', 'error');
            }
        }
    }

    // listOut groups by recruit: { recruit, recipients: [{handoff_id, recipient,
    // message, state, acted_on_at, created_at}], created_at }. Recipients can
    // be in state 'pending' | 'accepted' | 'rejected' | 'rejected_duplicate'.
    function buildHandoffSentCard(item) {
        const recruit = item.recruit;
        const recipients = item.recipients || [];
        const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';

        const meta = [];
        if (recruit.positions && recruit.positions.length) meta.push(recruit.positions.join('/'));
        if (recruit.height_inches) meta.push(inchesToHeight(recruit.height_inches));
        if (recruit.weight_lbs) meta.push(`${recruit.weight_lbs} lbs`);
        if (recruit.graduation_year) meta.push(String(recruit.graduation_year));
        const subheader = meta.join(' • ');

        const hasAccount = !!recruit.linked_player_user_id;
        const accentColor = hasAccount ? '#1282a2' : '#9ca3af';
        const ringBg = hasAccount ? 'rgba(18, 130, 162, 0.18)' : 'rgba(156, 163, 175, 0.18)';
        const avatarInner = (hasAccount && recruit.profile_image_url)
            ? `<img src="${escapeHtml(recruit.profile_image_url)}" alt="" class="rb-pool-row-avatar-img">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>`;

        const STATE_PILL = {
            pending:            { label: 'Pending', cls: 'handoff-pill-pending' },
            accepted:           { label: 'Accepted', cls: 'handoff-pill-accepted' },
            rejected:           { label: 'Rejected', cls: 'handoff-pill-rejected' },
            rejected_duplicate: { label: 'Already in their pipeline', cls: 'handoff-pill-rejected' },
        };
        const chipsHtml = recipients.map(r => {
            const recip = r.recipient || {};
            const name = `${recip.first_name || ''} ${recip.last_name || ''}`.trim() || 'Coach';
            const initials = ((recip.first_name || '')[0] || '') + ((recip.last_name || '')[0] || '');
            const av = recip.profile_image_url
                ? `<img src="${escapeHtml(recip.profile_image_url)}" alt="" class="handoff-recipient-chip-img">`
                : `<span class="handoff-recipient-chip-initials">${escapeHtml(initials.toUpperCase() || 'C')}</span>`;
            const pill = STATE_PILL[r.state] || STATE_PILL.pending;
            return `
                <span class="handoff-recipient-chip">
                    <span class="handoff-recipient-chip-avatar">${av}</span>
                    <span class="handoff-recipient-chip-name">${escapeHtml(name)}</span>
                    <span class="handoff-pending-pill ${pill.cls}">${pill.label}</span>
                </span>
            `;
        }).join('');

        const messageHtml = (item.message && String(item.message).trim())
            ? `<div class="handoff-sent-message">"${escapeHtml(item.message)}"</div>`
            : '';

        const card = document.createElement('div');
        card.className = 'handoff-sent-card';
        card.dataset.recruitId = recruit.id;
        card.innerHTML = `
            <div class="handoff-sent-card-recruit">
                <div class="rb-pool-row-avatar" style="border-color: ${accentColor}; background: ${ringBg}; color: ${accentColor};">
                    ${avatarInner}
                </div>
                <div class="rb-pool-row-info">
                    <div class="rb-pool-row-name">${escapeHtml(fullName)}</div>
                    <div class="rb-pool-row-meta" style="color: ${accentColor};">${escapeHtml(subheader) || '<span class="pipeline-card-meta-empty">No details on file</span>'}</div>
                </div>
            </div>
            ${messageHtml}
            <div class="handoff-recipient-chips">${chipsHtml}</div>
        `;
        return card;
    }

    async function loadHandoffsReceived() {
        const listEl = document.getElementById('handoffReceivedList');
        const loadingEl = document.getElementById('handoffReceivedLoading');
        const emptyEl = document.getElementById('handoffReceivedEmpty');
        const countEl = document.getElementById('pipelineReceivedCount');
        if (!listEl) return;

        loadingEl.style.display = 'block';
        listEl.style.display = 'none';
        emptyEl.style.display = 'none';

        try {
            // Load received hand-offs in parallel with My Pipeline so we can
            // detect "already in your pipeline" duplicates regardless of
            // whether the coach has visited My Pipeline yet this session.
            const [data, myPipelineData] = await Promise.all([
                API.pipeline.getHandoffsIn(),
                API.pipeline.getMy().catch(() => null),
            ]);
            if (myPipelineData && Array.isArray(myPipelineData.recruits)) {
                currentPipelineRecruits = myPipelineData.recruits;
            }
            currentReceivedHandoffs = data.handoffs || [];
            loadingEl.style.display = 'none';
            if (countEl) countEl.textContent = `${currentReceivedHandoffs.length} awaiting your response`;

            if (currentReceivedHandoffs.length === 0) {
                emptyEl.style.display = 'flex';
                listEl.innerHTML = '';
                return;
            }
            listEl.style.display = 'flex';
            listEl.innerHTML = '';
            for (const item of currentReceivedHandoffs) {
                listEl.appendChild(buildHandoffReceivedCard(item));
            }
        } catch (err) {
            loadingEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast((err && err.message) || 'Failed to load received hand-offs', 'error');
            }
        }
    }

    function buildHandoffReceivedCard(item) {
        const sender = item.sender || {};
        const recruit = item.recruit || {};
        const eval_ = item.sender_evaluation || {};
        const priorChain = item.prior_evaluation_chain || [];
        const handoffId = item.handoff_id;

        const senderName = `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Coach';

        // Duplicate detection: if this recruit is already in my pipeline,
        // accepting would 409 server-side (UNIQUE constraint on pool_entry_id
        // or linked_player_user_id per coach). Show an inline banner and
        // disable Accept so the coach can only Reject — which clears the
        // pending hand-off without creating a duplicate row.
        const alreadyInPipeline = currentPipelineRecruits.some(pr => {
            if (recruit.linked_player_user_id && pr.linked_player_user_id) {
                return String(pr.linked_player_user_id) === String(recruit.linked_player_user_id);
            }
            if (recruit.pool_entry_id && pr.pool_entry_id) {
                return String(pr.pool_entry_id) === String(recruit.pool_entry_id);
            }
            return false;
        });

        const recruitName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';
        const meta = [];
        if (recruit.positions && recruit.positions.length) meta.push(recruit.positions.join('/'));
        if (recruit.height_inches) meta.push(inchesToHeight(recruit.height_inches));
        if (recruit.weight_lbs) meta.push(`${recruit.weight_lbs} lbs`);
        if (recruit.graduation_year) meta.push(String(recruit.graduation_year));
        const recruitMeta = meta.join(' • ');
        const hasAccount = !!recruit.linked_player_user_id;
        const recruitAccent = hasAccount ? '#1282a2' : '#9ca3af';
        const recruitRingBg = hasAccount ? 'rgba(18, 130, 162, 0.18)' : 'rgba(156, 163, 175, 0.18)';
        const recruitAvatarInner = (hasAccount && recruit.profile_image_url)
            ? `<img src="${escapeHtml(recruit.profile_image_url)}" alt="" class="rb-pool-row-avatar-img">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>`;

        // Sender's evaluation block
        const evalColorHex = COLOR_HEX[eval_.color_tag] || null;
        const evalGradeText = (eval_.grade != null) ? String(eval_.grade) : 'Not graded';
        const evalSwatchHtml = evalColorHex
            ? `<span class="handoff-eval-swatch" style="background:${evalColorHex};"></span>`
            : '';
        const evalNotesHtml = (eval_.notes && String(eval_.notes).trim())
            ? `<div class="handoff-eval-notes">${escapeHtml(eval_.notes)}</div>`
            : '';

        // Prior evaluation chain (collapsible). Hidden entirely when length is 0.
        const chainToggleHtml = priorChain.length > 0
            ? `<button class="handoff-chain-toggle" type="button" aria-expanded="false">
                   Show full grading history (${priorChain.length} prior coach${priorChain.length === 1 ? '' : 'es'})
               </button>
               <div class="handoff-chain-content" style="display: none;">${renderEvaluationChainTimeline(priorChain)}</div>`
            : '';

        const card = document.createElement('div');
        card.className = 'handoff-received-card';
        card.dataset.handoffId = handoffId;
        card.innerHTML = `
            <div class="handoff-sender-line">
                <strong>${escapeHtml(senderName)}</strong> sent you a player
            </div>
            <div class="handoff-received-recruit">
                <div class="rb-pool-row-avatar" style="border-color: ${recruitAccent}; background: ${recruitRingBg}; color: ${recruitAccent};">
                    ${recruitAvatarInner}
                </div>
                <div class="rb-pool-row-info">
                    <div class="rb-pool-row-name">${escapeHtml(recruitName)}</div>
                    <div class="rb-pool-row-meta" style="color: ${recruitAccent};">${escapeHtml(recruitMeta) || '<span class="pipeline-card-meta-empty">No details on file</span>'}</div>
                </div>
            </div>
            <div class="handoff-eval-block">
                <div class="handoff-eval-row">
                    <span class="handoff-eval-label">${escapeHtml(senderName)}'s grade:</span>
                    ${evalSwatchHtml}
                    <span class="handoff-eval-grade">${escapeHtml(evalGradeText)}</span>
                </div>
                ${evalNotesHtml}
            </div>
            ${chainToggleHtml}
            ${alreadyInPipeline
                ? '<div class="handoff-duplicate-banner">This player is already in your pipeline. Reject to clear this hand-off.</div>'
                : ''}
            <div class="handoff-actions">
                <button class="handoff-reject-btn" type="button">Reject</button>
                <button class="handoff-accept-btn" type="button"${alreadyInPipeline ? ' disabled title="Already in your pipeline"' : ''}>Add to Pipeline</button>
            </div>
        `;

        // Wire chain toggle
        const toggleBtn = card.querySelector('.handoff-chain-toggle');
        const chainContent = card.querySelector('.handoff-chain-content');
        if (toggleBtn && chainContent) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = chainContent.style.display !== 'none';
                chainContent.style.display = isOpen ? 'none' : 'block';
                toggleBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            });
        }

        // Wire accept / reject
        const acceptBtn = card.querySelector('.handoff-accept-btn');
        const rejectBtn = card.querySelector('.handoff-reject-btn');
        acceptBtn.addEventListener('click', () => acceptHandoff(handoffId, card, acceptBtn, rejectBtn));
        rejectBtn.addEventListener('click', () => rejectHandoff(handoffId, card, acceptBtn, rejectBtn));

        return card;
    }

    async function acceptHandoff(handoffId, card, acceptBtn, rejectBtn) {
        acceptBtn.disabled = true;
        if (rejectBtn) rejectBtn.disabled = true;
        try {
            const result = await API.pipeline.acceptHandoff(handoffId);
            if (typeof showToast === 'function') showToast('Added to your pipeline', 'success');

            // Optimistic prepend to currentPipelineRecruits
            if (result && result.recruit) {
                // Remove any stale copy with the same id first (defensive)
                currentPipelineRecruits = currentPipelineRecruits.filter(r => r.id !== result.recruit.id);
                currentPipelineRecruits.unshift(result.recruit);
                // If My Pipeline view is mounted, re-render it now
                rerenderMyPipelineList();
            }
            // Remove the Received card optimistically
            removeReceivedCard(card);
            // Quiet re-fetch for consistency
            refreshPipeline().catch(() => { /* noop — optimistic state is fine */ });
        } catch (err) {
            const status = err && err.status;
            if (status === 404) {
                if (typeof showToast === 'function') showToast('Hand-off already resolved', 'warning');
                removeReceivedCard(card);
            } else if (status === 403) {
                if (typeof showToast === 'function') showToast((err && err.message) || 'No longer at this school', 'error');
                removeReceivedCard(card);
            } else if (status === 409) {
                if (typeof showToast === 'function') showToast((err && err.message) || 'Already in your pipeline', 'warning');
                removeReceivedCard(card);
            } else {
                if (typeof showToast === 'function') showToast((err && err.message) || 'Failed to accept', 'error');
                acceptBtn.disabled = false;
                if (rejectBtn) rejectBtn.disabled = false;
            }
        }
    }

    async function rejectHandoff(handoffId, card, acceptBtn, rejectBtn) {
        const ok = await (typeof showConfirmModal === 'function'
            ? showConfirmModal({
                title: 'Reject hand-off',
                message: 'This will return the recruit to the sender. They can hand off again if needed.',
                confirmText: 'Reject',
                cancelText: 'Cancel',
                danger: true,
            })
            : Promise.resolve(window.confirm('Reject this hand-off?')));
        if (!ok) return;

        if (acceptBtn) acceptBtn.disabled = true;
        rejectBtn.disabled = true;
        try {
            await API.pipeline.rejectHandoff(handoffId);
            if (typeof showToast === 'function') showToast('Rejected', 'success');
            removeReceivedCard(card);
        } catch (err) {
            const status = err && err.status;
            if (status === 404) {
                if (typeof showToast === 'function') showToast('Hand-off already resolved', 'warning');
                removeReceivedCard(card);
            } else {
                if (typeof showToast === 'function') showToast((err && err.message) || 'Failed to reject', 'error');
                if (acceptBtn) acceptBtn.disabled = false;
                rejectBtn.disabled = false;
            }
        }
    }

    function removeReceivedCard(card) {
        if (!card) return;
        const handoffId = card.dataset.handoffId;
        currentReceivedHandoffs = currentReceivedHandoffs.filter(h => h.handoff_id !== handoffId);
        card.remove();

        // Update Received view's count subtitle + empty state
        const countEl = document.getElementById('pipelineReceivedCount');
        if (countEl) countEl.textContent = `${currentReceivedHandoffs.length} awaiting your response`;
        if (currentReceivedHandoffs.length === 0) {
            const listEl = document.getElementById('handoffReceivedList');
            const emptyEl = document.getElementById('handoffReceivedEmpty');
            if (listEl) listEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
        }
    }

    function rerenderMyPipelineList() {
        const listEl = document.getElementById('pipelineList');
        const emptyEl = document.getElementById('pipelineEmpty');
        const countEl = document.getElementById('pipelineCount');
        const resultsCountEl = document.getElementById('pipelineFilterResultsCount');
        if (!listEl) return;

        const total = currentPipelineRecruits.length;
        const { list: visible, active: filtersActive } = applyPipelineFilters(currentPipelineRecruits);

        // Header count — total in the pipeline. Filter status (if any) sits in
        // the filter footer's "Showing N recruits" badge.
        if (countEl) countEl.textContent = `${total} recruit${total === 1 ? '' : 's'}`;
        if (resultsCountEl) resultsCountEl.textContent = visible.length;

        // Two empty states:
        //   - True empty (no pipeline rows at all): show the dashed empty panel.
        //   - Filtered to zero (pipeline has rows but none match): show a small
        //     "No matches" inline message so the user knows to relax filters.
        if (total === 0) {
            listEl.style.display = 'none';
            listEl.innerHTML = '';
            if (emptyEl) {
                emptyEl.style.display = 'flex';
                // Make sure the empty panel content reflects the true-empty state
                emptyEl.innerHTML = '<p>Your pipeline is empty.</p><p class="rb-pipeline-empty-hint">Add recruits from the Team Pool, or visit a player\'s profile and click "Add to Pipeline".</p>';
            }
            return;
        }

        if (visible.length === 0 && filtersActive) {
            listEl.style.display = 'none';
            listEl.innerHTML = '';
            if (emptyEl) {
                emptyEl.style.display = 'flex';
                emptyEl.innerHTML = '<p>No recruits match your filters.</p><p class="rb-pipeline-empty-hint">Try Reset All to see your full pipeline.</p>';
            }
            return;
        }

        listEl.style.display = 'flex';
        listEl.innerHTML = '';
        for (const r of visible) listEl.appendChild(buildPipelineRow(r));
        if (emptyEl) emptyEl.style.display = 'none';
    }

    // Shared renderer used by both the Received card's collapsible timeline
    // AND the Evaluation Modal's History tab.
    function renderEvaluationChainTimeline(chain) {
        if (!Array.isArray(chain) || chain.length === 0) {
            return '<p class="eval-chain-empty">No prior evaluations.</p>';
        }
        const formatDate = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        };
        // Newest evaluations first. Sort defensively in case chain order is
        // not guaranteed (backend stores by insertion order, but render order
        // is a presentation concern).
        const sorted = [...chain].sort((a, b) => {
            const ta = new Date(a && a.evaluated_at ? a.evaluated_at : 0).getTime();
            const tb = new Date(b && b.evaluated_at ? b.evaluated_at : 0).getTime();
            return tb - ta;
        });
        return `<ol class="eval-chain-timeline">
            ${sorted.map(entry => {
                const colorHex = COLOR_HEX[entry.color_tag] || null;
                const swatch = colorHex
                    ? `<span class="eval-chain-swatch" style="background:${colorHex};"></span>`
                    : '<span class="eval-chain-swatch eval-chain-swatch-empty"></span>';
                // Left-edge stripe inherits the entry's color (or stays neutral
                // when ungraded) so swatch + stripe always agree.
                const stripeStyle = colorHex
                    ? ` style="border-left-color:${colorHex};"`
                    : ' style="border-left-color: rgba(255, 255, 255, 0.15);"';
                const grade = (entry.grade != null) ? entry.grade : '—';
                const name = escapeHtml(entry.coach_name || 'Coach');
                const date = formatDate(entry.evaluated_at);
                const notes = entry.notes && String(entry.notes).trim()
                    ? `<blockquote class="eval-chain-notes">${escapeHtml(entry.notes)}</blockquote>`
                    : '';
                return `
                    <li class="eval-chain-entry"${stripeStyle}>
                        <div class="eval-chain-entry-header">
                            ${swatch}
                            <div class="eval-chain-coach">
                                <span class="eval-chain-coach-name">${name}</span>
                            </div>
                            <span class="eval-chain-grade">${escapeHtml(String(grade))}</span>
                            ${date ? `<span class="eval-chain-date">${escapeHtml(date)}</span>` : ''}
                        </div>
                        ${notes}
                    </li>
                `;
            }).join('')}
        </ol>`;
    }

    // ====================================================================
    // SEND HAND-OFF MODAL (Plan 5B)
    // ====================================================================

    // Track which recipients are selected in the picker
    let sendHandoffSelectedIds = new Set();
    let sendHandoffCoaches = [];        // cached for "already has" badge cross-reference
    let sendHandoffRecruitId = null;    // the recruit we're sending

    async function openSendHandoffModal(recruit) {
        const modal = document.getElementById('sendHandoffModal');
        if (!modal || !recruit) return;
        sendHandoffRecruitId = recruit.id;
        sendHandoffSelectedIds = new Set();
        sendHandoffCoaches = [];

        // Header
        const nameEl = document.getElementById('sendHandoffRecruitName');
        if (nameEl) {
            const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'this recruit';
            nameEl.textContent = fullName;
        }

        // Reset body state
        const msgEl = document.getElementById('sendHandoffMessage');
        if (msgEl) msgEl.value = '';
        updateSendHandoffSubmitState();

        const listEl = document.getElementById('sendHandoffRecipientList');
        const emptyEl = document.getElementById('sendHandoffRecipientEmpty');
        if (listEl) listEl.innerHTML = '<p class="send-handoff-loading">Loading coaches…</p>';
        if (emptyEl) emptyEl.style.display = 'none';

        modal.classList.add('active');

        try {
            const data = await API.coaches.getAtMySchool();
            sendHandoffCoaches = (data && data.coaches) || [];
            renderRecipientPicker(recruit);
        } catch (err) {
            if (listEl) listEl.innerHTML = `<p class="send-handoff-error">${escapeHtml((err && err.message) || 'Failed to load coaches')}</p>`;
        }
    }

    function renderRecipientPicker(recruit) {
        const listEl = document.getElementById('sendHandoffRecipientList');
        const emptyEl = document.getElementById('sendHandoffRecipientEmpty');
        if (!listEl) return;
        if (sendHandoffCoaches.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        // Cross-reference: which coaches already have this recruit (DR-linked only)
        const myCacheHasRecruit = new Set();
        if (recruit && recruit.linked_player_user_id) {
            // The sender's local cache doesn't include other coaches' pipelines,
            // so we can only flag based on UI heuristics. For Plan 5B, we leave
            // the "already has" badge as a future enhancement once we have a
            // dedicated lookup. Keep the cross-reference set empty for now —
            // the backend's accept path 409s cleanly if a duplicate slips through.
            // This guard remains here as a hook for a future lookup endpoint.
        }

        listEl.innerHTML = '';
        for (const coach of sendHandoffCoaches) {
            const row = document.createElement('div');
            row.className = 'send-handoff-recipient-row';
            row.dataset.coachId = coach.user_id;
            const name = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Coach';
            const subParts = [];
            if (coach.team_name) subParts.push(coach.team_name);
            if (coach.state) subParts[0] = `${subParts[0] || ''}, ${coach.state}`;
            if (coach.college_division) subParts.push(coach.college_division);
            const sub = subParts.filter(Boolean).join(' • ');
            const initials = ((coach.first_name || '')[0] || '') + ((coach.last_name || '')[0] || '');
            const avatar = coach.profile_image_url
                ? `<img src="${escapeHtml(coach.profile_image_url)}" alt="" class="sg-coach-avatar-img">`
                : `<span class="sg-coach-initials">${escapeHtml(initials.toUpperCase() || 'C')}</span>`;
            const alreadyHasBadge = myCacheHasRecruit.has(coach.user_id)
                ? '<span class="send-handoff-already-has-badge">Already in their pipeline</span>'
                : '';
            row.innerHTML = `
                <div class="sg-coach-avatar">${avatar}</div>
                <div class="send-handoff-recipient-text">
                    <div class="sg-coach-name">${escapeHtml(name)} ${alreadyHasBadge}</div>
                    <div class="sg-coach-subheader">${escapeHtml(sub)}</div>
                </div>
                <div class="send-handoff-recipient-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            `;
            row.addEventListener('click', () => toggleRecipient(coach.user_id, row));
            listEl.appendChild(row);
        }
    }

    function toggleRecipient(coachId, row) {
        if (sendHandoffSelectedIds.has(coachId)) {
            sendHandoffSelectedIds.delete(coachId);
            row.classList.remove('selected');
        } else {
            sendHandoffSelectedIds.add(coachId);
            row.classList.add('selected');
        }
        updateSendHandoffSubmitState();
    }

    function updateSendHandoffSubmitState() {
        const btn = document.getElementById('sendHandoffSubmit');
        if (!btn) return;
        const n = sendHandoffSelectedIds.size;
        btn.disabled = n === 0;
        btn.textContent = `Send to ${n} coach${n === 1 ? '' : 'es'}`;
    }

    function closeSendHandoffModal() {
        const modal = document.getElementById('sendHandoffModal');
        if (modal) modal.classList.remove('active');
        sendHandoffSelectedIds = new Set();
        sendHandoffCoaches = [];
        sendHandoffRecruitId = null;
    }

    async function submitSendHandoff() {
        const btn = document.getElementById('sendHandoffSubmit');
        if (!btn || btn.disabled || !sendHandoffRecruitId) return;
        const ids = Array.from(sendHandoffSelectedIds);
        const msg = (document.getElementById('sendHandoffMessage') || {}).value || '';
        btn.disabled = true;
        try {
            await API.pipeline.sendHandoff(sendHandoffRecruitId, { to_coach_ids: ids, message: msg });
            if (typeof showToast === 'function') {
                showToast(`Sent to ${ids.length} coach${ids.length === 1 ? '' : 'es'}`, 'success');
            }
            // The sender keeps the recruit in their own pipeline — both coaches
            // work the same player independently. Refresh to pull in any
            // backend updates (e.g. updated_at bumps the row to the top).
            closeSendHandoffModal();
            closeEvaluationModal();
            refreshPipeline().catch(() => { /* noop */ });
        } catch (err) {
            const status = err && err.status;
            const msg = (err && err.message) || 'Failed to send';
            if (typeof showToast === 'function') {
                showToast(msg, status === 403 ? 'warning' : 'error');
            }
            btn.disabled = false;
        }
    }

    // ====================================================================
    // EVALUATION MODAL (Plan 4)
    // ====================================================================

    async function openEvaluationModal(recruit) {
        currentEvalRecruit = recruit;
        const modal = document.getElementById('evaluationModal');
        if (!modal) return;

        const hasAccount = !!recruit.linked_player_user_id;
        // Match buildPipelineRow: transfer recruits get red treatment +
        // YOE in the subheader. DR-linked non-transfer = cerulean.
        // Questionnaire-only = neutral gray.
        const isTransfer = hasAccount && !!recruit.is_transfer;
        let accentColor, ringBg;
        if (isTransfer) {
            accentColor = '#b91c1c';
            ringBg = 'rgba(185, 28, 28, 0.18)';
        } else if (hasAccount) {
            accentColor = '#1282a2';
            ringBg = 'rgba(18, 130, 162, 0.18)';
        } else {
            accentColor = '#9ca3af';
            ringBg = 'rgba(156, 163, 175, 0.18)';
        }

        const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';

        // Header — name on top with compact DR badge, subheader below.
        document.getElementById('evalName').textContent = fullName;
        const drBadge = document.getElementById('evalDrBadge');
        drBadge.style.display = hasAccount ? 'inline-flex' : 'none';
        // Pool badge fires only when the recruit was added via the team pool
        // (questionnaire-sourced). DR-direct recruits show DR alone.
        const poolBadge = document.getElementById('evalPoolBadge');
        if (poolBadge) poolBadge.style.display = recruit.source === 'pool' ? 'inline-flex' : 'none';

        const subParts = [];
        if (recruit.positions && recruit.positions.length) subParts.push(recruit.positions.join('/'));
        if (recruit.height_inches) subParts.push(inchesToHeight(recruit.height_inches));
        if (recruit.weight_lbs) subParts.push(`${recruit.weight_lbs} lbs`);
        if (isTransfer) {
            if (recruit.eligibility != null) {
                subParts.push(`YOE: ${recruit.eligibility} year${recruit.eligibility === 1 ? '' : 's'}`);
            }
        } else if (recruit.graduation_year) {
            subParts.push(String(recruit.graduation_year));
        }
        const subEl = document.getElementById('evalSubheader');
        if (subEl) {
            subEl.textContent = subParts.join(' • ');
            subEl.style.color = accentColor;
        }

        const avatarEl = document.getElementById('evalAvatar');
        avatarEl.style.borderColor = accentColor;
        avatarEl.style.background = ringBg;
        avatarEl.style.color = accentColor;
        avatarEl.innerHTML = (hasAccount && recruit.profile_image_url)
            ? `<img src="${escapeHtml(recruit.profile_image_url)}" alt="" class="eval-avatar-img">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>`;

        // Info tab — shows the recruit's available data so the coach doesn't
        // have to leave the modal. Two sections:
        //   - DR Profile link (only if recruit has a DR account; opens the
        //     full /shared/view-profile.html page in a new tab)
        //   - Questionnaire (only if recruit has questionnaire data — pool-
        //     sourced recruits)
        // For questionnaire-only recruits, only the Questionnaire section
        // renders. For DR-only recruits (added from a profile), only the
        // link renders. For recruits with both, both render with the DR
        // link above the questionnaire data.
        const qSection = document.getElementById('evalQuestionnaireSection');
        const pSection = document.getElementById('evalProfileSection');
        const emptyMsg = document.getElementById('evalInfoEmpty');
        const redactedBanner = document.getElementById('evalRedactedBanner');
        const hasQuestionnaire = recruit.source === 'pool';
        // Team-switch redaction: board entry was pool-sourced at the old
        // school. Show the friendly banner instead of a stale questionnaire
        // view or a "Failed to load" error.
        const isRedacted = recruit._redactedFromOldSchool === true;

        if (hasAccount) {
            pSection.style.display = 'block';
            const profileLink = document.getElementById('evalProfileLink');
            // Same-tab nav so the browser Back button returns the coach to
            // the recruiting board with the eval modal re-opened. ?from=
            // tells the player-side sidebar-nav.js which nav item to mark
            // active (recruiting-board) once that's added to the player
            // sidebar map. The replaceState below encodes which recruit's
            // modal to re-open on Back.
            profileLink.href = `../../shared/view-profile.html?userId=${encodeURIComponent(recruit.linked_player_user_id)}&from=recruiting-board`;
        } else {
            pSection.style.display = 'none';
        }

        if (isRedacted) {
            // Banner shows. Skip the questionnaire fetch entirely — there's
            // nothing to load (pool_entry_id was nulled out at switch time).
            if (redactedBanner) redactedBanner.style.display = 'flex';
            qSection.style.display = 'none';
        } else if (hasQuestionnaire) {
            if (redactedBanner) redactedBanner.style.display = 'none';
            qSection.style.display = 'block';
            const qBodyEl = document.getElementById('evalQuestionnaireBody');
            // Pipeline-source recruits arrive with submission_data already
            // shipped by the backend. Board-source recruits (from the football
            // field) do not — lazy-fetch the latest submission via /my-pool.
            if (recruit.submission_data) {
                qBodyEl.innerHTML = renderQuestionnaireView(recruit.submission_data, recruit.transcript_url || null);
            } else if (recruit._source === 'board' && recruit.pool_entry_id) {
                qBodyEl.innerHTML = '<p class="pool-detail-loading">Loading…</p>';
                API.get(`/recruiting-board/my-pool/${recruit.pool_entry_id}`).then(res => {
                    const submissions = (res && res.submissions) || [];
                    const latest = submissions.length ? submissions[submissions.length - 1].submission_data : {};
                    recruit.submission_data = latest;
                    // The detail endpoint signs entry.transcript_url from the
                    // latest submission — use it directly so the link works.
                    const txUrl = (res && res.entry && res.entry.transcript_url) || null;
                    recruit.transcript_url = txUrl;
                    qBodyEl.innerHTML = renderQuestionnaireView(latest, txUrl);
                }).catch(() => {
                    qBodyEl.innerHTML = '<p class="pool-detail-error">Failed to load questionnaire.</p>';
                });
            } else {
                qBodyEl.innerHTML = renderQuestionnaireView({});
            }
        } else {
            if (redactedBanner) redactedBanner.style.display = 'none';
            qSection.style.display = 'none';
        }

        if (emptyMsg) {
            // The redacted banner counts as content too — don't show the
            // "no questionnaire or profile info available" fallback when
            // the banner is visible.
            emptyMsg.style.display = (hasAccount || hasQuestionnaire || isRedacted) ? 'none' : 'block';
        }

        // Phase 3 — merged Evaluation + History tab. Fetch the cross-coach
        // evaluations (live, including soft-deleted historicals), populate the
        // list, resolve _inMyPipeline, cache id from the viewer's own active
        // row. Then fetch board promotions to show/hide the Final Grade tab,
        // and finally update the footer button states.
        await loadEvaluationsForModal(recruit);
        await loadBoardPromotionsForModal(recruit);
        updateFooterButtonsForPipelineState();

        // Always reset to the Info tab on open
        switchEvalTab('info');

        // Force a hard height ceiling + internal scroll on the modal body so
        // the "Show questionnaire / profile info" panel can expand without
        // pushing the modal off-screen. Setting via inline style guarantees
        // we win over any cached/competing CSS — the rule lives in
        // recruiting-board.css too but inline is the belt-and-suspenders.
        const modalContent = modal.querySelector('.recruiting-board-modal-content');
        const modalBody = modal.querySelector('.recruiting-board-modal-body');
        if (modalContent) {
            modalContent.style.maxHeight = '90vh';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            modalContent.style.overflow = 'hidden';
        }
        if (modalBody) {
            modalBody.style.flex = '1 1 auto';
            modalBody.style.minHeight = '0';
            modalBody.style.maxHeight = 'calc(90vh - 180px)';
            modalBody.style.overflowY = 'auto';
        }

        modal.classList.add('active');
    }

    // Phase 3: switch between Info / Evaluation / Final Grade tabs inside the
    // unified Eval Modal. Scoped to #evaluationModal so the new #gradeEntryModal
    // can host its own tab-like UI without colliding.
    function switchEvalTab(tabKey) {
        const modal = document.getElementById('evaluationModal');
        if (!modal) return;
        const target = modal.querySelector(`.eval-tab[data-eval-tab="${tabKey}"]`);
        if (target && (target.disabled || target.style.display === 'none')) return;
        modal.querySelectorAll('.eval-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.evalTab === tabKey);
        });
        modal.querySelectorAll('.eval-tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.evalTabContent === tabKey);
        });
    }

    function closeEvaluationModal() {
        const modal = document.getElementById('evaluationModal');
        if (modal) modal.classList.remove('active');
        currentEvalRecruit = null;
    }

    async function removeRecruitFromPipeline() {
        if (!currentEvalRecruit || !currentEvalRecruit.id) return;
        const ok = await (typeof showConfirmModal === 'function'
            ? showConfirmModal({
                title: 'Remove from Pipeline',
                message: "Remove this recruit from your pipeline? Your past grade stays in the evaluation history for reference.",
                confirmText: 'Remove',
                cancelText: 'Cancel',
                danger: true,
                icon: 'trash'
            })
            : Promise.resolve(window.confirm('Remove this recruit from your pipeline?')));
        if (!ok) return;

        const fromBoardSource = currentEvalRecruit._source === 'board';
        const removedRecruitId = currentEvalRecruit.id;

        try {
            const result = await API.pipeline.remove(removedRecruitId);
            if (typeof showToast === 'function') showToast('Removed from pipeline', 'success');

            if (!fromBoardSource) {
                // Pipeline-source: remove from in-memory list + re-render
                currentPipelineRecruits = currentPipelineRecruits.filter(r => r.id !== removedRecruitId);
                const listEl = document.getElementById('pipelineList');
                const emptyEl = document.getElementById('pipelineEmpty');
                const countEl = document.getElementById('pipelineCount');
                if (countEl) countEl.textContent = `${currentPipelineRecruits.length} recruit${currentPipelineRecruits.length === 1 ? '' : 's'}`;
                if (listEl) {
                    listEl.innerHTML = '';
                    for (const r of currentPipelineRecruits) listEl.appendChild(buildPipelineRow(r));
                }
                if (currentPipelineRecruits.length === 0 && emptyEl) {
                    emptyEl.style.display = 'flex';
                    if (listEl) listEl.style.display = 'none';
                }
            }

            // Sync the pool tab's matching row if it's mounted (both sources)
            if (result.pool_entry_id) {
                const poolRow = document.querySelector(`.rb-pool-row[data-entry-id="${result.pool_entry_id}"]`);
                if (poolRow) {
                    // I no longer have them → button flips back to "Add to Pipeline"
                    const actionsEl = poolRow.querySelector('.rb-pool-row-actions');
                    if (actionsEl) {
                        actionsEl.innerHTML = '<button class="rb-pool-row-action add-pipeline" type="button">Add to Pipeline</button>';
                        const newBtn = actionsEl.querySelector('.rb-pool-row-action.add-pipeline');
                        if (newBtn) newBtn.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            addPoolEntryToPipeline(result.pool_entry_id, { rowEl: poolRow });
                        });
                    }
                    // Cross-coach checkmark clears only if no one else at the school has them
                    if (!result.still_in_any_pipeline_at_school) {
                        const checkEl = poolRow.querySelector('.rb-pool-row-check');
                        if (checkEl) checkEl.remove();
                    }
                }
            }

            if (fromBoardSource) {
                // Board-source: keep the modal open, swap footer buttons back
                // to "Add to Pipeline" state, refresh the evaluation list so
                // the just-removed row shows up as (inactive). The football-
                // field card stays put.
                currentEvalRecruit._inMyPipeline = false;
                currentEvalRecruit.id = null;
                await loadEvaluationsForModal(currentEvalRecruit);
                updateFooterButtonsForPipelineState();
            } else {
                closeEvaluationModal();
            }
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to remove', 'error');
            }
        }
    }

    // ====================================================================
    // ADD-TO-BOARD MODAL (Plan 4 Step 9)
    // ====================================================================

    // Context for the Add-to-Board modal. Final-synthesis fields (finalGrade /
    // finalColor / viewerInSelectedGroup) are reset on each open and only fed
    // into the POST body when the coach picks Shared Board.
    let addBoardContext = null;

    async function openAddBoardModal() {
        if (!currentEvalRecruit) return;
        // Questionnaire-only recruits (no DR account) are routed via
        // pool_entry_id in confirmAddToBoard. Both paths reach the same
        // backend route; the football field renders the right card variant.
        const modal = document.getElementById('addBoardModal');
        if (!modal) return;

        // Load personal boards + groups + current user (for the grading_history
        // snapshot's "current coach" entry) in parallel.
        try {
            const [personalRes, groupsRes, me] = await Promise.all([
                API.get('/recruiting-board/personal'),
                API.get('/recruiting-board/groups'),
                API.auth.getCurrentUser().catch(() => null)
            ]);
            const personalBoards = (personalRes && personalRes.boards) || personalRes || [];
            const sharedGroups = (groupsRes && groupsRes.groups) || groupsRes || [];

            const currentUser = me && me.user ? {
                id: me.user.id,
                name: ((me.profile && (me.profile.first_name || '')) + ' ' + (me.profile && (me.profile.last_name || ''))).trim() || null,
                title: (me.profile && me.profile.position) || null,
            } : null;

            addBoardContext = {
                recruit: currentEvalRecruit,
                personalBoards,
                sharedGroups,
                currentUser,
                finalGrade: null,
                finalColor: null,
                viewerInSelectedGroup: false,
                // Hint the populate helper uses to pre-select the recruit's
                // first position when the board's config contains it. The
                // actual position list is fetched per-board via
                // populateAddBoardPositionsFromBoard.
                preferredPosition: (currentEvalRecruit.positions && currentEvalRecruit.positions[0]) || null
            };

            // Reset radio to personal
            const personalRadio = document.querySelector('input[name="addBoardType"][value="personal"]');
            personalRadio.checked = true;
            const sharedRadio = document.querySelector('input[name="addBoardType"][value="shared"]');
            sharedRadio.checked = false;
            // Disable Shared option if not in any group
            const sharedOption = document.getElementById('addBoardSharedOption');
            if (sharedGroups.length === 0) {
                sharedOption.classList.add('disabled');
                sharedRadio.disabled = true;
                sharedOption.title = 'Join a shared group to add to a shared board.';
            } else {
                sharedOption.classList.remove('disabled');
                sharedRadio.disabled = false;
                sharedOption.title = '';
            }

            // Position dropdown is populated reactively by
            // populateAddBoardPositionsFromBoard() once handleAddBoardTypeChange
            // sets the initial boardSelect value below. Clear it here so the
            // user doesn't briefly see a stale list.
            const posSelect = document.getElementById('addBoardPositionSelect');
            posSelect.innerHTML = '<option value="" disabled selected>Loading positions…</option>';
            posSelect.disabled = true;

            // Reset final-synthesis UI to a clean slate every time we open.
            // Both personal and shared modes use these controls now.
            const finalGradeSlider = document.getElementById('addBoardFinalGrade');
            const finalGradeReadout = document.getElementById('addBoardFinalGradeReadout');
            const finalNotesEl = document.getElementById('addBoardFinalNotes');
            if (finalGradeSlider) finalGradeSlider.value = 50;
            if (finalGradeReadout) finalGradeReadout.textContent = '—';
            if (finalNotesEl) finalNotesEl.value = '';
            document.querySelectorAll('#addBoardFinalColorRowInner .addboard-color-swatch')
                .forEach(b => b.classList.remove('selected'));

            // Wire personal/shared change + initial population
            handleAddBoardTypeChange();
            modal.classList.add('active');
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to load boards', 'error');
            }
        }
    }

    function closeAddBoardModal() {
        const modal = document.getElementById('addBoardModal');
        if (modal) modal.classList.remove('active');
        addBoardContext = null;
    }

    // Reactively populate the Add-to-Board position dropdown from the
    // CURRENTLY SELECTED board's config. Replaces the old hardcoded 24-
    // position list. Flattens offense + defense + specs into a flat,
    // deduped list. Pre-selects addBoardContext.preferredPosition (the
    // recruit's first position) when the board's config contains it.
    // Handles three edge cases: no board picked yet, empty board (no
    // positions), and fetch failure.
    async function populateAddBoardPositionsFromBoard() {
        if (!addBoardContext) return;
        const posSelect = document.getElementById('addBoardPositionSelect');
        const boardSelect = document.getElementById('addBoardSelect');
        if (!posSelect || !boardSelect) return;
        const boardId = boardSelect.value;
        const typeInput = document.querySelector('input[name="addBoardType"]:checked');
        const type = typeInput ? typeInput.value : 'personal';

        if (!boardId) {
            posSelect.innerHTML = '<option value="" disabled selected>Select a board first</option>';
            posSelect.disabled = true;
            evaluateConfirmEnabled();
            return;
        }

        try {
            let cfg;
            if (type === 'personal') {
                cfg = await API.get(`/recruiting-board/personal/${boardId}/config`);
            } else {
                const groupSelect = document.getElementById('addBoardGroupSelect');
                const groupId = groupSelect && groupSelect.value;
                if (!groupId) {
                    posSelect.innerHTML = '<option value="" disabled selected>Select a group first</option>';
                    posSelect.disabled = true;
                    evaluateConfirmEnabled();
                    return;
                }
                cfg = await API.get(`/recruiting-board/groups/${groupId}/boards/${boardId}/config`);
            }

            // Flatten the three section arrays. Empty/missing sections OK.
            const flatten = (sections) => (Array.isArray(sections) ? sections : [])
                .flatMap(s => Array.isArray(s.positions) ? s.positions : []);
            // Apply the same defensive fallback used by loadPersonal/SharedGroupBoard:
            // an empty array means "render the default" (legacy board pre-migration 039,
            // or new section the coach hasn't touched). This keeps the Add-to-Board
            // dropdown in sync with what the football field actually shows.
            const off = (Array.isArray(cfg.offensePositions) && cfg.offensePositions.length > 0)
                ? cfg.offensePositions : DEFAULT_OFFENSE_POSITIONS;
            const def = (Array.isArray(cfg.defensePositions) && cfg.defensePositions.length > 0)
                ? cfg.defensePositions : DEFAULT_DEFENSE_POSITIONS;
            const spc = (Array.isArray(cfg.specsPositions) && cfg.specsPositions.length > 0)
                ? cfg.specsPositions : DEFAULT_SPECS_POSITIONS;
            const allPositions = [...flatten(off), ...flatten(def), ...flatten(spc)];

            // De-dupe (e.g. coach put QB in both offense and a custom group).
            const seen = new Set();
            const unique = allPositions.filter(p => {
                if (!p || seen.has(p)) return false;
                seen.add(p);
                return true;
            });

            if (unique.length === 0) {
                posSelect.innerHTML = '<option value="" disabled selected>This board has no positions — add one first</option>';
                posSelect.disabled = true;
            } else {
                posSelect.disabled = false;
                posSelect.innerHTML = unique.map(p =>
                    `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`
                ).join('');
                const preferred = addBoardContext.preferredPosition;
                if (preferred && unique.includes(preferred)) {
                    posSelect.value = preferred;
                }
            }
        } catch (err) {
            posSelect.innerHTML = '<option value="" disabled selected>Failed to load board positions</option>';
            posSelect.disabled = true;
        }
        evaluateConfirmEnabled();
    }

    function handleAddBoardTypeChange() {
        if (!addBoardContext) return;
        const type = document.querySelector('input[name="addBoardType"]:checked').value;
        const groupRow = document.getElementById('addBoardGroupRow');
        const boardSelect = document.getElementById('addBoardSelect');
        const warning = document.getElementById('addBoardWarning');
        const finalGradeRow = document.getElementById('addBoardFinalGradeRow');
        const finalColorRow = document.getElementById('addBoardFinalColorRow');
        const finalNotesRow = document.getElementById('addBoardFinalNotesRow');
        const confirmBtn = document.getElementById('addBoardConfirmBtn');
        warning.style.display = 'none';
        warning.textContent = '';

        // Both modes show final-grade/color/notes — personal and shared cards
        // both render the swatch + grade badge on the football field.
        if (finalGradeRow) finalGradeRow.style.display = 'block';
        if (finalColorRow) finalColorRow.style.display = 'block';
        if (finalNotesRow) finalNotesRow.style.display = 'block';
        prefillFinalGradeAndColor();

        if (type === 'personal') {
            groupRow.style.display = 'none';
            if (confirmBtn) confirmBtn.textContent = 'Add to Board';

            const boards = addBoardContext.personalBoards;
            if (boards.length === 0) {
                boardSelect.innerHTML = '<option value="" disabled selected>No personal boards — create one first</option>';
                warning.style.display = 'block';
                warning.textContent = 'You don\'t have any personal boards yet. Create one from the Personal Boards tab.';
            } else {
                boardSelect.innerHTML = boards.map(b =>
                    `<option value="${b.id}">${escapeHtml(b.board_name || 'My Board')}</option>`
                ).join('');
            }
            // Refresh the position dropdown to reflect the now-selected board.
            populateAddBoardPositionsFromBoard();
        } else {
            groupRow.style.display = 'block';
            if (confirmBtn) confirmBtn.textContent = 'Add to Shared Board';

            // Populate groups dropdown
            const groupSelect = document.getElementById('addBoardGroupSelect');
            groupSelect.innerHTML = addBoardContext.sharedGroups.map(g =>
                `<option value="${g.id}">${escapeHtml(g.group_name || 'Group')}</option>`
            ).join('');

            if (addBoardContext.sharedGroups.length > 0) {
                handleAddBoardGroupChange();
            }
        }
    }

    async function handleAddBoardGroupChange() {
        if (!addBoardContext) return;
        const groupSelect = document.getElementById('addBoardGroupSelect');
        const boardSelect = document.getElementById('addBoardSelect');
        const warning = document.getElementById('addBoardWarning');
        const groupId = groupSelect.value;
        if (!groupId) return;

        // Per-group permission lookup. listGroupsForUser returns `my_permission`
        // per group; viewers can browse the modal but Confirm stays disabled.
        const selectedGroup = addBoardContext.sharedGroups.find(g => String(g.id) === String(groupId));
        addBoardContext.viewerInSelectedGroup = !!(selectedGroup && selectedGroup.my_permission === 'viewer');

        try {
            const res = await API.get(`/recruiting-board/groups/${groupId}/boards`);
            const boards = (res && res.boards) || res || [];
            if (boards.length === 0) {
                boardSelect.innerHTML = '<option value="" disabled selected>No shared boards in this group</option>';
                warning.style.display = 'block';
                warning.textContent = 'This group has no shared boards yet. Create one from the Shared Boards tab.';
            } else {
                boardSelect.innerHTML = boards.map(b =>
                    `<option value="${b.id}">${escapeHtml(b.board_name || 'Board')}</option>`
                ).join('');
                if (addBoardContext.viewerInSelectedGroup) {
                    warning.style.display = 'block';
                    warning.textContent = 'You need editor permissions to add to a shared board.';
                } else {
                    warning.style.display = 'none';
                    warning.textContent = '';
                }
            }
        } catch (err) {
            boardSelect.innerHTML = '<option value="">Failed to load boards</option>';
        }
        // Refresh the position dropdown for the (possibly new) default board.
        populateAddBoardPositionsFromBoard();
    }

    // Compute mean/mode prefills and seed the slider + swatch row. Also toggles
    // the "No prior grades" hint when nothing in the chain has a grade AND the
    // recruit has no own grade.
    function prefillFinalGradeAndColor() {
        if (!addBoardContext) return;
        const recruit = addBoardContext.recruit;
        const chain = (recruit && Array.isArray(recruit.evaluation_chain)) ? recruit.evaluation_chain : [];
        const ownGrade = (recruit && recruit.grade != null) ? recruit.grade : null;
        const ownColor = (recruit && recruit.color_tag) || null;

        // Final grade
        const slider = document.getElementById('addBoardFinalGrade');
        const readout = document.getElementById('addBoardFinalGradeReadout');
        const hint = document.getElementById('addBoardEmptyChainHint');
        const hasAnyGrade = (ownGrade != null) || chain.some(e => e && e.grade != null);
        const mean = computeFinalGradeMean(chain, ownGrade);
        if (slider) slider.value = mean;
        if (hasAnyGrade) {
            addBoardContext.finalGrade = mean;
            if (readout) readout.textContent = String(mean);
            if (hint) hint.style.display = 'none';
        } else {
            // Empty chain: leave the slider visually at 50 but treat as null
            // until the coach touches it. Hint message explains the requirement.
            addBoardContext.finalGrade = null;
            if (readout) readout.textContent = '—';
            if (hint) hint.style.display = 'block';
        }

        // Final color — pick the mode token (or null if no entries)
        const mode = computeMostCommonColor(chain, ownColor);
        addBoardContext.finalColor = mode;
        document.querySelectorAll('#addBoardFinalColorRowInner .addboard-color-swatch').forEach(b => {
            b.classList.toggle('selected', b.dataset.color === (mode || ''));
        });
    }

    // Central gate for the Confirm button. Both modes require final grade +
    // final color (personal-board cards now also render the swatch + grade
    // badge, so they need both inputs too). Shared mode additionally requires
    // not being a viewer in the selected group.
    function evaluateConfirmEnabled() {
        const confirmBtn = document.getElementById('addBoardConfirmBtn');
        if (!confirmBtn || !addBoardContext) return;
        const type = document.querySelector('input[name="addBoardType"]:checked');
        if (!type) { confirmBtn.disabled = true; return; }

        const boardId = (document.getElementById('addBoardSelect') || {}).value;
        const position = (document.getElementById('addBoardPositionSelect') || {}).value;
        const hasFinals = addBoardContext.finalGrade != null
            && addBoardContext.finalColor != null;

        if (type.value === 'personal') {
            confirmBtn.disabled = !(hasFinals && !!boardId && !!position);
            return;
        }
        // Shared: also gate on group permission + groupId set
        const groupId = (document.getElementById('addBoardGroupSelect') || {}).value;
        confirmBtn.disabled = !(hasFinals
            && !addBoardContext.viewerInSelectedGroup
            && !!groupId && !!boardId && !!position);
    }

    async function confirmAddToBoard() {
        if (!addBoardContext) return;
        const recruit = addBoardContext.recruit;
        const type = document.querySelector('input[name="addBoardType"]:checked').value;
        const boardId = document.getElementById('addBoardSelect').value;
        const position = document.getElementById('addBoardPositionSelect').value;

        if (!boardId) {
            if (typeof showToast === 'function') showToast('Pick a board first', 'warning');
            return;
        }

        // Build the playerData body matching the existing /personal/:boardId/players
        // and /groups/:groupId/boards/:boardId/players shape. The football field
        // routes the player to offense vs defense based on the chosen position,
        // so no explicit `side` field is needed.
        //
        // Two paths:
        //   - DR-account recruit → identified by user_id, football field renders
        //     with profile link.
        //   - Questionnaire-only → identified by pool_entry_id, football field
        //     renders a no-profile-link card variant (pulled forward from Plan 6).
        const playerData = {
            username: recruit.username || '',
            first_name: recruit.first_name || '',
            last_name: recruit.last_name || '',
            height: recruit.height_inches || null,
            weight: recruit.weight_lbs || null,
            graduation_year: recruit.graduation_year || null,
            team_name: recruit.team_name || '',
            state: recruit.state || '',
            college_division: recruit.college_division || null,
            profile_image_url: recruit.profile_image_url || null,
            player_type: recruit.is_transfer ? 'transfer' : 'hs',
            position
        };
        if (recruit.linked_player_user_id) {
            playerData.user_id = recruit.linked_player_user_id;
        } else if (recruit.pool_entry_id) {
            playerData.pool_entry_id = recruit.pool_entry_id;
        } else {
            if (typeof showToast === 'function') showToast('This recruit has no DR account or pool entry — cannot add to board.', 'error');
            return;
        }

        // Both personal and shared modes attach the final synthesis + frozen
        // grading history snapshot + promoted_by_name. Server stamps the rest
        // of the audit fields. Final notes come from the new textarea (may be
        // empty string — server tolerates).
        const finalNotesEl = document.getElementById('addBoardFinalNotes');
        playerData.final_grade = addBoardContext.finalGrade;
        playerData.final_color_tag = addBoardContext.finalColor;
        playerData.final_notes = finalNotesEl ? (finalNotesEl.value || null) : null;
        playerData.grading_history = buildGradingHistorySnapshot(recruit, addBoardContext.currentUser);
        if (addBoardContext.currentUser && addBoardContext.currentUser.name) {
            playerData.promoted_by_name = addBoardContext.currentUser.name;
        }

        try {
            if (type === 'personal') {
                await API.post(`/recruiting-board/personal/${boardId}/players`, playerData);
            } else {
                const groupId = document.getElementById('addBoardGroupSelect').value;
                await API.post(`/recruiting-board/groups/${groupId}/boards/${boardId}/players`, playerData);
            }
            if (typeof showToast === 'function') showToast('Added to board', 'success');
            closeAddBoardModal();
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to add to board', 'error');
            }
        }
    }

    // ====================================================================
    // UNIFIED INFO MODAL — Phase 3 helpers
    // ====================================================================
    // The on-board "Show Info" modal and the pipeline-card eval modal are now
    // ONE modal (#evaluationModal). Football-field cards route through
    // openEvaluationModal(buildUnifiedRecruitFromBoardPlayer(player, ctx)).
    // The Evaluation tab is a merged list of every coach's grade at the school
    // (live cross-coach + soft-deleted historicals), with an Add/Edit Grade
    // button at the top that opens #gradeEntryModal as a z-index 1100 sub-modal.
    // The Final Grade tab is conditional: revealed only when the recruit
    // appears on a shared board the viewer is a member of.

    // Adapt a football-field card's player JSONB into the recruit shape that
    // openEvaluationModal expects. The viewer might not have the recruit in
    // their pipeline (_inMyPipeline resolved by loadEvaluationsForModal); in
    // that case the footer button reads "Add to Pipeline" and the other two
    // are disabled via updateFooterButtonsForPipelineState.
    function buildUnifiedRecruitFromBoardPlayer(player, boardContext) {
        if (!player) return null;
        const positions = player.position ? [player.position] : null;
        return {
            id: null,                                              // resolved by loadEvaluationsForModal if viewer has an active row
            pool_entry_id: player.pool_entry_id || null,
            linked_player_user_id: player.user_id || null,
            school_key: null,
            status: null,
            grade: null,
            color_tag: null,
            notes: null,
            evaluation_chain: [],
            all_school_evaluations: [],                            // populated fresh by loadEvaluationsForModal
            first_name: player.first_name || '',
            last_name: player.last_name || '',
            username: player.username || null,
            positions,
            height_inches: typeof player.height === 'number' ? player.height : null,
            weight_lbs: typeof player.weight === 'number' ? player.weight : null,
            graduation_year: player.graduation_year || null,
            gpa: null,
            state: player.state || null,
            city: null,
            high_school: null,
            team_name: player.team_name || null,
            college_division: player.college_division || null,
            is_transfer: player.player_type === 'transfer',
            profile_image_url: player.profile_image_url || null,
            source: player.user_id ? 'dr_profile' : 'pool',
            submission_data: null,                                 // lazy-fetched in openEvaluationModal Info tab for pool-sourced
            _source: 'board',
            _boardContext: boardContext,
            _inMyPipeline: undefined,
            // Surfaced by the team-switch redaction in
            // RecruitingBoard.redactPoolSourcedFromPersonalBoards. When true,
            // the Info tab renders a "different school" banner instead of
            // questionnaire data — the original questionnaire was gathered
            // by a different school and was scrubbed when the coach switched
            // teams.
            _redactedFromOldSchool: player.redacted_from_old_school === true,
        };
    }

    // Fetch + render the cross-coach evaluation list for the open recruit.
    // Sets recruit._evaluations + _inMyPipeline + caches recruit.id from the
    // viewer's own active row (if any). Updates the Add/Edit Grade button.
    async function loadEvaluationsForModal(recruit) {
        if (!recruit) return;
        const params = {
            poolEntryId: recruit.pool_entry_id || null,
            linkedPlayerUserId: recruit.linked_player_user_id || null,
        };
        let evaluations = [];
        if (params.poolEntryId || params.linkedPlayerUserId) {
            try {
                const res = await API.pipeline.getEvaluations(params);
                evaluations = (res && Array.isArray(res.evaluations)) ? res.evaluations : [];
            } catch (_) { /* non-fatal */ }
        }
        recruit._evaluations = evaluations;

        // Resolve viewer's pipeline state. /pipeline/evaluations only returns
        // rows that have a grade/color/notes set — a freshly-added ungraded
        // recruit won't show up there, so the mineActive check alone would
        // wrongly say "not in pipeline". Three resolution paths in order:
        //   1. Recruits opened from the pipeline list already carry recruit.id
        //      AND have _source != 'board' — trust that as truth, they're in.
        //   2. mineActive from evaluations — graded board-sourced recruits.
        //   3. /pipeline/contains lookup for DR-linked board-sourced recruits
        //      (the only path that catches ungraded board-source rows).
        const mineActive = evaluations.find(e => e.is_mine && e.is_active);
        if (recruit._source !== 'board' && recruit.id) {
            recruit._inMyPipeline = true;
        } else if (mineActive) {
            recruit._inMyPipeline = true;
            if (mineActive.recruit_id) recruit.id = mineActive.recruit_id;
        } else if (recruit.linked_player_user_id) {
            // Board-sourced, ungraded — last check via /contains. Non-fatal:
            // a 404/500 just leaves _inMyPipeline false (button stays "Add").
            try {
                const containsRes = await API.pipeline.contains(recruit.linked_player_user_id);
                recruit._inMyPipeline = !!(containsRes && containsRes.in_pipeline);
                if (containsRes && containsRes.recruit_id) recruit.id = containsRes.recruit_id;
            } catch (_) {
                recruit._inMyPipeline = false;
            }
        } else {
            recruit._inMyPipeline = false;
        }

        // Render the list
        const listEl = document.getElementById('evalEvaluationsList');
        const emptyEl = document.getElementById('evalEvaluationsEmpty');
        if (listEl && emptyEl) {
            if (!evaluations.length) {
                listEl.innerHTML = '';
                emptyEl.style.display = 'block';
            } else {
                emptyEl.style.display = 'none';
                listEl.innerHTML = renderEvaluationsList(evaluations);
            }
        }

        // Sync the Add / Edit Grade button
        const btn = document.getElementById('evalAddOrEditGradeBtn');
        if (btn) {
            btn.textContent = mineActive ? 'Edit Grade' : 'Add Grade';
            btn.disabled = !recruit._inMyPipeline;
            btn.title = recruit._inMyPipeline ? '' : 'Add to your pipeline first';
        }
    }

    // Single-line + caret list of every coach's grade at the school. Newest
    // first. is_mine rows get an accent border; is_active=false rows render
    // muted with an "(inactive)" badge. Notes blockquote expands via caret.
    function renderEvaluationsList(evaluations) {
        if (!Array.isArray(evaluations) || evaluations.length === 0) return '';
        const formatDate = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        };
        const sorted = [...evaluations].sort((a, b) => {
            const ta = new Date(a && a.evaluated_at ? a.evaluated_at : 0).getTime();
            const tb = new Date(b && b.evaluated_at ? b.evaluated_at : 0).getTime();
            return tb - ta;
        });
        return sorted.map((entry, idx) => {
            const colorHex = COLOR_HEX[entry.color_tag] || null;
            const swatch = colorHex
                ? `<span class="eval-evaluations-swatch" style="background:${colorHex};"></span>`
                : '<span class="eval-evaluations-swatch eval-evaluations-swatch-empty"></span>';
            const grade = (entry.grade != null) ? entry.grade : '—';
            const name = escapeHtml(entry.coach_name || 'Coach');
            const date = formatDate(entry.evaluated_at);
            const hasNotes = entry.notes && String(entry.notes).trim();
            const inactiveBadge = entry.is_active === false
                ? '<span class="eval-evaluations-inactive-badge">inactive</span>'
                : '';
            const mineClass = entry.is_mine ? ' is-mine' : '';
            const inactiveClass = entry.is_active === false ? ' is-inactive' : '';
            return `
                <li class="eval-evaluations-row${mineClass}${inactiveClass}" data-row-idx="${idx}">
                    <div class="eval-evaluations-row-header" data-row-toggle="${idx}">
                        ${swatch}
                        <span class="eval-evaluations-name">${name}${inactiveBadge}</span>
                        <span class="eval-evaluations-grade">${escapeHtml(String(grade))}</span>
                        <span class="eval-evaluations-date">${escapeHtml(date)}</span>
                        ${hasNotes
                            ? '<span class="eval-evaluations-caret" aria-hidden="true">▾</span>'
                            : '<span class="eval-evaluations-caret eval-evaluations-caret-empty" aria-hidden="true"></span>'}
                    </div>
                    ${hasNotes
                        ? `<blockquote class="eval-evaluations-notes" style="display:none;">${escapeHtml(entry.notes)}</blockquote>`
                        : ''}
                </li>
            `;
        }).join('');
    }

    // Fetch + render the Final Grade tab. Hides the tab button when the
    // recruit has 0 promotions, shows the dropdown when >1, otherwise picks
    // the single promotion and renders.
    async function loadBoardPromotionsForModal(recruit) {
        if (!recruit) return;
        const tabBtn = document.getElementById('evalFinalGradeTabBtn');
        const params = {
            poolEntryId: recruit.pool_entry_id || null,
            linkedPlayerUserId: recruit.linked_player_user_id || null,
        };
        let promotions = [];
        if (params.poolEntryId || params.linkedPlayerUserId) {
            try {
                const res = await API.pipeline.getBoardPromotions(params);
                promotions = (res && Array.isArray(res.promotions)) ? res.promotions : [];
            } catch (_) { /* non-fatal — tab stays hidden */ }
        }
        recruit._promotions = promotions;

        if (!promotions.length) {
            if (tabBtn) tabBtn.style.display = 'none';
            return;
        }
        if (tabBtn) tabBtn.style.display = '';

        const sel = document.getElementById('evalFinalGradePromotionSelect');
        const selLabel = document.getElementById('evalFinalGradePromotionLabel');
        if (sel) {
            if (promotions.length > 1) {
                if (selLabel) selLabel.style.display = '';
                sel.style.display = '';
                // Append the position to the option label so a recruit
                // promoted to multiple positions on the same board (e.g.
                // FB AND RB) shows two distinguishable entries instead of
                // two identical "Board Name (Group)" rows.
                sel.innerHTML = promotions
                    .map((p, i) => {
                        const boardName = escapeHtml(p.board_name || 'Board');
                        const groupName = escapeHtml(p.group_name || '');
                        const positionLabel = p.position ? ` — ${escapeHtml(p.position)}` : '';
                        return `<option value="${i}">${boardName} (${groupName})${positionLabel}</option>`;
                    })
                    .join('');
                sel.value = '0';
            } else {
                if (selLabel) selLabel.style.display = 'none';
                sel.style.display = 'none';
            }
        }
        renderFinalGradePromotion(promotions[0]);
    }

    // Render the Final Grade tab for one promotion. Inputs disabled when
    // !promo.can_edit; Save button hidden in the same case.
    function renderFinalGradePromotion(promo) {
        if (!promo) return;
        const contextEl = document.getElementById('evalFinalContext');
        const slider = document.getElementById('evalFinalGrade');
        const readout = document.getElementById('evalFinalGradeReadout');
        const notesEl = document.getElementById('evalFinalNotes');
        const auditEl = document.getElementById('evalFinalAudit');
        const saveBtn = document.getElementById('evalFinalGradeSaveBtn');

        if (contextEl) {
            // Include position so a recruit promoted to multiple positions
            // on the same board (e.g. FB + RB) makes it clear which copy is
            // being edited.
            const positionLabel = promo.position ? ` — ${promo.position}` : '';
            contextEl.textContent = promo.board_name
                ? `Promoted to ${promo.board_name}${promo.group_name ? ' (' + promo.group_name + ')' : ''}${positionLabel}`
                : '';
        }

        const grade = Number.isFinite(promo.final_grade) ? promo.final_grade : 50;
        if (slider) slider.value = grade;
        if (readout) readout.textContent = Number.isFinite(promo.final_grade) ? String(promo.final_grade) : '—';
        if (notesEl) notesEl.value = promo.final_notes || '';

        document.querySelectorAll('#evalFinalColorRow .addboard-color-swatch').forEach(b => {
            b.classList.toggle('selected', b.dataset.color === (promo.final_color_tag || ''));
        });

        if (auditEl) {
            const by = promo.promoted_by_name || null;
            const at = promo.promoted_at ? new Date(promo.promoted_at) : null;
            if (by || (at && !isNaN(at.getTime()))) {
                const dateStr = (at && !isNaN(at.getTime()))
                    ? at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';
                auditEl.textContent = by
                    ? `Last set by ${by}${dateStr ? ' • ' + dateStr : ''}`
                    : `Last updated ${dateStr}`;
                auditEl.style.display = 'block';
            } else {
                auditEl.textContent = '';
                auditEl.style.display = 'none';
            }
        }

        // Editor vs viewer gating — Final Grade has its OWN can_edit per
        // promotion, NOT the surrounding board context's permission.
        const canEdit = !!promo.can_edit;
        if (slider) slider.disabled = !canEdit;
        if (notesEl) notesEl.disabled = !canEdit;
        document.querySelectorAll('#evalFinalColorRow .addboard-color-swatch').forEach(b => {
            b.disabled = !canEdit;
            b.style.cursor = canEdit ? 'pointer' : 'not-allowed';
        });
        if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';
    }

    // Save the active Final Grade promotion. Body mirrors Plan 6's PUT.
    async function saveFinalGradeFromModal() {
        if (!currentEvalRecruit || !Array.isArray(currentEvalRecruit._promotions) || !currentEvalRecruit._promotions.length) return;
        const sel = document.getElementById('evalFinalGradePromotionSelect');
        const idx = Math.max(0, Number((sel && sel.value) || 0));
        const promo = currentEvalRecruit._promotions[idx];
        if (!promo || !promo.can_edit) return;

        const playerId = currentEvalRecruit.linked_player_user_id || currentEvalRecruit.pool_entry_id;
        if (!playerId || !promo.position) {
            if (typeof showToast === 'function') showToast('Missing player identifier or position', 'error');
            return;
        }

        // Read live values from the form
        const slider = document.getElementById('evalFinalGrade');
        const notesEl = document.getElementById('evalFinalNotes');
        const selectedSwatch = document.querySelector('#evalFinalColorRow .addboard-color-swatch.selected');
        const finalGrade = slider ? Number(slider.value) : null;
        const finalColor = selectedSwatch ? (selectedSwatch.dataset.color || null) : null;
        const finalNotes = notesEl ? (notesEl.value || null) : null;

        // Stamp promoted_by_name with the viewer's current name so the audit
        // line updates to "Last set by …".
        let promotedByName = null;
        try {
            const me = await API.auth.getCurrentUser();
            if (me && me.profile) {
                promotedByName = ((me.profile.first_name || '') + ' ' + (me.profile.last_name || '')).trim() || null;
            }
        } catch (_) { /* non-fatal */ }

        const body = {
            position: promo.position,
            final_grade: finalGrade,
            final_color_tag: finalColor,
            final_notes: finalNotes,
            promoted_by_name: promotedByName,
        };

        try {
            await API.put(`/recruiting-board/groups/${promo.group_id}/boards/${promo.board_id}/players/${playerId}/final`, body);
            if (typeof showToast === 'function') showToast('Final synthesis updated', 'success');

            // Update the cached promotion in-place so a subsequent dropdown
            // switch doesn't show stale data, then re-render audit + readouts.
            promo.final_grade = finalGrade;
            promo.final_color_tag = finalColor;
            promo.final_notes = finalNotes;
            promo.promoted_by_name = promotedByName;
            promo.promoted_at = new Date().toISOString();
            renderFinalGradePromotion(promo);

            // Patch the on-board card directly with the new grade + color.
            // The shared-board football field is rendered once when the user
            // visits that subtab and lives in the DOM regardless of which
            // subtab is active — patching here ensures the next visit shows
            // the new grade without depending on an API re-fetch (which has
            // been unreliable due to cache layers we don't control). The
            // info modal is the source of truth; the card mirrors it.
            // Pass both identifiers so the patch tolerates the case where
            // the on-board card stored a different id than the modal's
            // primary (e.g. a pool entry that was later linked to a DR
            // account — the card may have user_id while playerId is the
            // pool_entry_id, or vice versa).
            const playerIdPrimary = playerId;
            const playerIdAlt = playerId === currentEvalRecruit.linked_player_user_id
                ? currentEvalRecruit.pool_entry_id
                : currentEvalRecruit.linked_player_user_id;
            updateBoardCardFinalDisplay(playerIdPrimary, promo.position, finalGrade, finalColor, playerIdAlt);

            // Belt-and-suspenders: re-fetch ONLY the players for this board
            // (no renderBoard, no body-class strip) so the on-board cards
            // reflect the persisted DB state. Safe to call from any subtab —
            // no-ops if the user isn't viewing this board. AFTER the refresh
            // completes, re-apply the in-place patch once more so that even
            // if the API returned stale data via some cache layer (browser
            // disk, service worker, etc.), the user-facing card still shows
            // what they just saved. This is a "patch wins" guarantee — the
            // modal is the source of truth per the user's directive.
            (async () => {
                try {
                    await refreshOnBoardPlayersOnly(promo.board_id);
                } finally {
                    updateBoardCardFinalDisplay(playerIdPrimary, promo.position, finalGrade, finalColor, playerIdAlt);
                }
            })();
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast((err && err.message) || 'Failed to save final synthesis', 'error');
            }
        }
    }

    // "Add to Pipeline" handler for the unified modal footer when opened from
    // a board card. Inserts via /pipeline/from-board, flips _inMyPipeline,
    // refreshes the evaluation list, and re-renders the footer buttons.
    async function addBoardRecruitToPipeline() {
        if (!currentEvalRecruit) return;
        const params = {
            poolEntryId: currentEvalRecruit.pool_entry_id || null,
            linkedPlayerUserId: currentEvalRecruit.linked_player_user_id || null,
        };
        if (!params.poolEntryId && !params.linkedPlayerUserId) {
            if (typeof showToast === 'function') showToast('Cannot add — missing recruit identifier', 'error');
            return;
        }
        try {
            const res = await API.pipeline.addFromBoard(params);
            const newRecruit = res && res.recruit;
            if (newRecruit && newRecruit.id) currentEvalRecruit.id = newRecruit.id;
            currentEvalRecruit._inMyPipeline = true;
            if (typeof showToast === 'function') showToast('Added to your pipeline', 'success');
            await loadEvaluationsForModal(currentEvalRecruit);
            updateFooterButtonsForPipelineState();
        } catch (err) {
            // 409 DUPLICATE is the most common — surface as a soft warning.
            if (typeof showToast === 'function') {
                showToast((err && err.message) || 'Failed to add to pipeline', 'error');
            }
        }
    }

    // Footer button label + gating swap based on _inMyPipeline. Buttons stay
    // visible at all times; gating uses disabled + tooltip rather than hiding.
    function updateFooterButtonsForPipelineState() {
        const r = currentEvalRecruit;
        const inPipe = !!(r && r._inMyPipeline);
        const deleteBtn = document.getElementById('evalDeleteBtn');
        const addBoardBtn = document.getElementById('evalAddBoardBtn');
        const handoffBtn = document.getElementById('evalHandoffBtn');
        if (!deleteBtn || !addBoardBtn || !handoffBtn) return;
        if (inPipe) {
            deleteBtn.textContent = 'Remove from Pipeline';
            deleteBtn.classList.add('btn-cancel');
            deleteBtn.classList.remove('btn-submit');
            deleteBtn.title = '';
            addBoardBtn.disabled = false; addBoardBtn.title = '';
            handoffBtn.disabled = false; handoffBtn.title = '';
        } else {
            deleteBtn.textContent = 'Add to Pipeline';
            deleteBtn.classList.add('btn-submit');
            deleteBtn.classList.remove('btn-cancel');
            deleteBtn.title = '';
            addBoardBtn.disabled = true; addBoardBtn.title = 'Add to your pipeline first';
            handoffBtn.disabled = true; handoffBtn.title = 'Add to your pipeline first';
        }
    }

    // ====================================================================
    // GRADE ENTRY SUB-MODAL (Phase 3)
    // ====================================================================
    // Opens on top of #evaluationModal (z-index 1100). Lets the viewer set or
    // edit their own grade/color/notes. Save PUTs /api/pipeline/:recruitId,
    // refreshes the parent's evaluation list, and closes.

    let gradeEntrySelectedColor = null;     // tracks single-select swatch state
    let gradeEntryGradeTouched = false;     // mirrors evalGradeSlider.dataset.touched

    function openGradeEntryModal(mode) {
        const modal = document.getElementById('gradeEntryModal');
        if (!modal || !currentEvalRecruit) return;
        if (!currentEvalRecruit._inMyPipeline) return;

        const titleEl = document.getElementById('gradeEntryTitle');
        const slider = document.getElementById('geGradeSlider');
        const readout = document.getElementById('geGradeReadout');
        const notesEl = document.getElementById('geNotes');

        const evals = Array.isArray(currentEvalRecruit._evaluations) ? currentEvalRecruit._evaluations : [];
        const mineActive = evals.find(e => e.is_mine && e.is_active);

        if (mode === 'edit' && mineActive) {
            titleEl.textContent = 'Edit Grade';
            if (slider) slider.value = (mineActive.grade != null) ? mineActive.grade : 50;
            if (readout) readout.textContent = (mineActive.grade != null) ? String(mineActive.grade) : '—';
            gradeEntryGradeTouched = mineActive.grade != null;
            gradeEntrySelectedColor = mineActive.color_tag || null;
            if (notesEl) notesEl.value = mineActive.notes || '';
        } else {
            titleEl.textContent = 'Add Grade';
            if (slider) slider.value = 50;
            if (readout) readout.textContent = '—';
            gradeEntryGradeTouched = false;
            gradeEntrySelectedColor = null;
            if (notesEl) notesEl.value = '';
        }
        document.querySelectorAll('#geColorRow .eval-color-swatch').forEach(b => {
            b.classList.toggle('selected', b.dataset.color === (gradeEntrySelectedColor || ''));
        });
        modal.classList.add('active');
    }

    function closeGradeEntryModal() {
        const modal = document.getElementById('gradeEntryModal');
        if (modal) modal.classList.remove('active');
    }

    async function saveGradeEntry() {
        if (!currentEvalRecruit || !currentEvalRecruit.id) {
            if (typeof showToast === 'function') showToast('Add to your pipeline first', 'error');
            return;
        }
        const slider = document.getElementById('geGradeSlider');
        const notesEl = document.getElementById('geNotes');
        const grade = gradeEntryGradeTouched ? parseInt(slider.value, 10) : null;
        const color_tag = gradeEntrySelectedColor || null;
        const notes = notesEl ? notesEl.value : null;

        try {
            await API.pipeline.updateEvaluation(currentEvalRecruit.id, { grade, color_tag, notes });
            if (typeof showToast === 'function') showToast('Grade saved', 'success');
            // Mirror onto the in-memory recruit so any downstream snapshot
            // (e.g. buildGradingHistorySnapshot for Add to Board) uses the
            // freshly-saved values.
            currentEvalRecruit.grade = grade;
            currentEvalRecruit.color_tag = color_tag;
            currentEvalRecruit.notes = notes;
            // Sync the pipeline list cache so the row re-renders with the
            // new grade pill + color stripe the moment the modal closes —
            // no more "refresh to see your grade" UX.
            if (Array.isArray(currentPipelineRecruits)) {
                const idx = currentPipelineRecruits.findIndex(r => r.id === currentEvalRecruit.id);
                if (idx >= 0) {
                    currentPipelineRecruits[idx].grade = grade;
                    currentPipelineRecruits[idx].color_tag = color_tag;
                    currentPipelineRecruits[idx].notes = notes;
                    currentPipelineRecruits[idx].updated_at = new Date().toISOString();
                }
            }
            if (typeof rerenderMyPipelineList === 'function') rerenderMyPipelineList();
            closeGradeEntryModal();
            await loadEvaluationsForModal(currentEvalRecruit);
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast((err && err.message) || 'Failed to save grade', 'error');
            }
        }
    }

    // Wire #gradeEntryModal handlers once on init.
    (function wireGradeEntryModal() {
        const closeBtn = document.getElementById('gradeEntryClose');
        const overlay = document.getElementById('gradeEntryOverlay');
        const cancelBtn = document.getElementById('gradeEntryCancelBtn');
        const saveBtn = document.getElementById('gradeEntrySaveBtn');
        const slider = document.getElementById('geGradeSlider');

        if (closeBtn) closeBtn.addEventListener('click', closeGradeEntryModal);
        if (overlay) overlay.addEventListener('click', closeGradeEntryModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeGradeEntryModal);
        if (saveBtn) saveBtn.addEventListener('click', saveGradeEntry);

        if (slider) {
            slider.addEventListener('input', () => {
                gradeEntryGradeTouched = true;
                const readout = document.getElementById('geGradeReadout');
                if (readout) readout.textContent = String(slider.value);
            });
        }

        // Color swatch — single select with click-to-deselect, matches the
        // pattern from the deleted in-modal #evalColorRow handler.
        document.querySelectorAll('#geColorRow .eval-color-swatch').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                const target = ev.currentTarget;
                const wasSelected = target.classList.contains('selected');
                document.querySelectorAll('#geColorRow .eval-color-swatch')
                    .forEach(b => b.classList.remove('selected'));
                if (wasSelected || !target.dataset.color) {
                    gradeEntrySelectedColor = null;
                } else {
                    target.classList.add('selected');
                    gradeEntrySelectedColor = target.dataset.color;
                }
            });
        });

        // Caret expand/collapse for evaluation rows — delegated handler so it
        // works against the dynamically-rendered list inside #evaluationModal.
        const listEl = document.getElementById('evalEvaluationsList');
        if (listEl) {
            listEl.addEventListener('click', (ev) => {
                const header = ev.target.closest('[data-row-toggle]');
                if (!header) return;
                const row = header.closest('.eval-evaluations-row');
                if (!row) return;
                const notes = row.querySelector('.eval-evaluations-notes');
                if (!notes) return;
                const expanded = notes.style.display !== 'none';
                notes.style.display = expanded ? 'none' : '';
                row.classList.toggle('is-expanded', !expanded);
            });
        }
    })();

    // Legacy placeholder so any stray reference doesn't crash. Real entry
    // point is openEvaluationModal(buildUnifiedRecruitFromBoardPlayer(...)).
    function openBoardPlayerInfoModal(player) {
        const isShared = currentBoardMode === 'group';
        const canEdit = isShared
            ? (currentSharedGroupPermission === 'editor')
            : true;
        const boardContext = {
            mode: isShared ? 'shared' : 'personal',
            boardId: isShared ? currentSharedBoardId : currentPersonalBoardId,
            groupId: isShared ? currentSharedGroupId : null,
            canEdit,
        };
        openEvaluationModal(buildUnifiedRecruitFromBoardPlayer(player, boardContext));
    }

    // ---- end Phase 3 unified-modal block ----

    function switchPoolDetailTab(tabKey) {
        document.querySelectorAll('.pool-detail-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.poolTab === tabKey);
        });
        document.querySelectorAll('.pool-detail-tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.poolTabContent === tabKey);
        });
    }

    function poolField(label, value) {
        if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '';
        const display = Array.isArray(value) ? value.join(', ') : value;
        return `<div class="pool-detail-field">
            <span class="pool-detail-field-label">${escapeHtml(label)}</span>
            <span class="pool-detail-field-value">${escapeHtml(String(display))}</span>
        </div>`;
    }

    function poolSection(title, body) {
        if (!body || !body.trim()) return '';
        return `<section class="pool-detail-section">
            <h4 class="pool-detail-section-title">${escapeHtml(title)}</h4>
            <div class="pool-detail-section-body">${body}</div>
        </section>`;
    }

    function renderQuestionnaireView(d, transcriptUrl) {
        d = d || {};
        const personal = d.personal || {};
        const address = d.address || {};
        const parents = Array.isArray(d.parents) ? d.parents : [];
        const family = d.family || {};
        const academic = d.academic || {};
        const athletic = d.athletic || {};
        const film = d.film || {};

        // Personal
        const personalBody =
            poolField('Email', personal.email) +
            poolField('Phone', personal.mobile_phone) +
            poolField('Birth date', personal.birth_date) +
            poolField('Facebook', personal.facebook_username) +
            poolField('Twitter / X', personal.twitter_username) +
            poolField('Hobbies', personal.hobbies);

        // Address
        const addrParts = [address.line_1, address.line_2, address.city].filter(Boolean).join(', ');
        const addrSecond = [address.state, address.zip].filter(Boolean).join(' ');
        const addressBody =
            poolField('Address', addrParts || null) +
            poolField('State / Zip', addrSecond || null);

        // Parents
        let parentsBody = '';
        if (parents.length) {
            parentsBody = parents.map((p, i) => {
                const pname = `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Parent ${i + 1}`;
                return `<div class="pool-detail-parent-block">
                    <div class="pool-detail-parent-name">${escapeHtml(pname)}</div>
                    ${poolField('Email', p.email)}
                    ${poolField('Phone', p.phone)}
                    ${poolField('Employment', p.employment)}
                    ${poolField('College', p.college)}
                </div>`;
            }).join('');
        }

        // Family
        const familyBody = poolField('Siblings', family.siblings);

        // Academic. The transcript link (when present) is rendered as a
        // distinct row so it stands out from the field grid. We prefer the
        // explicit transcriptUrl arg the caller hands us (already a signed
        // S3 URL) over digging into academic.transcript_s3_keys — those keys
        // are raw S3 paths and won't work in an <a href>.
        let transcriptRow = '';
        if (transcriptUrl) {
            transcriptRow = `<div class="pool-field pool-field-transcript">
                <span class="pool-field-label">Transcript</span>
                <a class="pool-detail-transcript-link" href="${escapeHtml(transcriptUrl)}" target="_blank" rel="noopener" download>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>View transcript (PDF)</span>
                </a>
            </div>`;
        }
        const academicBody =
            poolField('High School', academic.high_school) +
            poolField('Graduation Year', academic.graduation_year) +
            poolField('GPA', academic.gpa != null ? Number(academic.gpa).toFixed(2) : null) +
            poolField('Intended Major', academic.intended_major) +
            poolField('NCAA Registered', academic.ncaa_registered ? 'Yes' : null) +
            poolField('NCAA ID', academic.ncaa_id) +
            poolField('SAT', academic.sat_score) +
            poolField('ACT', academic.act_score) +
            poolField('Academic Honors', academic.honors) +
            transcriptRow;

        // Athletic
        const heightDisp = athletic.height_inches ? inchesToHeight(athletic.height_inches) : null;
        const athleticBody =
            poolField('Position(s)', athletic.positions) +
            poolField('Height', heightDisp) +
            poolField('Weight', athletic.weight_lbs ? `${athletic.weight_lbs} lbs` : null) +
            poolField('100m', athletic.track_100m ? `${athletic.track_100m}s` : null) +
            poolField('200m', athletic.track_200m ? `${athletic.track_200m}s` : null) +
            poolField('Power Clean', athletic.power_clean_lbs ? `${athletic.power_clean_lbs} lbs` : null) +
            poolField('Bench', athletic.bench_lbs ? `${athletic.bench_lbs} lbs` : null) +
            poolField('Squat', athletic.squat_lbs ? `${athletic.squat_lbs} lbs` : null) +
            poolField('Athletic Honors', athletic.honors) +
            poolField('Other Sports', athletic.other_sports);

        // Film
        let filmBody = '';
        if (Array.isArray(film.video_urls) && film.video_urls.length) {
            filmBody = film.video_urls.map(u =>
                `<a class="pool-detail-link" href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`
            ).join('<br>');
        }

        return [
            poolSection('Personal Information', personalBody),
            poolSection('Address', addressBody),
            poolSection('Parents / Guardians', parentsBody),
            poolSection('Family', familyBody),
            poolSection('Academic', academicBody),
            poolSection('Athletic', athleticBody),
            poolSection('Film & Recruiting Videos', filmBody)
        ].filter(Boolean).join('') || '<p class="pool-detail-empty">No data submitted.</p>';
    }

    function renderSubmissionHistory(submissions) {
        if (!submissions || !submissions.length) {
            return '<p class="pool-detail-empty">No submissions yet.</p>';
        }
        return submissions.map((s, idx) => {
            const isFirst = idx === 0;
            const isLatest = idx === submissions.length - 1;
            const tag = isLatest ? 'Latest' : (isFirst ? 'First' : `#${idx + 1}`);
            const ts = s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—';
            return `<div class="pool-detail-history-item">
                <div class="pool-detail-history-header">
                    <span class="pool-detail-history-tag">${escapeHtml(tag)}</span>
                    <span class="pool-detail-history-time">${escapeHtml(ts)}</span>
                </div>
                <details class="pool-detail-history-details">
                    <summary>View submission</summary>
                    <div class="pool-detail-history-body">${renderQuestionnaireView(s.submission_data || {})}</div>
                </details>
            </div>`;
        }).join('');
    }

    function renderDrProfile(dr) {
        const name = `${dr.first_name || ''} ${dr.last_name || ''}`.trim() || 'DR Member';
        const avatarSrc = dr.profile_image_url || '';
        const folder = (typeof getProfileFolder === 'function')
            ? getProfileFolder({
                role: 'player',
                is_transfer_player: dr.transfer === 'y',
                transfer: dr.transfer,
                college_division: dr.college_division
            })
            : 'hsplayer';
        const profileUrl = `../../${folder}/tabs/my-profile.html${dr.username ? '?username=' + encodeURIComponent(dr.username) : ''}`;

        const heightDisp = dr.height ? inchesToHeight(dr.height) : null;
        const fields =
            poolField('Username', dr.username) +
            poolField('Position', dr.position) +
            poolField('Height', heightDisp) +
            poolField('Weight', dr.weight ? `${dr.weight} lbs` : null) +
            poolField('Graduation Year', dr.graduation_year) +
            poolField('GPA', dr.gpa != null ? Number(dr.gpa).toFixed(2) : null) +
            poolField('Team', dr.team_name) +
            poolField('Division', dr.college_division) +
            poolField('Location', [dr.city, dr.state].filter(Boolean).join(', ') || null);

        const avatarBlock = avatarSrc
            ? `<img src="${escapeHtml(avatarSrc)}" alt="" class="pool-detail-dr-avatar">`
            : `<div class="pool-detail-dr-avatar pool-detail-dr-avatar-fallback">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                  </svg>
              </div>`;

        return `<div class="pool-detail-dr-header">
            ${avatarBlock}
            <div class="pool-detail-dr-name-block">
                <div class="pool-detail-dr-name">${escapeHtml(name)}</div>
                <a class="pool-detail-dr-link" href="${escapeHtml(profileUrl)}">View Full DR Profile →</a>
            </div>
        </div>
        <div class="pool-detail-section-body">${fields}</div>`;
    }

    // Wire pool detail modal handlers once on init
    (function wirePoolDetailModal() {
        const closeBtn = document.getElementById('poolDetailClose');
        const footerCloseBtn = document.getElementById('poolDetailCloseBtn');
        const overlay = document.getElementById('poolDetailOverlay');
        if (closeBtn) closeBtn.addEventListener('click', closePoolDetailModal);
        if (footerCloseBtn) footerCloseBtn.addEventListener('click', closePoolDetailModal);
        if (overlay) overlay.addEventListener('click', closePoolDetailModal);
        document.querySelectorAll('.pool-detail-tab').forEach(btn => {
            btn.addEventListener('click', () => switchPoolDetailTab(btn.dataset.poolTab));
        });
    })();

    // Wire evaluation modal handlers once on init (Plan 4 + Phase 3 unified)
    (function wireEvaluationModal() {
        const closeBtn = document.getElementById('evaluationModalClose');
        const overlay = document.getElementById('evaluationModalOverlay');
        const deleteBtn = document.getElementById('evalDeleteBtn');
        const addBoardBtn = document.getElementById('evalAddBoardBtn');
        const handoffBtn = document.getElementById('evalHandoffBtn');
        const addEditGradeBtn = document.getElementById('evalAddOrEditGradeBtn');
        const promotionSelect = document.getElementById('evalFinalGradePromotionSelect');
        const finalGradeSlider = document.getElementById('evalFinalGrade');
        const finalGradeSaveBtn = document.getElementById('evalFinalGradeSaveBtn');
        const profileLink = document.getElementById('evalProfileLink');

        if (closeBtn) closeBtn.addEventListener('click', closeEvaluationModal);
        if (overlay) overlay.addEventListener('click', closeEvaluationModal);

        // Before navigating to the player's profile (same-tab), encode the
        // open recruit's identity into our URL so the browser Back button
        // returns here AND auto-reopens the eval modal for that recruit.
        // Uses replaceState so we don't add a junk history entry.
        if (profileLink) {
            profileLink.addEventListener('click', () => {
                if (!currentEvalRecruit) return;
                const params = new URLSearchParams(window.location.search);
                const activeBtn = document.querySelector('.rb-subtab.active');
                const subtab = (activeBtn && activeBtn.dataset.tab)
                    || localStorage.getItem('lastViewedRecruitingBoardSubtab')
                    || 'pipeline';
                params.set('subtab', subtab);
                if (currentEvalRecruit.pool_entry_id) {
                    params.set('modal_pool_entry_id', currentEvalRecruit.pool_entry_id);
                    params.delete('modal_player_user_id');
                } else if (currentEvalRecruit.linked_player_user_id) {
                    params.set('modal_player_user_id', currentEvalRecruit.linked_player_user_id);
                    params.delete('modal_pool_entry_id');
                }
                const newUrl = `${window.location.pathname}?${params.toString()}`;
                window.history.replaceState({}, '', newUrl);
            });
        }

        // Footer delete button is dynamic: Remove from Pipeline OR Add to
        // Pipeline depending on the viewer's _inMyPipeline state.
        if (deleteBtn) deleteBtn.addEventListener('click', () => {
            if (!currentEvalRecruit) return;
            if (currentEvalRecruit._inMyPipeline) {
                removeRecruitFromPipeline();
            } else {
                addBoardRecruitToPipeline();
            }
        });

        // Add to Board + Send to Coach — gated on _inMyPipeline. Auto-save
        // chain removed in Phase 3: the new flow forces the coach to commit
        // a grade via the #gradeEntryModal first, so there's nothing to flush
        // here. buildGradingHistorySnapshot reads recruit.{grade,color,notes}
        // which are kept in sync by saveGradeEntry.
        if (addBoardBtn) addBoardBtn.addEventListener('click', () => {
            if (!currentEvalRecruit || !currentEvalRecruit._inMyPipeline) return;
            openAddBoardModal();
        });
        if (handoffBtn) handoffBtn.addEventListener('click', () => {
            if (!currentEvalRecruit || !currentEvalRecruit._inMyPipeline) return;
            openSendHandoffModal(currentEvalRecruit);
        });

        // Add Grade / Edit Grade — opens the #gradeEntryModal sub-modal.
        // Mode flips based on whether the viewer already has an active row.
        if (addEditGradeBtn) addEditGradeBtn.addEventListener('click', () => {
            if (!currentEvalRecruit || !currentEvalRecruit._inMyPipeline) return;
            const evals = Array.isArray(currentEvalRecruit._evaluations) ? currentEvalRecruit._evaluations : [];
            const mineActive = evals.find(e => e.is_mine && e.is_active);
            openGradeEntryModal(mineActive ? 'edit' : 'add');
        });

        // Tab switching — scoped to #evaluationModal so it doesn't bleed
        // into the sub-modal.
        document.querySelectorAll('#evaluationModal .eval-tab').forEach(btn => {
            btn.addEventListener('click', () => switchEvalTab(btn.dataset.evalTab));
        });

        // Final Grade tab — promotion dropdown switches between boards.
        if (promotionSelect) {
            promotionSelect.addEventListener('change', () => {
                if (!currentEvalRecruit || !Array.isArray(currentEvalRecruit._promotions)) return;
                const idx = Math.max(0, Number(promotionSelect.value || 0));
                const promo = currentEvalRecruit._promotions[idx];
                if (promo) renderFinalGradePromotion(promo);
            });
        }

        // Final Grade slider live readout
        if (finalGradeSlider) {
            finalGradeSlider.addEventListener('input', () => {
                const readout = document.getElementById('evalFinalGradeReadout');
                if (readout) readout.textContent = String(finalGradeSlider.value);
            });
        }

        // Final Grade color swatches — single-select with click-to-deselect.
        document.querySelectorAll('#evalFinalColorRow .addboard-color-swatch').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                if (btn.disabled) return;
                const target = ev.currentTarget;
                const wasSelected = target.classList.contains('selected');
                document.querySelectorAll('#evalFinalColorRow .addboard-color-swatch')
                    .forEach(b => b.classList.remove('selected'));
                if (!wasSelected) target.classList.add('selected');
            });
        });

        if (finalGradeSaveBtn) finalGradeSaveBtn.addEventListener('click', saveFinalGradeFromModal);

    })();

    // Wire add-to-board modal handlers once on init (Plan 4)
    (function wireAddBoardModal() {
        const closeBtn = document.getElementById('addBoardModalClose');
        const overlay = document.getElementById('addBoardModalOverlay');
        const cancelBtn = document.getElementById('addBoardCancelBtn');
        const confirmBtn = document.getElementById('addBoardConfirmBtn');
        const groupSelect = document.getElementById('addBoardGroupSelect');
        const boardSelect = document.getElementById('addBoardSelect');
        const positionSelect = document.getElementById('addBoardPositionSelect');
        const finalGradeSlider = document.getElementById('addBoardFinalGrade');

        if (closeBtn) closeBtn.addEventListener('click', closeAddBoardModal);
        if (overlay) overlay.addEventListener('click', closeAddBoardModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeAddBoardModal);
        if (confirmBtn) confirmBtn.addEventListener('click', confirmAddToBoard);
        if (groupSelect) groupSelect.addEventListener('change', handleAddBoardGroupChange);
        // Board change → repopulate position dropdown from the new board's
        // config (offense + defense + specs flattened). The populate helper
        // calls evaluateConfirmEnabled at the end, so the Confirm gating
        // stays in sync without a separate listener.
        if (boardSelect) boardSelect.addEventListener('change', populateAddBoardPositionsFromBoard);
        if (positionSelect) positionSelect.addEventListener('change', evaluateConfirmEnabled);

        document.querySelectorAll('input[name="addBoardType"]').forEach(radio => {
            radio.addEventListener('change', handleAddBoardTypeChange);
        });


        // Final Grade slider — live readout + update context + re-evaluate Confirm.
        // Hide the empty-chain hint once the coach touches the slider (treats
        // their interaction as the explicit grade).
        if (finalGradeSlider) {
            finalGradeSlider.addEventListener('input', () => {
                if (!addBoardContext) return;
                const val = Number(finalGradeSlider.value);
                addBoardContext.finalGrade = val;
                const readout = document.getElementById('addBoardFinalGradeReadout');
                if (readout) readout.textContent = String(val);
                const hint = document.getElementById('addBoardEmptyChainHint');
                if (hint) hint.style.display = 'none';
                evaluateConfirmEnabled();
            });
        }

        // Final Color swatches — single-select, click selected to deselect
        document.querySelectorAll('#addBoardFinalColorRowInner .addboard-color-swatch').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                if (!addBoardContext) return;
                const target = ev.currentTarget;
                const wasSelected = target.classList.contains('selected');
                document.querySelectorAll('#addBoardFinalColorRowInner .addboard-color-swatch')
                    .forEach(b => b.classList.remove('selected'));
                if (wasSelected) {
                    addBoardContext.finalColor = null;
                } else {
                    target.classList.add('selected');
                    addBoardContext.finalColor = target.dataset.color;
                }
                evaluateConfirmEnabled();
            });
        });
    })();

    // Plan 5B: wire the Pipeline view switcher buttons
    (function wirePipelineViewSwitcher() {
        document.querySelectorAll('.pipeline-view-btn').forEach(btn => {
            btn.addEventListener('click', () => switchPipelineView(btn.dataset.view));
        });
        // Clear Resolved button on the Sent view — deletes every accepted/rejected
        // outbound row at the coach's current school, then refreshes the list.
        const clearBtn = document.getElementById('handoffSentClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                const ok = await (typeof showConfirmModal === 'function'
                    ? showConfirmModal({
                        title: 'Clear Resolved Hand-offs',
                        message: 'Remove every accepted or rejected hand-off from your Sent list? Pending hand-offs stay.',
                        confirmText: 'Clear',
                        cancelText: 'Cancel',
                    })
                    : Promise.resolve(window.confirm('Clear resolved hand-offs?')));
                if (!ok) return;
                try {
                    await API.pipeline.clearResolvedOutboundHandoffs();
                    if (typeof showToast === 'function') showToast('Resolved hand-offs cleared', 'success');
                    await loadHandoffsSent();
                } catch (err) {
                    if (typeof showToast === 'function') {
                        showToast((err && err.message) || 'Failed to clear', 'error');
                    }
                }
            });
        }
    })();

    // Plan 5B: wire the Send Hand-Off modal
    (function wireSendHandoffModal() {
        const closeBtn = document.getElementById('sendHandoffClose');
        const overlay = document.getElementById('sendHandoffOverlay');
        const cancelBtn = document.getElementById('sendHandoffCancel');
        const submitBtn = document.getElementById('sendHandoffSubmit');
        if (closeBtn) closeBtn.addEventListener('click', closeSendHandoffModal);
        if (overlay) overlay.addEventListener('click', closeSendHandoffModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeSendHandoffModal);
        if (submitBtn) submitBtn.addEventListener('click', submitSendHandoff);
    })();


    // Incoming group invites surface here instead of in the Notifications tab.
    // Opening the modal clears the sidebar + subtab badge (mark-seen). Each
    // invite stays visible until accepted or declined; on action it's deleted
    // from the DB and removed from the modal.
    async function openInvitesModal() {
        const modal = document.getElementById('invitesModal');
        const list = document.getElementById('invitesList');
        const empty = document.getElementById('invitesEmpty');
        if (!modal) return;

        if (list) list.innerHTML = '<p class="sg-invites-loading">Loading...</p>';
        if (empty) empty.style.display = 'none';
        modal.classList.add('active');

        // Fire-and-forget mark-seen so the badge clears even if the fetch is slow
        API.post('/recruiting-board/my-invites/mark-seen', {}).catch(() => {});

        // Optimistically clear the badges right now
        const sidebarBadge = document.querySelector('.nav-item[href*="recruiting-board"] .notification-badge');
        if (sidebarBadge) sidebarBadge.style.display = 'none';
        const subtabBadge = document.querySelector('.rb-subtab[data-tab="shared-boards"] .rb-subtab-badge');
        if (subtabBadge) subtabBadge.style.display = 'none';

        try {
            const res = await API.get('/recruiting-board/my-invites');
            renderInvitesList(res.invites || []);
        } catch (err) {
            if (list) list.innerHTML = '<p class="sg-invites-error">Failed to load invites.</p>';
        }
    }

    function closeInvitesModal() {
        const modal = document.getElementById('invitesModal');
        if (modal) modal.classList.remove('active');
    }

    function renderInvitesList(invites) {
        const list = document.getElementById('invitesList');
        const empty = document.getElementById('invitesEmpty');
        const countPill = document.getElementById('invitesCountPill');
        if (!list) return;

        if (!invites || invites.length === 0) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            if (countPill) countPill.textContent = '';
            // Hide the Invites button too — no pending invites
            const invitesBtn = document.getElementById('openInvitesModalBtn');
            if (invitesBtn) invitesBtn.style.display = 'none';
            return;
        }

        if (empty) empty.style.display = 'none';
        if (countPill) countPill.textContent = `(${invites.length})`;
        list.innerHTML = '';
        for (const invite of invites) {
            list.appendChild(buildInviteCard(invite));
        }
    }

    function buildInviteCard(invite) {
        const sender = invite.sender || {};
        const fullName = `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'A coach';

        // Subheader format: "Team, State • Division" — matches lesson 108
        const subheaderParts = [];
        const teamLoc = [sender.team_name, sender.state].filter(Boolean).join(', ');
        if (teamLoc) subheaderParts.push(teamLoc);
        if (sender.college_division) subheaderParts.push(sender.college_division);
        const subheader = subheaderParts.join(' • ') || 'College Coach';

        // Avatar: <img> if we have a signed URL, otherwise initials fallback
        let avatarInner;
        if (sender.profile_image_url) {
            avatarInner = `<img src="${escapeHtml(sender.profile_image_url)}" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='${initials(fullName)}';">`;
        } else {
            avatarInner = `<span class="sg-coach-initials">${initials(fullName)}</span>`;
        }

        const card = document.createElement('div');
        card.className = 'sg-invite-row';
        card.dataset.notificationId = invite.notification_id;
        card.dataset.groupId = invite.group_id;
        card.innerHTML = `
            <div class="sg-coach-avatar sg-invite-avatar">${avatarInner}</div>
            <div class="sg-invite-details">
                <span class="sg-coach-name sg-invite-name">${escapeHtml(fullName)}</span>
                <span class="sg-coach-subheader sg-invite-subheader">${escapeHtml(subheader)}</span>
                <span class="sg-invite-group-line">
                    invited you to join <strong>${escapeHtml(invite.group_name || 'a group')}</strong>
                    as <strong>${escapeHtml(invite.permission || 'viewer')}</strong>
                </span>
            </div>
            <div class="sg-invite-actions">
                <button class="sg-invite-accept-btn">Accept</button>
                <button class="sg-invite-decline-btn">Decline</button>
            </div>
        `;

        card.querySelector('.sg-invite-accept-btn').addEventListener('click', () => actOnInvite(card, 'accept'));
        card.querySelector('.sg-invite-decline-btn').addEventListener('click', () => actOnInvite(card, 'decline'));
        return card;
    }

    function initials(fullName) {
        const parts = (fullName || '').trim().split(/\s+/);
        const first = parts[0] ? parts[0][0] : '';
        const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
        return (first + last).toUpperCase() || '?';
    }

    async function actOnInvite(card, action) {
        const notificationId = card.dataset.notificationId;
        const groupId = card.dataset.groupId;
        const acceptBtn = card.querySelector('.sg-invite-accept-btn');
        const declineBtn = card.querySelector('.sg-invite-decline-btn');
        if (acceptBtn) acceptBtn.disabled = true;
        if (declineBtn) declineBtn.disabled = true;

        try {
            await API.post(`/recruiting-board/invite/${action}`, { notificationId, groupId });
            // Remove the card from the modal
            card.remove();
            const list = document.getElementById('invitesList');
            const remaining = list ? list.querySelectorAll('.sg-invite-row').length : 0;
            const countPill = document.getElementById('invitesCountPill');
            if (countPill) countPill.textContent = remaining > 0 ? `(${remaining})` : '';

            if (remaining === 0) {
                const empty = document.getElementById('invitesEmpty');
                if (empty) empty.style.display = 'flex';
                const invitesBtn = document.getElementById('openInvitesModalBtn');
                if (invitesBtn) invitesBtn.style.display = 'none';
            }

            // If accepted, the coach now has a new group — refresh the Shared
            // Boards tab so the new group shows up (reuse existing init logic).
            if (action === 'accept') {
                sharedTabInitialized = false;
                try { await initializeSharedBoardsTab(); } catch (_) {}
            }

            if (typeof showToast === 'function') {
                showToast(action === 'accept' ? 'Invite accepted' : 'Invite declined', 'success');
            }
        } catch (err) {
            if (acceptBtn) acceptBtn.disabled = false;
            if (declineBtn) declineBtn.disabled = false;
            const msg = (err && err.message) || `Failed to ${action} invite`;
            if (typeof showToast === 'function') showToast(msg, 'error');
        }
    }

    // Wire up modal open/close handlers once on init
    (function wireInvitesModal() {
        const openBtn = document.getElementById('openInvitesModalBtn');
        const closeBtn = document.getElementById('invitesModalClose');
        const footerCloseBtn = document.getElementById('invitesModalCloseBtn');
        const overlay = document.getElementById('invitesModalOverlay');
        if (openBtn) openBtn.addEventListener('click', openInvitesModal);
        if (closeBtn) closeBtn.addEventListener('click', closeInvitesModal);
        if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeInvitesModal);
        if (overlay) overlay.addEventListener('click', closeInvitesModal);
    })();

    // ==================== Initialize ====================
    // URL ?subtab=…&modal_pool_entry_id=… or ?modal_player_user_id=… is the
    // "return from view-profile" path: a coach clicked View Full Profile in
    // the eval modal, navigated same-tab to the player profile, and used
    // browser Back. The eval-modal click handler stashes these params via
    // history.replaceState so Back returns to the exact subtab + reopens
    // the modal for that recruit.
    const _initParams = new URLSearchParams(window.location.search);
    const _urlSubtab = _initParams.get('subtab');
    const _restorePoolEntryId = _initParams.get('modal_pool_entry_id');
    const _restorePlayerUserId = _initParams.get('modal_player_user_id');
    const initialSubtab = _urlSubtab
        || localStorage.getItem('lastViewedRecruitingBoardSubtab')
        || 'personal-boards';

    async function _restoreEvalModalIfRequested() {
        if (!_restorePoolEntryId && !_restorePlayerUserId) return;
        // Pipeline tab is the only place we read currentPipelineRecruits, and
        // the modal restore needs a recruit object. If the URL targets Team
        // Pool or another subtab, we still match against the pipeline list
        // first (cross-coach evals come back via /pipeline/evaluations on
        // modal open regardless of which list the recruit came from).
        try { await initializePipelineTab(); } catch (_) {}
        const list = Array.isArray(currentPipelineRecruits) ? currentPipelineRecruits : [];
        const match = list.find(r => {
            if (_restorePoolEntryId && r.pool_entry_id) {
                return String(r.pool_entry_id) === String(_restorePoolEntryId);
            }
            if (_restorePlayerUserId && r.linked_player_user_id) {
                return String(r.linked_player_user_id) === String(_restorePlayerUserId);
            }
            return false;
        });
        if (match) {
            openEvaluationModal(match);
        }
        // Strip the modal-restore params so a manual refresh doesn't keep
        // re-opening the modal. Keep ?subtab so subtab persistence works.
        const cleanParams = new URLSearchParams(window.location.search);
        cleanParams.delete('modal_pool_entry_id');
        cleanParams.delete('modal_player_user_id');
        const qs = cleanParams.toString();
        const cleanUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
    }

    // Always boot the personal tab so currentPersonalBoardId is populated, then
    // switch to the user's last subtab. activateSubtab() will lazy-init shared if needed.
    initializePersonalBoardsTab().then(() => {
        if (initialSubtab !== 'personal-boards') {
            return activateSubtab(initialSubtab);
        }
        // No activateSubtab() call on the personal-boards default path — fire
        // the first-visit info-modal check here so it still auto-opens.
        maybeAutoOpenInfoModal('personal-boards');
    }).then(() => _restoreEvalModalIfRequested());

});
