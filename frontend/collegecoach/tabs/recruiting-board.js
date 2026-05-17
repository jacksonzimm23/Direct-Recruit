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
        const targetId = `${camelTab(tabName)}Tab`;
        document.querySelectorAll('.rb-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === targetId);
        });
        // Body class drives visibility of the shared football field / controls
        document.body.classList.toggle('rb-tab-pipeline', tabName === 'pipeline');
        localStorage.setItem('lastViewedRecruitingBoardSubtab', tabName);

        if (tabName === 'shared-boards') {
            if (!sharedTabInitialized) {
                await initializeSharedBoardsTab();
            } else if (currentBoardMode !== 'group' && currentSharedBoardId && currentSharedGroupId) {
                // Re-render the active group board after switching back from another tab
                await loadSharedGroupBoard(currentSharedBoardId);
            }
        }
        if (tabName === 'personal-boards' && currentPersonalBoardId && currentBoardMode !== 'personal') {
            await loadPersonalBoardById(currentPersonalBoardId);
        }
        if (tabName === 'pipeline') {
            await initializePipelineShareUI();
        }
    }

    // Pipeline tab — Plan 2 ships the Copy Questionnaire Link UI here.
    // The grading/handoff pipeline UI itself ships in Plan 4.
    // Questionnaire is per-SCHOOL, not per-group, so the link is available to
    // any college coach with a team_name set, regardless of shared-group state.
    let pipelineShareInitialized = false;
    async function initializePipelineShareUI() {
        const loadingEl = document.getElementById('pipelineLoadingState');
        const shareEl = document.getElementById('pipelineShareState');
        const errorEl = document.getElementById('pipelineNoGroupState');
        if (!shareEl) return;

        // Reset to loading state on every activation so stale state doesn't flash
        if (loadingEl) loadingEl.style.display = 'block';
        shareEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        try {
            const data = await API.get('/recruiting-board/my-questionnaire');
            if (loadingEl) loadingEl.style.display = 'none';
            shareEl.style.display = 'block';

            const previewLink = document.getElementById('previewQuestionnaireLink');
            const urlDisplay = document.getElementById('pipelineShareUrlDisplay');
            const copyBtn = document.getElementById('copyQuestionnaireLinkBtn');
            if (previewLink) previewLink.href = data.public_url;
            if (urlDisplay) urlDisplay.textContent = data.public_url;

            if (copyBtn && !pipelineShareInitialized) {
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(data.public_url);
                        if (typeof showToast === 'function') showToast('Questionnaire link copied to clipboard', 'success');
                    } catch (_) {
                        if (typeof showToast === 'function') showToast('Could not copy. Select the URL manually.', 'error');
                    }
                });
                pipelineShareInitialized = true;
            }
        } catch (err) {
            if (loadingEl) loadingEl.style.display = 'none';
            // Only failure mode now is "coach has no team_name set" (400). Show
            // the fallback panel pointing them to My Profile.
            if (errorEl) errorEl.style.display = 'block';
        }
    }

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

        try {
            const configData = await API.get(`/recruiting-board/personal/${boardId}/config`);
            renderBoard(
                configData.offensePositions || DEFAULT_OFFENSE_POSITIONS,
                configData.defensePositions || DEFAULT_DEFENSE_POSITIONS
            );
            positionsLoaded = true;
        } catch (error) {
            console.error('Error loading personal board config:', error);
            renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS);
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
    let currentUserTeamName = null;  // populated from /auth/me for the same-school check
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

        // Cache the current coach's team_name so we can detect off-school invites.
        try {
            const me = await API.get('/auth/me');
            currentUserTeamName = (me.profile && me.profile.team_name) || null;
        } catch (e) { /* non-fatal */ }

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

        try {
            const cfg = await API.get(`/recruiting-board/groups/${currentSharedGroupId}/boards/${boardId}/config`);
            renderBoard(cfg.offensePositions || DEFAULT_OFFENSE_POSITIONS,
                        cfg.defensePositions || DEFAULT_DEFENSE_POSITIONS);
            positionsLoaded = true;
        } catch (error) {
            console.error('Error loading group board config:', error);
            renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS);
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
                if (listElId === 'createGroupStagedList') renderCreateGroupStagedList();
                else renderInfoStagedList();
            });
        });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------- Shared search-coaches with same-school disclaimer ----------
    let _sgPendingPick = null; // { ctx: 'create' | 'info', coach } for the disclaimer modal

    function setupMemberSearch(inputId, resultsId, ctx, getStagedArr, getGroupId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        if (!input || !results) return;
        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => doSearch(input.value), 300);
        });
        async function doSearch(q) {
            if (!q || q.length < 2) { results.innerHTML = ''; return; }
            try {
                const groupId = getGroupId ? getGroupId() : null;
                const url = groupId
                    ? `/recruiting-board/groups/search-coaches?query=${encodeURIComponent(q)}&groupId=${groupId}`
                    : `/recruiting-board/groups/search-coaches?query=${encodeURIComponent(q)}`;
                const res = await API.get(url);
                renderResults(res.coaches || []);
            } catch (e) {
                results.innerHTML = '<p class="sg-staged-empty">Error searching coaches</p>';
            }
        }
        function renderResults(coaches) {
            const stagedIds = new Set(getStagedArr().map(m => String(m.user_id)));
            const filtered = coaches.filter(c => !stagedIds.has(String(c.user_id)));
            if (filtered.length === 0) {
                results.innerHTML = '<p class="sg-staged-empty">No coaches found</p>';
                return;
            }
            results.innerHTML = filtered.map(c => {
                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                const avatarHtml = c.profile_image_url
                    ? `<img src="${c.profile_image_url}" alt="${name}">`
                    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                // College Coach subheader format: "Team, State • Division" — orange.
                const teamPart = [c.team_name, c.state].filter(Boolean).join(', ');
                const subheader = [teamPart, c.college_division].filter(Boolean).join(' • ');
                return `<div class="sg-search-result-item" data-uid="${c.user_id}">
                    <div class="sg-search-result-info">
                        <div class="sg-search-result-avatar sg-coach-avatar">${avatarHtml}</div>
                        <div class="sg-search-result-details">
                            <span class="sg-search-result-name">${escapeHtml(name)}</span>
                            <span class="sg-search-result-school sg-coach-subheader">${escapeHtml(subheader)}</span>
                        </div>
                    </div>
                    <button class="sg-search-add-btn">Add</button>
                </div>`;
            }).join('');
            results.querySelectorAll('.sg-search-result-item').forEach(item => {
                item.querySelector('.sg-search-add-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    const uid = item.dataset.uid;
                    const coach = filtered.find(c => String(c.user_id) === String(uid));
                    if (coach) handlePickCoach(coach, ctx);
                });
            });
        }
    }

    function handlePickCoach(coach, ctx) {
        const sameSchool = currentUserTeamName &&
            String(coach.team_name || '').toLowerCase() === String(currentUserTeamName).toLowerCase();
        if (sameSchool) {
            stageCoach(coach, ctx);
            return;
        }
        // Different school: show disclaimer
        _sgPendingPick = { ctx, coach };
        const text = document.getElementById('sgSameSchoolText');
        if (text) {
            const name = `${coach.first_name || ''} ${coach.last_name || ''}`.trim();
            text.innerHTML = `<strong>${escapeHtml(name)}</strong> is from <strong>${escapeHtml(coach.team_name || 'another program')}</strong>, not <strong>${escapeHtml(currentUserTeamName || 'your program')}</strong>. Add them to the group anyway?`;
        }
        const modal = document.getElementById('sgSameSchoolModal');
        if (modal) modal.classList.add('active');
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
            const inp = document.getElementById('createGroupMemberSearchInput');
            const res = document.getElementById('createGroupMemberSearchResults');
            if (inp) inp.value = '';
            if (res) res.innerHTML = '';
        } else {
            renderInfoStagedList();
            const inp = document.getElementById('infoMemberSearchInput');
            const res = document.getElementById('infoMemberSearchResults');
            if (inp) inp.value = '';
            if (res) res.innerHTML = '';
        }
    }

    document.getElementById('sgSameSchoolModalOverlay')?.addEventListener('click', closeSameSchoolModal);
    document.getElementById('sgSameSchoolModalClose')?.addEventListener('click', closeSameSchoolModal);
    document.getElementById('sgSameSchoolCancelBtn')?.addEventListener('click', closeSameSchoolModal);
    document.getElementById('sgSameSchoolConfirmBtn')?.addEventListener('click', () => {
        if (_sgPendingPick) {
            stageCoach(_sgPendingPick.coach, _sgPendingPick.ctx);
        }
        closeSameSchoolModal();
    });

    function closeSameSchoolModal() {
        const modal = document.getElementById('sgSameSchoolModal');
        if (modal) modal.classList.remove('active');
        _sgPendingPick = null;
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

    // Create a player card element
    function createPlayerCard(player) {
        const card = document.createElement('div');
        card.className = 'recruit-card';
        card.draggable = true;
        card.dataset.playerId = player.user_id;
        card.dataset.playerType = player.player_type;
        card.dataset.position = player.position;
        card.dataset.username = player.username || '';

        // Determine styling based on player type
        const isTransfer = player.player_type === 'transfer';
        const cardClass = isTransfer ? 'transfer-player' : 'hs-player';
        card.classList.add(cardClass);

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

        let locationLine = '';
        if (isTransfer) {
            locationLine = [player.team_name, player.college_division].filter(Boolean).join(' • ');
        } else {
            locationLine = [player.team_name, player.state].filter(Boolean).join(', ');
        }

        card.innerHTML = `
            <div class="recruit-rank">1</div>
            <div class="recruit-info">
                <div class="recruit-name">${nameLine}</div>
                <div class="recruit-details">${physicalLine}</div>
                <div class="recruit-school">${locationLine}</div>
            </div>
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
        menu.innerHTML = `
            <button class="context-menu-item view-profile-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                View Profile
            </button>
            <button class="context-menu-item move-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14"></path>
                    <path d="M12 5l7 7-7 7"></path>
                </svg>
                Move to Another Board
            </button>
            <button class="context-menu-item delete-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Remove from Board
            </button>
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

        // Update position on scroll
        const scrollContainers = [
            document.querySelector('.board-content'),
            document.querySelector('.position-column'),
            window
        ].filter(Boolean);

        const handleScroll = () => {
            // Check if card is still visible
            const cardRect = card.getBoundingClientRect();
            const boardContent = document.querySelector('.board-content');
            if (boardContent) {
                const boardRect = boardContent.getBoundingClientRect();
                // If card scrolled out of view, close menu
                if (cardRect.bottom < boardRect.top || cardRect.top > boardRect.bottom) {
                    menu.remove();
                    scrollContainers.forEach(container => {
                        container.removeEventListener('scroll', handleScroll);
                    });
                    return;
                }
            }
            positionMenu();
        };

        scrollContainers.forEach(container => {
            container.addEventListener('scroll', handleScroll, { passive: true });
        });

        menu.querySelector('.view-profile-btn').addEventListener('click', () => {
            menu.remove();
            scrollContainers.forEach(container => {
                container.removeEventListener('scroll', handleScroll);
            });
            const username = player.username;
            if (username) {
                const folder = getProfileFolder({ role: 'player', is_transfer_player: player.player_type === 'transfer', college_division: player.college_division });
                window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=recruiting`;
            }
        });

        menu.querySelector('.move-btn').addEventListener('click', () => {
            menu.remove();
            scrollContainers.forEach(container => {
                container.removeEventListener('scroll', handleScroll);
            });
            showMovePlayerModal(player, card);
        });

        menu.querySelector('.delete-btn').addEventListener('click', () => {
            menu.remove();
            scrollContainers.forEach(container => {
                container.removeEventListener('scroll', handleScroll);
            });
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
    function renderBoard(offensePositions, defensePositions) {
        const offenseField = document.getElementById('offenseField');
        const defenseField = document.getElementById('defenseField');

        offenseField.innerHTML = '';
        defenseField.innerHTML = '';

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

        return { offensePositions, defensePositions };
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

    // ==================== Toggle Offense/Defense ====================
    const offenseBtn = document.getElementById('offenseBtn');
    const defenseBtn = document.getElementById('defenseBtn');
    const offenseField = document.getElementById('offenseField');
    const defenseField = document.getElementById('defenseField');

    // Restore last viewed offense/defense from localStorage
    const lastViewedSide = localStorage.getItem('lastViewedRecruitingBoardSide');
    if (lastViewedSide === 'defense') {
        defenseBtn.classList.add('active');
        offenseBtn.classList.remove('active');
        defenseField.classList.remove('hidden');
        offenseField.classList.add('hidden');
    }

    offenseBtn.addEventListener('click', () => {
        offenseBtn.classList.add('active');
        defenseBtn.classList.remove('active');
        offenseField.classList.remove('hidden');
        defenseField.classList.add('hidden');
        localStorage.setItem('lastViewedRecruitingBoardSide', 'offense');
        exitRemoveMode();
    });

    defenseBtn.addEventListener('click', () => {
        defenseBtn.classList.add('active');
        offenseBtn.classList.remove('active');
        defenseField.classList.remove('hidden');
        offenseField.classList.add('hidden');
        localStorage.setItem('lastViewedRecruitingBoardSide', 'defense');
        exitRemoveMode();
    });

    // ==================== Position Management ====================
    const addPositionBtn = document.getElementById('addPositionBtn');
    const removePositionBtn = document.getElementById('removePositionBtn');
    const removeModeIndicator = document.getElementById('removeModeIndicator');
    let isRemoveMode = false;
    let positionCounter = 0;

    function getActiveField() {
        return offenseField.classList.contains('hidden') ? defenseField : offenseField;
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

    // ==================== Initialize ====================
    const initialSubtab = localStorage.getItem('lastViewedRecruitingBoardSubtab') || 'personal-boards';
    // Always boot the personal tab so currentPersonalBoardId is populated, then
    // switch to the user's last subtab. activateSubtab() will lazy-init shared if needed.
    initializePersonalBoardsTab().then(() => {
        if (initialSubtab !== 'personal-boards') {
            activateSubtab(initialSubtab);
        }
    });

});
