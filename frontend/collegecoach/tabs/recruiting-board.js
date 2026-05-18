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
        async function doSearch(q) {
            if (!q || q.length < 2) {
                _lastSearchResults[ctx] = [];
                results.innerHTML = '';
                return;
            }
            try {
                const groupId = getGroupId ? getGroupId() : null;
                const url = groupId
                    ? `/recruiting-board/groups/search-coaches?query=${encodeURIComponent(q)}&groupId=${groupId}`
                    : `/recruiting-board/groups/search-coaches?query=${encodeURIComponent(q)}`;
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

        let locationLine = '';
        if (isTransfer) {
            locationLine = [player.team_name, player.college_division].filter(Boolean).join(' • ');
        } else {
            locationLine = [player.team_name, player.state].filter(Boolean).join(', ');
        }

        // Q badge marks questionnaire-only recruits (no DR account). Coaches
        // see at-a-glance which players don't have a DR profile to click into.
        const qBadgeHtml = !player.user_id
            ? '<span class="recruit-q-badge" title="Questionnaire only — no DR account">Q</span>'
            : '';
        card.innerHTML = `
            <div class="recruit-rank">1</div>
            <div class="recruit-info">
                <div class="recruit-name">${nameLine}${qBadgeHtml}</div>
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
        // View Profile only renders when the player has a DR account
        // (questionnaire-only entries have no profile to link to).
        const viewProfileHtml = player.username
            ? `<button class="context-menu-item view-profile-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                View Profile
            </button>`
            : '';
        menu.innerHTML = `
            ${viewProfileHtml}
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

        const viewProfileBtn = menu.querySelector('.view-profile-btn');
        if (viewProfileBtn) viewProfileBtn.addEventListener('click', () => {
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

        // Badges (DR member, resubmitted, + Plan 4 cross-coach checkmark)
        const badges = [];
        if (entry.is_in_any_pipeline_at_school) {
            badges.push('<span class="rb-pool-row-check" title="Already in a coach’s pipeline at this school">✓</span>');
        }
        if (hasAccount) {
            badges.push('<span class="rb-pool-row-badge dr">DR Member</span>');
        }
        if (entry.submission_count && entry.submission_count > 1) {
            badges.push(`<span class="rb-pool-row-badge resubmitted">Resubmitted ${entry.submission_count}x</span>`);
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

            qBody.innerHTML = renderQuestionnaireView(latest);
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
        const hidden = localStorage.getItem(storageKey) === 'true';
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
        const accentColor = hasAccount ? '#1282a2' : '#9ca3af';
        const ringBg = hasAccount
            ? 'rgba(18, 130, 162, 0.18)'
            : 'rgba(156, 163, 175, 0.18)';

        const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';

        const meta = [];
        if (recruit.positions && recruit.positions.length) meta.push(recruit.positions.join('/'));
        if (recruit.height_inches) meta.push(inchesToHeight(recruit.height_inches));
        if (recruit.weight_lbs) meta.push(`${recruit.weight_lbs} lbs`);
        if (recruit.graduation_year) meta.push(String(recruit.graduation_year));
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
            if (countEl) countEl.textContent = `${currentSentHandoffs.length} pending`;

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

    // Plan 5A's listOut groups by recruit: { recruit, pending_recipients: [{handoff_id, recipient, message, created_at}], created_at }
    function buildHandoffSentCard(item) {
        const recruit = item.recruit;
        const recipients = item.pending_recipients || [];
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

        const chipsHtml = recipients.map(r => {
            const recip = r.recipient || {};
            const name = `${recip.first_name || ''} ${recip.last_name || ''}`.trim() || 'Coach';
            const initials = ((recip.first_name || '')[0] || '') + ((recip.last_name || '')[0] || '');
            const av = recip.profile_image_url
                ? `<img src="${escapeHtml(recip.profile_image_url)}" alt="" class="handoff-recipient-chip-img">`
                : `<span class="handoff-recipient-chip-initials">${escapeHtml(initials.toUpperCase() || 'C')}</span>`;
            return `
                <span class="handoff-recipient-chip">
                    <span class="handoff-recipient-chip-avatar">${av}</span>
                    <span class="handoff-recipient-chip-name">${escapeHtml(name)}</span>
                    <span class="handoff-pending-pill">pending</span>
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
            const data = await API.pipeline.getHandoffsIn();
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
        const senderSubheaderParts = [];
        if (sender.team_name) senderSubheaderParts.push(sender.team_name);
        if (sender.state) senderSubheaderParts[0] = `${senderSubheaderParts[0] || ''}, ${sender.state}`;
        if (sender.college_division) senderSubheaderParts.push(sender.college_division);
        const senderSubheader = senderSubheaderParts.filter(Boolean).join(' • ');
        const senderInitials = ((sender.first_name || '')[0] || '') + ((sender.last_name || '')[0] || '');
        const senderAvatar = sender.profile_image_url
            ? `<img src="${escapeHtml(sender.profile_image_url)}" alt="" class="sg-coach-avatar-img">`
            : `<span class="sg-coach-initials">${escapeHtml(senderInitials.toUpperCase() || 'C')}</span>`;

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

        const messageHtml = (item.message && String(item.message).trim())
            ? `<div class="handoff-received-message">"${escapeHtml(item.message)}"</div>`
            : '';

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
            <div class="handoff-sender-row">
                <div class="sg-coach-avatar">${senderAvatar}</div>
                <div class="handoff-sender-text">
                    <div class="sg-coach-name">${escapeHtml(senderName)}</div>
                    <div class="sg-coach-subheader">${escapeHtml(senderSubheader)}</div>
                </div>
            </div>
            ${messageHtml}
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
            <div class="handoff-actions">
                <button class="btn-cancel handoff-reject-btn" type="button">Reject</button>
                <button class="btn-submit handoff-accept-btn" type="button">Accept</button>
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
        return `<ol class="eval-chain-timeline">
            ${chain.map(entry => {
                const colorHex = COLOR_HEX[entry.color_tag] || null;
                const swatch = colorHex
                    ? `<span class="eval-chain-swatch" style="background:${colorHex};"></span>`
                    : '<span class="eval-chain-swatch eval-chain-swatch-empty"></span>';
                const grade = (entry.grade != null) ? entry.grade : '—';
                const name = escapeHtml(entry.coach_name || 'Coach');
                const title = entry.coach_title ? `<span class="eval-chain-coach-title">${escapeHtml(entry.coach_title)}</span>` : '';
                const date = formatDate(entry.evaluated_at);
                const notes = entry.notes && String(entry.notes).trim()
                    ? `<blockquote class="eval-chain-notes">${escapeHtml(entry.notes)}</blockquote>`
                    : '';
                return `
                    <li class="eval-chain-entry">
                        <div class="eval-chain-entry-header">
                            ${swatch}
                            <div class="eval-chain-coach">
                                <span class="eval-chain-coach-name">${name}</span>
                                ${title}
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
            // Optimistic: remove the recruit from My Pipeline (status flipped to 'out')
            currentPipelineRecruits = currentPipelineRecruits.filter(r => r.id !== sendHandoffRecruitId);
            rerenderMyPipelineList();
            closeSendHandoffModal();
            closeEvaluationModal();
            // Quiet re-fetch to reconcile
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

    function openEvaluationModal(recruit) {
        currentEvalRecruit = recruit;
        const modal = document.getElementById('evaluationModal');
        if (!modal) return;

        const hasAccount = !!recruit.linked_player_user_id;
        const accentColor = hasAccount ? '#1282a2' : '#9ca3af';
        const ringBg = hasAccount
            ? 'rgba(18, 130, 162, 0.18)'
            : 'rgba(156, 163, 175, 0.18)';

        const fullName = `${recruit.first_name || ''} ${recruit.last_name || ''}`.trim() || 'Unknown';

        // Header — name on top with compact DR badge, subheader on the
        // line below (positions • height • weight • grad year). Subheader
        // renders for both DR-linked and questionnaire-only recruits; the
        // color reflects DR-account presence (cerulean vs neutral gray).
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
        if (recruit.graduation_year) subParts.push(String(recruit.graduation_year));
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
        const hasQuestionnaire = recruit.source === 'pool';

        if (hasAccount) {
            pSection.style.display = 'block';
            const profileLink = document.getElementById('evalProfileLink');
            profileLink.href = `../../shared/view-profile.html?userId=${encodeURIComponent(recruit.linked_player_user_id)}`;
        } else {
            pSection.style.display = 'none';
        }

        if (hasQuestionnaire) {
            qSection.style.display = 'block';
            // Render the full latest questionnaire submission — every field
            // the recruit submitted (personal, address, parents, family,
            // academic, athletic, film). The backend ships submission_data
            // on the recruit shape so no extra fetch is needed here.
            document.getElementById('evalQuestionnaireBody').innerHTML =
                renderQuestionnaireView(recruit.submission_data || {});
        } else {
            qSection.style.display = 'none';
        }

        if (emptyMsg) {
            emptyMsg.style.display = (hasAccount || hasQuestionnaire) ? 'none' : 'block';
        }

        // Evaluation fields
        const slider = document.getElementById('evalGradeSlider');
        const readout = document.getElementById('evalGradeReadout');
        const initialGrade = (recruit.grade != null) ? recruit.grade : 50;
        slider.value = initialGrade;
        readout.textContent = (recruit.grade != null) ? String(recruit.grade) : '—';
        slider.dataset.touched = (recruit.grade != null) ? '1' : '0';

        // Color swatches — mark the selected one
        document.querySelectorAll('#evalColorRow .eval-color-swatch').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.color === (recruit.color_tag || ''));
        });

        // Notes
        document.getElementById('evalNotes').value = recruit.notes || '';

        // Add to Board — always enabled. Pool recruits without a DR account
        // get added via their pool_entry_id (questionnaire-only board support
        // pulled forward from Plan 6).
        const addBoardBtn = document.getElementById('evalAddBoardBtn');
        addBoardBtn.disabled = false;
        addBoardBtn.title = '';

        // Plan 5B: History tab — enable when this recruit has a non-empty
        // evaluation_chain (i.e., they were handed off here). Render the
        // chain into the History panel up front so tab switch is instant.
        const historyTabBtn = document.querySelector('.eval-tab[data-eval-tab="history"]');
        const historyContent = document.getElementById('evalHistoryContent');
        const hasChain = Array.isArray(recruit.evaluation_chain) && recruit.evaluation_chain.length > 0;
        if (historyTabBtn) {
            if (hasChain) {
                historyTabBtn.disabled = false;
                historyTabBtn.removeAttribute('title');
            } else {
                historyTabBtn.disabled = true;
                historyTabBtn.title = 'Available once another coach hands off this recruit';
            }
        }
        if (historyContent) {
            historyContent.innerHTML = hasChain ? renderEvaluationChainTimeline(recruit.evaluation_chain) : '';
        }
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

    // Plan 5B: switch between Evaluation and History tabs inside the Eval Modal.
    function switchEvalTab(tabKey) {
        // Don't allow switching to a disabled tab
        const target = document.querySelector(`.eval-tab[data-eval-tab="${tabKey}"]`);
        if (target && target.disabled) return;
        document.querySelectorAll('.eval-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.evalTab === tabKey);
        });
        document.querySelectorAll('.eval-tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.evalTabContent === tabKey);
        });
    }

    function closeEvaluationModal() {
        const modal = document.getElementById('evaluationModal');
        if (modal) modal.classList.remove('active');
        currentEvalRecruit = null;
    }

    async function saveEvaluation() {
        if (!currentEvalRecruit) return;
        const slider = document.getElementById('evalGradeSlider');
        const notes = document.getElementById('evalNotes').value;
        const selectedSwatch = document.querySelector('#evalColorRow .eval-color-swatch.selected');
        const color_tag = selectedSwatch ? (selectedSwatch.dataset.color || null) : null;
        // Only send a grade if user touched the slider OR there was a prior grade
        const gradeTouched = slider.dataset.touched === '1';
        const grade = gradeTouched ? parseInt(slider.value, 10) : null;

        try {
            const result = await API.pipeline.updateEvaluation(currentEvalRecruit.id, { grade, color_tag, notes });
            if (typeof showToast === 'function') showToast('Saved', 'success');
            // Update the in-memory copy + refresh just that row
            const idx = currentPipelineRecruits.findIndex(r => r.id === result.recruit.id);
            if (idx >= 0) currentPipelineRecruits[idx] = result.recruit;
            currentEvalRecruit = result.recruit;
            // Easiest refresh: re-render the whole list
            const listEl = document.getElementById('pipelineList');
            if (listEl) {
                listEl.innerHTML = '';
                for (const r of currentPipelineRecruits) listEl.appendChild(buildPipelineRow(r));
            }
            closeEvaluationModal();
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to save', 'error');
            }
        }
    }

    async function removeRecruitFromPipeline() {
        if (!currentEvalRecruit) return;
        const ok = await (typeof showConfirmModal === 'function'
            ? showConfirmModal({
                title: 'Remove from Pipeline',
                message: "Remove this recruit from your pipeline? They'll stay in the team pool.",
                confirmText: 'Remove',
                cancelText: 'Cancel',
                danger: true
            })
            : Promise.resolve(window.confirm('Remove this recruit from your pipeline?')));
        if (!ok) return;

        try {
            const result = await API.pipeline.remove(currentEvalRecruit.id);
            if (typeof showToast === 'function') showToast('Removed from pipeline', 'success');

            // Remove from in-memory list + re-render
            currentPipelineRecruits = currentPipelineRecruits.filter(r => r.id !== currentEvalRecruit.id);
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

            // Sync the pool tab's matching row if it's mounted
            if (result.pool_entry_id) {
                const poolRow = document.querySelector(`.rb-pool-row[data-entry-id="${result.pool_entry_id}"]`);
                if (poolRow) {
                    // Always: I no longer have them → button flips back to "Add to Pipeline"
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

            closeEvaluationModal();
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err && err.message ? err.message : 'Failed to remove', 'error');
            }
        }
    }

    // ====================================================================
    // ADD-TO-BOARD MODAL (Plan 4 Step 9)
    // ====================================================================

    let addBoardContext = null;  // { recruit, personalBoards: [], sharedGroups: [], positions: [] }

    async function openAddBoardModal() {
        if (!currentEvalRecruit) return;
        // Questionnaire-only recruits (no DR account) are routed via
        // pool_entry_id in confirmAddToBoard. Both paths reach the same
        // backend route; the football field renders the right card variant.
        const modal = document.getElementById('addBoardModal');
        if (!modal) return;

        // Load personal boards + groups in parallel
        try {
            const [personalRes, groupsRes] = await Promise.all([
                API.get('/recruiting-board/personal'),  // existing route lists personal boards
                API.get('/recruiting-board/groups')      // existing route lists groups
            ]);
            const personalBoards = (personalRes && personalRes.boards) || personalRes || [];
            const sharedGroups = (groupsRes && groupsRes.groups) || groupsRes || [];

            addBoardContext = {
                recruit: currentEvalRecruit,
                personalBoards,
                sharedGroups,
                // Positions: use the recruit's first position as the default if present;
                // else a generic list. We populate via a fixed roster (same as the board UI).
                positionsList: [
                    'QB','RB','FB','WR','TE','OL','OT','OG','C',
                    'DL','DE','DT','NT','LB','ILB','OLB','CB','S','FS','SS',
                    'K','P','LS','ATH'
                ]
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

            // Render positions dropdown (default = recruit's first position)
            const posSelect = document.getElementById('addBoardPositionSelect');
            posSelect.innerHTML = addBoardContext.positionsList.map(p =>
                `<option value="${p}">${p}</option>`).join('');
            const recruitFirstPos = (currentEvalRecruit.positions && currentEvalRecruit.positions[0]) || '';
            if (recruitFirstPos && addBoardContext.positionsList.includes(recruitFirstPos)) {
                posSelect.value = recruitFirstPos;
            }

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

    function handleAddBoardTypeChange() {
        if (!addBoardContext) return;
        const type = document.querySelector('input[name="addBoardType"]:checked').value;
        const groupRow = document.getElementById('addBoardGroupRow');
        const boardSelect = document.getElementById('addBoardSelect');
        const warning = document.getElementById('addBoardWarning');
        warning.style.display = 'none';
        warning.textContent = '';

        if (type === 'personal') {
            groupRow.style.display = 'none';
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
        } else {
            groupRow.style.display = 'block';
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
        const groupSelect = document.getElementById('addBoardGroupSelect');
        const boardSelect = document.getElementById('addBoardSelect');
        const warning = document.getElementById('addBoardWarning');
        const groupId = groupSelect.value;
        if (!groupId) return;
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
                warning.style.display = 'none';
                warning.textContent = '';
            }
        } catch (err) {
            boardSelect.innerHTML = '<option value="">Failed to load boards</option>';
        }
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

    function renderQuestionnaireView(d) {
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

        // Academic
        const academicBody =
            poolField('High School', academic.high_school) +
            poolField('Graduation Year', academic.graduation_year) +
            poolField('GPA', academic.gpa != null ? Number(academic.gpa).toFixed(2) : null) +
            poolField('Intended Major', academic.intended_major) +
            poolField('NCAA Registered', academic.ncaa_registered ? 'Yes' : null) +
            poolField('NCAA ID', academic.ncaa_id) +
            poolField('SAT', academic.sat_score) +
            poolField('ACT', academic.act_score) +
            poolField('Academic Honors', academic.honors);

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

    // Wire evaluation modal handlers once on init (Plan 4)
    (function wireEvaluationModal() {
        const closeBtn = document.getElementById('evaluationModalClose');
        const overlay = document.getElementById('evaluationModalOverlay');
        const saveBtn = document.getElementById('evalSaveBtn');
        const deleteBtn = document.getElementById('evalDeleteBtn');
        const addBoardBtn = document.getElementById('evalAddBoardBtn');
        const handoffBtn = document.getElementById('evalHandoffBtn');
        const slider = document.getElementById('evalGradeSlider');

        if (closeBtn) closeBtn.addEventListener('click', closeEvaluationModal);
        if (overlay) overlay.addEventListener('click', closeEvaluationModal);
        if (saveBtn) saveBtn.addEventListener('click', saveEvaluation);
        if (deleteBtn) deleteBtn.addEventListener('click', removeRecruitFromPipeline);
        if (addBoardBtn) addBoardBtn.addEventListener('click', openAddBoardModal);
        // Plan 5B: Send to Coach opens the Send Hand-Off modal
        if (handoffBtn) handoffBtn.addEventListener('click', () => {
            if (currentEvalRecruit) openSendHandoffModal(currentEvalRecruit);
        });
        // Plan 5B: tab switching (Evaluation / History)
        document.querySelectorAll('.eval-tab').forEach(btn => {
            btn.addEventListener('click', () => switchEvalTab(btn.dataset.evalTab));
        });

        if (slider) {
            slider.addEventListener('input', () => {
                slider.dataset.touched = '1';
                document.getElementById('evalGradeReadout').textContent = slider.value;
            });
        }

        // Color swatches — single-select, click again to deselect
        document.querySelectorAll('#evalColorRow .eval-color-swatch').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                const target = ev.currentTarget;
                if (target.classList.contains('eval-color-clear')) {
                    document.querySelectorAll('#evalColorRow .eval-color-swatch').forEach(b => b.classList.remove('selected'));
                    return;
                }
                const wasSelected = target.classList.contains('selected');
                document.querySelectorAll('#evalColorRow .eval-color-swatch').forEach(b => b.classList.remove('selected'));
                if (!wasSelected) target.classList.add('selected');
            });
        });

    })();

    // Wire add-to-board modal handlers once on init (Plan 4)
    (function wireAddBoardModal() {
        const closeBtn = document.getElementById('addBoardModalClose');
        const overlay = document.getElementById('addBoardModalOverlay');
        const cancelBtn = document.getElementById('addBoardCancelBtn');
        const confirmBtn = document.getElementById('addBoardConfirmBtn');
        const groupSelect = document.getElementById('addBoardGroupSelect');

        if (closeBtn) closeBtn.addEventListener('click', closeAddBoardModal);
        if (overlay) overlay.addEventListener('click', closeAddBoardModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeAddBoardModal);
        if (confirmBtn) confirmBtn.addEventListener('click', confirmAddToBoard);
        if (groupSelect) groupSelect.addEventListener('change', handleAddBoardGroupChange);

        document.querySelectorAll('input[name="addBoardType"]').forEach(radio => {
            radio.addEventListener('change', handleAddBoardTypeChange);
        });
    })();

    // Plan 5B: wire the Pipeline view switcher buttons
    (function wirePipelineViewSwitcher() {
        document.querySelectorAll('.pipeline-view-btn').forEach(btn => {
            btn.addEventListener('click', () => switchPipelineView(btn.dataset.view));
        });
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
    const initialSubtab = localStorage.getItem('lastViewedRecruitingBoardSubtab') || 'personal-boards';
    // Always boot the personal tab so currentPersonalBoardId is populated, then
    // switch to the user's last subtab. activateSubtab() will lazy-init shared if needed.
    initializePersonalBoardsTab().then(() => {
        if (initialSubtab !== 'personal-boards') {
            activateSubtab(initialSubtab);
        }
    });

});
