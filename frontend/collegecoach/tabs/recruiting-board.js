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
    let currentBoardType = 'personal'; // 'personal' or board ID
    let currentBoardId = null;
    let currentBoardRole = null; // 'owner' or 'collaborator'
    let ownedSharedBoards = [];
    let collaboratorBoards = [];

    // Populate class year dropdown (2026-2030)
    const classYearSelect = document.getElementById('classYearSelect');
    const startYear = 2026;

    for (let i = 0; i < 5; i++) {
        const year = startYear + i;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Class of ${year}`;
        classYearSelect.appendChild(option);
    }

    // Restore last viewed class year from localStorage
    const lastViewedClassYear = localStorage.getItem('lastViewedRecruitingBoardClassYear');
    if (lastViewedClassYear && classYearSelect.querySelector(`option[value="${lastViewedClassYear}"]`)) {
        classYearSelect.value = lastViewedClassYear;
    }

    // ==================== Board Loading Functions ====================

    // Initialize personal board and load shared boards list
    async function initializeBoards() {
        try {
            // Initialize personal board
            await API.get('/recruiting-board/personal/init');

            // Get shared boards
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];

            // Update board selector dropdown
            updateBoardSelector();

            // Check for last viewed board in localStorage
            const lastViewedBoard = localStorage.getItem('lastViewedRecruitingBoard');
            const boardTypeSelect = document.getElementById('boardTypeSelect');

            // Check if last viewed board is valid (exists in the dropdown)
            let boardToLoad = 'personal';
            if (lastViewedBoard && lastViewedBoard !== 'personal') {
                // Check if the board still exists (user might have been removed or board deleted)
                const boardExists = ownedSharedBoards.some(b => b.id === lastViewedBoard) ||
                                   collaboratorBoards.some(b => b.id === lastViewedBoard);
                if (boardExists) {
                    boardToLoad = lastViewedBoard;
                }
            }

            // Set the dropdown value
            if (boardTypeSelect) {
                boardTypeSelect.value = boardToLoad;
            }

            // Load the appropriate board
            if (boardToLoad === 'personal') {
                await loadPersonalBoard(classYearSelect.value);
            } else {
                await loadSharedBoard(boardToLoad, classYearSelect.value);
            }
        } catch (error) {
            console.error('Error initializing boards:', error);
        }
    }

    // Update board selector dropdown
    function updateBoardSelector() {
        const boardTypeSelect = document.getElementById('boardTypeSelect');

        // Clear existing options except Personal Board
        const options = boardTypeSelect.querySelectorAll('option:not([value="personal"])');
        options.forEach(opt => opt.remove());

        // Add owned shared boards
        ownedSharedBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.board_name;
            option.dataset.role = 'owner';
            boardTypeSelect.appendChild(option);
        });

        // Add boards where user is collaborator
        collaboratorBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = `${board.board_name} (${board.owner_first_name} ${board.owner_last_name})`;
            option.dataset.role = 'collaborator';
            option.dataset.ownerId = board.owner_user_id;
            boardTypeSelect.appendChild(option);
        });
    }

    // Load personal board
    async function loadPersonalBoard(classYear) {
        currentBoardType = 'personal';
        currentBoardId = null;
        currentBoardRole = 'owner';

        // Update UI
        updateBoardUI();

        // Load position config
        if (!positionsLoaded) {
            try {
                const configData = await API.get('/recruiting-board/personal/config');
                renderBoard(configData.offensePositions || DEFAULT_OFFENSE_POSITIONS,
                           configData.defensePositions || DEFAULT_DEFENSE_POSITIONS);
                positionsLoaded = true;
            } catch (error) {
                console.error('Error loading personal board config:', error);
                renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS);
                positionsLoaded = true;
            }
        }

        // Load players for the year
        await loadPlayersForBoard(classYear);
    }

    // Load shared board
    async function loadSharedBoard(boardId, classYear) {
        currentBoardType = 'shared';
        currentBoardId = boardId;

        try {
            // Get board details
            const boardData = await API.get(`/recruiting-board/shared/${boardId}`);
            currentBoardRole = boardData.userRole;

            // Update UI
            updateBoardUI(boardData);

            // Render positions for this shared board
            renderBoard(boardData.offensePositions || DEFAULT_OFFENSE_POSITIONS,
                       boardData.defensePositions || DEFAULT_DEFENSE_POSITIONS);

            // Load players for the year
            await loadPlayersForBoard(classYear);
        } catch (error) {
            console.error('Error loading shared board:', error);
            showToast('Failed to load board', 'error');
        }
    }

    // Load players for current board
    async function loadPlayersForBoard(classYear) {
        try {
            // Clear existing players
            document.querySelectorAll('.recruits-list').forEach(list => {
                list.innerHTML = '';
            });

            let playersData;
            if (currentBoardType === 'personal') {
                playersData = await API.get(`/recruiting-board/personal/${classYear}/players`);
            } else {
                playersData = await API.get(`/recruiting-board/shared/${currentBoardId}/${classYear}/players`);
            }

            loadPlayersIntoBoard(playersData || []);
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    // Update UI based on current board
    function updateBoardUI(boardData = null) {
        const currentBoardHeader = document.getElementById('currentBoardHeader');
        const currentBoardName = document.getElementById('currentBoardName');
        const editBoardNameBtn = document.getElementById('editBoardNameBtn');
        const deleteBoardBtn = document.getElementById('deleteBoardBtn');
        const inviteCollaboratorsBtn = document.getElementById('inviteCollaboratorsBtn');
        const leaveBoardBtn = document.getElementById('leaveBoardBtn');
        const createSharedBoardBtn = document.getElementById('createSharedBoardBtn');

        if (currentBoardType === 'personal') {
            // Personal Board
            currentBoardHeader.style.display = 'none';
            inviteCollaboratorsBtn.style.display = 'none';
            leaveBoardBtn.style.display = 'none';
            createSharedBoardBtn.style.display = 'flex';
        } else {
            // Shared Board
            currentBoardHeader.style.display = 'flex';
            currentBoardName.textContent = boardData ? boardData.board_name : 'Shared Board';
            createSharedBoardBtn.style.display = 'flex';

            if (currentBoardRole === 'owner') {
                // Owner of shared board
                editBoardNameBtn.style.display = 'flex';
                deleteBoardBtn.style.display = 'flex';
                inviteCollaboratorsBtn.style.display = 'flex';
                leaveBoardBtn.style.display = 'none';
            } else {
                // Collaborator on shared board
                editBoardNameBtn.style.display = 'none';
                deleteBoardBtn.style.display = 'none';
                inviteCollaboratorsBtn.style.display = 'none';
                leaveBoardBtn.style.display = 'flex';
            }
        }
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

        // Add drag listeners
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        // Add click to show context menu
        card.addEventListener('click', (e) => {
            if (!card.classList.contains('dragging')) {
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
                const classYear = classYearSelect.value;

                if (currentBoardType === 'personal') {
                    await API.delete(`/recruiting-board/personal/${classYear}/players/${playerId}?position=${position}`);
                } else {
                    await API.delete(`/recruiting-board/shared/${currentBoardId}/${classYear}/players/${playerId}?position=${position}`);
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
        const classYear = classYearSelect.value;

        cardToRemove = card;
        removeConfirmText.innerHTML = `Are you sure you want to remove <strong>${playerName}</strong> from the recruiting board?`;
        removeBoardInfo.textContent = `Class of ${classYear} • ${position}`;

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
                if (movePositionConfigs['personal']) {
                    config = movePositionConfigs['personal'];
                } else {
                    config = await API.get('/recruiting-board/personal/config');
                    movePositionConfigs['personal'] = config;
                }
            } else {
                if (movePositionConfigs[boardId]) {
                    config = movePositionConfigs[boardId];
                } else {
                    const boardData = await API.get(`/recruiting-board/shared/${boardId}`);
                    config = {
                        offensePositions: boardData.offensePositions,
                        defensePositions: boardData.defensePositions
                    };
                    movePositionConfigs[boardId] = config;
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
                const classYear = classYearSelect.value;
                const sourcePosition = cardToMove.dataset.position;
                const playerId = cardToMove.dataset.playerId;

                // If not copy mode, remove from current board first
                if (!isCopyMode) {
                    if (currentBoardType === 'personal') {
                        await API.delete(`/recruiting-board/personal/${classYear}/players/${playerId}?position=${sourcePosition}`);
                    } else {
                        await API.delete(`/recruiting-board/shared/${currentBoardId}/${classYear}/players/${playerId}?position=${sourcePosition}`);
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
                    await API.post(`/recruiting-board/personal/${classYear}/players`, playerData);
                } else {
                    await API.post(`/recruiting-board/shared/${targetBoard.id}/${classYear}/players`, playerData);
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
        const classYear = classYearSelect.value;

        if (movePlayerName) {
            movePlayerName.innerHTML = `Move <strong>${playerFullName}</strong> from ${sourcePosition} (Class of ${classYear})`;
        }

        // Load available boards (exclude current board)
        moveTargetBoardSelect.innerHTML = '<option value="">Loading boards...</option>';
        moveTargetPositionSelect.innerHTML = '<option value="">Select a board first</option>';
        moveModalSubmit.disabled = true;

        try {
            // Get personal board config
            const personalConfig = await API.get('/recruiting-board/personal/config');

            // Get shared boards
            const sharedResponse = await API.get('/recruiting-board/shared');

            moveTargetBoards = [];

            // Add personal board if not currently on personal board
            if (currentBoardType !== 'personal') {
                moveTargetBoards.push({
                    id: 'personal',
                    name: 'Personal Board',
                    type: 'personal'
                });
            }

            // Add owned shared boards (exclude current board)
            if (sharedResponse.ownedBoards) {
                sharedResponse.ownedBoards.forEach(board => {
                    if (board.id !== currentBoardId) {
                        moveTargetBoards.push({
                            id: board.id,
                            name: board.board_name,
                            type: 'shared'
                        });
                    }
                });
            }

            // Add collaborator boards (exclude current board)
            if (sharedResponse.collaboratorBoards) {
                sharedResponse.collaboratorBoards.forEach(board => {
                    if (board.id !== currentBoardId) {
                        moveTargetBoards.push({
                            id: board.id,
                            name: `${board.board_name} (${board.owner_first_name} ${board.owner_last_name})`,
                            type: 'shared'
                        });
                    }
                });
            }

            // Populate board dropdown
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

    // ==================== Create Shared Board Modal ====================
    const createSharedBoardBtn = document.getElementById('createSharedBoardBtn');
    const createSharedBoardModal = document.getElementById('createSharedBoardModal');
    const newBoardNameInput = document.getElementById('newBoardNameInput');

    function openCreateSharedBoardModal() {
        newBoardNameInput.value = '';
        createSharedBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => newBoardNameInput.focus(), 100);
    }

    function closeCreateSharedBoardModal() {
        createSharedBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (createSharedBoardBtn) createSharedBoardBtn.addEventListener('click', openCreateSharedBoardModal);
    document.getElementById('createSharedBoardModalOverlay')?.addEventListener('click', closeCreateSharedBoardModal);
    document.getElementById('createSharedBoardModalClose')?.addEventListener('click', closeCreateSharedBoardModal);
    document.getElementById('createSharedBoardCancelBtn')?.addEventListener('click', closeCreateSharedBoardModal);

    document.getElementById('createSharedBoardSubmitBtn')?.addEventListener('click', async () => {
        const boardName = newBoardNameInput.value.trim();
        if (!boardName) {
            showToast('Please enter a board name', 'error');
            return;
        }

        const submitBtn = document.getElementById('createSharedBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
            const result = await API.post('/recruiting-board/shared', { boardName });
            closeCreateSharedBoardModal();

            // Refresh shared boards list
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];
            updateBoardSelector();

            // Switch to the new board
            document.getElementById('boardTypeSelect').value = result.board.id;
            await loadSharedBoard(result.board.id, classYearSelect.value);

            showToast('Shared board created successfully!');
        } catch (error) {
            console.error('Error creating shared board:', error);
            showToast(error.error || 'Failed to create board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Board';
        }
    });

    // ==================== Edit Board Name Modal ====================
    const editBoardNameModal = document.getElementById('editBoardNameModal');
    const editBoardNameInput = document.getElementById('editBoardNameInput');

    function openEditBoardNameModal() {
        editBoardNameInput.value = document.getElementById('currentBoardName').textContent;
        editBoardNameModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => editBoardNameInput.focus(), 100);
    }

    function closeEditBoardNameModal() {
        editBoardNameModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    document.getElementById('editBoardNameBtn')?.addEventListener('click', openEditBoardNameModal);
    document.getElementById('editBoardNameModalOverlay')?.addEventListener('click', closeEditBoardNameModal);
    document.getElementById('editBoardNameModalClose')?.addEventListener('click', closeEditBoardNameModal);
    document.getElementById('editBoardNameCancelBtn')?.addEventListener('click', closeEditBoardNameModal);

    document.getElementById('editBoardNameSubmitBtn')?.addEventListener('click', async () => {
        const boardName = editBoardNameInput.value.trim();
        if (!boardName) {
            showToast('Please enter a board name', 'error');
            return;
        }

        const submitBtn = document.getElementById('editBoardNameSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
            await API.put(`/recruiting-board/shared/${currentBoardId}/name`, { boardName });
            document.getElementById('currentBoardName').textContent = boardName;
            closeEditBoardNameModal();

            // Refresh shared boards list
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];
            updateBoardSelector();

            showToast('Board name updated!');
        } catch (error) {
            console.error('Error updating board name:', error);
            showToast(error.error || 'Failed to update board name', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save';
        }
    });

    // ==================== Delete Board Modal ====================
    const deleteBoardModal = document.getElementById('deleteBoardModal');

    function openDeleteBoardModal() {
        document.getElementById('deleteBoardName').textContent = document.getElementById('currentBoardName').textContent;
        deleteBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDeleteBoardModal() {
        deleteBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    document.getElementById('deleteBoardBtn')?.addEventListener('click', openDeleteBoardModal);
    document.getElementById('deleteBoardModalOverlay')?.addEventListener('click', closeDeleteBoardModal);
    document.getElementById('deleteBoardModalClose')?.addEventListener('click', closeDeleteBoardModal);
    document.getElementById('deleteBoardCancelBtn')?.addEventListener('click', closeDeleteBoardModal);

    document.getElementById('deleteBoardSubmitBtn')?.addEventListener('click', async () => {
        const submitBtn = document.getElementById('deleteBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Deleting...';

        try {
            await API.delete(`/recruiting-board/shared/${currentBoardId}`);
            closeDeleteBoardModal();

            // Refresh shared boards list
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];
            updateBoardSelector();

            // Switch back to personal board
            document.getElementById('boardTypeSelect').value = 'personal';
            await loadPersonalBoard(classYearSelect.value);

            showToast('Board deleted successfully');
        } catch (error) {
            console.error('Error deleting board:', error);
            showToast(error.error || 'Failed to delete board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Delete';
        }
    });

    // ==================== Leave Board Modal ====================
    const leaveBoardModal = document.getElementById('leaveBoardModal');
    const leaveBoardBtn = document.getElementById('leaveBoardBtn');

    function openLeaveBoardModal() {
        const boardName = document.getElementById('currentBoardName').textContent;
        document.getElementById('leaveBoardName').textContent = boardName;
        leaveBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLeaveBoardModal() {
        leaveBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (leaveBoardBtn) leaveBoardBtn.addEventListener('click', openLeaveBoardModal);
    document.getElementById('leaveBoardModalOverlay')?.addEventListener('click', closeLeaveBoardModal);
    document.getElementById('leaveBoardModalClose')?.addEventListener('click', closeLeaveBoardModal);
    document.getElementById('leaveBoardCancelBtn')?.addEventListener('click', closeLeaveBoardModal);

    document.getElementById('leaveBoardSubmitBtn')?.addEventListener('click', async () => {
        const submitBtn = document.getElementById('leaveBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Leaving...';

        try {
            await API.post(`/recruiting-board/shared/${currentBoardId}/leave`);
            closeLeaveBoardModal();

            // Refresh shared boards list
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];
            updateBoardSelector();

            // Switch back to personal board
            document.getElementById('boardTypeSelect').value = 'personal';
            await loadPersonalBoard(classYearSelect.value);

            showToast('You have left the board');
        } catch (error) {
            console.error('Error leaving board:', error);
            showToast(error.error || 'Failed to leave board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Leave Board';
        }
    });

    // ==================== Invite Collaborators Modal ====================
    const inviteCollaboratorsBtn = document.getElementById('inviteCollaboratorsBtn');
    const collabModal = document.getElementById('inviteCollaboratorsModal');
    const collabSearchInput = document.getElementById('collabSearchInput');
    const collabSearchResults = document.getElementById('collabSearchResults');
    const collaboratorsList = document.getElementById('collaboratorsList');
    const boardOwnerName = document.getElementById('boardOwnerName');
    const boardOwnerAvatar = document.getElementById('boardOwnerAvatar');
    const transferOwnershipSection = document.getElementById('transferOwnershipSection');
    const transferOwnershipSelect = document.getElementById('transferOwnershipSelect');
    const transferOwnershipBtn = document.getElementById('transferOwnershipBtn');

    let searchTimeout = null;
    let selectedCoachForInvite = null;
    let selectedCollabForRemoval = null;
    let selectedCollabForTransfer = null;
    let currentBoardData = null;

    function closeCollabModal() {
        collabModal.classList.remove('active');
        document.body.style.overflow = '';
        if (collabSearchInput) collabSearchInput.value = '';
        if (collabSearchResults) collabSearchResults.innerHTML = '';
    }

    async function openCollabModal() {
        collabModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (collabSearchInput) collabSearchInput.focus();

        await loadBoardInfoForModal();
    }

    async function loadBoardInfoForModal() {
        try {
            const boardData = await API.get(`/recruiting-board/shared/${currentBoardId}`);
            currentBoardData = boardData;

            // Update owner section
            const ownerName = boardData.owner_first_name && boardData.owner_last_name
                ? `${boardData.owner_first_name} ${boardData.owner_last_name}`
                : 'You';
            if (boardOwnerName) boardOwnerName.textContent = ownerName;

            if (boardOwnerAvatar && boardData.owner_profile_image) {
                boardOwnerAvatar.innerHTML = `<img src="${boardData.owner_profile_image}" alt="${ownerName}">`;
            }

            // Get pending invites
            const pendingRes = await API.get(`/recruiting-board/shared/${currentBoardId}/pending-invites`);

            renderCollaboratorsList(boardData.collaborators || [], pendingRes.pendingInvites || []);
            updateTransferOwnershipSection(boardData.collaborators || []);
        } catch (error) {
            console.error('Error loading board info for modal:', error);
        }
    }

    function renderCollaboratorsList(collaborators, pendingInvites) {
        if (!collaboratorsList) return;

        if (collaborators.length === 0 && pendingInvites.length === 0) {
            collaboratorsList.innerHTML = '<p class="no-collaborators">No collaborators added yet</p>';
            return;
        }

        let html = '';

        // Render pending invites first
        pendingInvites.forEach(invite => {
            const name = `${invite.first_name} ${invite.last_name}`;
            const avatarHtml = invite.profile_image_url
                ? `<img src="${invite.profile_image_url}" alt="${name}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

            html += `
                <div class="collaborator-item pending" data-user-id="${invite.related_user_id}">
                    <div class="collaborator-info">
                        <div class="collaborator-avatar">${avatarHtml}</div>
                        <span class="collaborator-name">${name}</span>
                        <span class="pending-badge">Pending</span>
                    </div>
                    <button class="btn-remove-collab" data-user-id="${invite.related_user_id}" data-is-pending="true" title="Cancel Invite">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
        });

        // Render accepted collaborators
        collaborators.forEach(collab => {
            const name = `${collab.first_name} ${collab.last_name}`;
            const avatarHtml = collab.profile_image_url
                ? `<img src="${collab.profile_image_url}" alt="${name}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

            html += `
                <div class="collaborator-item" data-user-id="${collab.user_id}">
                    <div class="collaborator-info">
                        <div class="collaborator-avatar">${avatarHtml}</div>
                        <span class="collaborator-name">${name}</span>
                    </div>
                    <button class="btn-remove-collab" data-user-id="${collab.user_id}" data-name="${name}" title="Remove Collaborator">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
        });

        collaboratorsList.innerHTML = html;

        collaboratorsList.querySelectorAll('.btn-remove-collab').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = this.dataset.userId;
                const isPending = this.dataset.isPending === 'true';
                const name = this.dataset.name || 'this person';

                if (isPending) {
                    cancelPendingInvite(userId);
                } else {
                    showRemoveCollabModal(userId, name);
                }
            });
        });
    }

    function updateTransferOwnershipSection(collaborators) {
        if (!transferOwnershipSection || !transferOwnershipSelect) return;

        if (collaborators.length === 0) {
            transferOwnershipSection.style.display = 'none';
            return;
        }

        transferOwnershipSection.style.display = 'block';

        transferOwnershipSelect.innerHTML = '<option value="">Select a collaborator...</option>';
        collaborators.forEach(collab => {
            const option = document.createElement('option');
            option.value = collab.user_id;
            option.textContent = `${collab.first_name} ${collab.last_name}`;
            transferOwnershipSelect.appendChild(option);
        });
    }

    async function searchCoaches(query) {
        if (!query || query.length < 2) {
            collabSearchResults.innerHTML = '';
            return;
        }

        try {
            const response = await API.get(`/recruiting-board/search-coaches?query=${encodeURIComponent(query)}&boardId=${currentBoardId}`);
            renderSearchResults(response.coaches || []);
        } catch (error) {
            console.error('Error searching coaches:', error);
            collabSearchResults.innerHTML = '<p class="search-error">Error searching coaches</p>';
        }
    }

    function renderSearchResults(coaches) {
        if (!collabSearchResults) return;

        if (coaches.length === 0) {
            collabSearchResults.innerHTML = '<p class="no-results" style="padding: 0.75rem; color: rgba(254, 252, 251, 0.5); font-size: 0.85rem;">No coaches found</p>';
            return;
        }

        let html = '';
        coaches.forEach(coach => {
            const name = `${coach.first_name} ${coach.last_name}`;
            const avatarHtml = coach.profile_image_url
                ? `<img src="${coach.profile_image_url}" alt="${name}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

            html += `
                <div class="collab-search-result-item" data-user-id="${coach.user_id}" data-name="${name}">
                    <div class="collab-result-info">
                        <div class="collab-result-avatar">${avatarHtml}</div>
                        <div class="collab-result-details">
                            <span class="collab-result-name">${name}</span>
                            <span class="collab-result-username">@${coach.username || 'coach'}${coach.team_name ? ` • ${coach.team_name}` : ''}</span>
                        </div>
                    </div>
                    <button class="btn-add-collab">Invite</button>
                </div>
            `;
        });

        collabSearchResults.innerHTML = html;

        collabSearchResults.querySelectorAll('.collab-search-result-item').forEach(item => {
            item.querySelector('.btn-add-collab').addEventListener('click', function(e) {
                e.stopPropagation();
                const userId = item.dataset.userId;
                const name = item.dataset.name;
                showInviteConfirmModal(userId, name);
            });
        });
    }

    // Invite confirm modal
    const inviteConfirmModal = document.getElementById('inviteConfirmModal');

    function showInviteConfirmModal(userId, name) {
        selectedCoachForInvite = { userId, name };
        document.getElementById('inviteConfirmCoachName').textContent = name;
        inviteConfirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeInviteConfirmModal() {
        inviteConfirmModal.classList.remove('active');
        document.body.style.overflow = 'hidden';
        selectedCoachForInvite = null;
    }

    async function sendInvite() {
        if (!selectedCoachForInvite) return;

        const submitBtn = document.getElementById('inviteConfirmSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            await API.post(`/recruiting-board/shared/${currentBoardId}/invite`, { inviteeUserId: selectedCoachForInvite.userId });

            closeInviteConfirmModal();
            collabSearchInput.value = '';
            collabSearchResults.innerHTML = '';

            await loadBoardInfoForModal();

            showToast('Invite sent successfully!');
        } catch (error) {
            console.error('Error sending invite:', error);
            showToast(error.error || 'Failed to send invite', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Invite';
        }
    }

    async function cancelPendingInvite(userId) {
        try {
            await API.delete(`/recruiting-board/shared/${currentBoardId}/invite/${userId}`);
            await loadBoardInfoForModal();
            showToast('Invite cancelled');
        } catch (error) {
            console.error('Error cancelling invite:', error);
            showToast('Failed to cancel invite', 'error');
        }
    }

    // Remove collab modal
    const removeCollabModal = document.getElementById('removeCollabModal');

    function showRemoveCollabModal(userId, name) {
        selectedCollabForRemoval = { userId, name };
        document.getElementById('removeCollabName').textContent = name;
        removeCollabModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeRemoveCollabModal() {
        removeCollabModal.classList.remove('active');
        document.body.style.overflow = 'hidden';
        selectedCollabForRemoval = null;
    }

    async function removeCollaborator() {
        if (!selectedCollabForRemoval) return;

        const submitBtn = document.getElementById('removeCollabSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Removing...';

        try {
            await API.delete(`/recruiting-board/shared/${currentBoardId}/collaborator/${selectedCollabForRemoval.userId}`);

            closeRemoveCollabModal();
            await loadBoardInfoForModal();

            showToast('Collaborator removed');
        } catch (error) {
            console.error('Error removing collaborator:', error);
            showToast(error.error || 'Failed to remove collaborator', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Remove';
        }
    }

    // Transfer ownership modal
    const transferConfirmModal = document.getElementById('transferConfirmModal');

    function showTransferConfirmModal() {
        const selectedUserId = transferOwnershipSelect.value;
        if (!selectedUserId) return;

        const selectedOption = transferOwnershipSelect.options[transferOwnershipSelect.selectedIndex];
        selectedCollabForTransfer = { userId: selectedUserId, name: selectedOption.textContent };

        document.getElementById('transferConfirmName').textContent = selectedOption.textContent;
        transferConfirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeTransferConfirmModal() {
        transferConfirmModal.classList.remove('active');
        document.body.style.overflow = 'hidden';
        selectedCollabForTransfer = null;
    }

    async function transferOwnership() {
        if (!selectedCollabForTransfer) return;

        const submitBtn = document.getElementById('transferConfirmSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Transferring...';

        try {
            await API.post(`/recruiting-board/shared/${currentBoardId}/transfer-ownership`, { newOwnerUserId: selectedCollabForTransfer.userId });

            closeTransferConfirmModal();
            closeCollabModal();

            // Refresh boards
            const sharedBoardsRes = await API.get('/recruiting-board/shared');
            ownedSharedBoards = sharedBoardsRes.ownedBoards || [];
            collaboratorBoards = sharedBoardsRes.collaboratorBoards || [];
            updateBoardSelector();

            // Reload current board
            await loadSharedBoard(currentBoardId, classYearSelect.value);

            showToast('Ownership transferred successfully');
        } catch (error) {
            console.error('Error transferring ownership:', error);
            showToast(error.error || 'Failed to transfer ownership', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Transfer Ownership';
        }
    }

    // Setup collaborators modal event listeners
    if (inviteCollaboratorsBtn) inviteCollaboratorsBtn.addEventListener('click', openCollabModal);
    document.getElementById('inviteCollaboratorsModalOverlay')?.addEventListener('click', closeCollabModal);
    document.getElementById('inviteCollaboratorsModalClose')?.addEventListener('click', closeCollabModal);
    document.getElementById('inviteCollaboratorsCancelBtn')?.addEventListener('click', closeCollabModal);

    if (collabSearchInput) {
        collabSearchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchCoaches(this.value), 300);
        });
    }

    document.getElementById('inviteConfirmModalOverlay')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmModalClose')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmCancelBtn')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmSubmitBtn')?.addEventListener('click', sendInvite);

    document.getElementById('removeCollabModalOverlay')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabModalClose')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabCancelBtn')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabSubmitBtn')?.addEventListener('click', removeCollaborator);

    if (transferOwnershipSelect) {
        transferOwnershipSelect.addEventListener('change', function() {
            if (transferOwnershipBtn) {
                transferOwnershipBtn.disabled = !this.value;
            }
        });
    }
    if (transferOwnershipBtn) transferOwnershipBtn.addEventListener('click', showTransferConfirmModal);
    document.getElementById('transferConfirmModalOverlay')?.addEventListener('click', closeTransferConfirmModal);
    document.getElementById('transferConfirmModalClose')?.addEventListener('click', closeTransferConfirmModal);
    document.getElementById('transferConfirmCancelBtn')?.addEventListener('click', closeTransferConfirmModal);
    document.getElementById('transferConfirmSubmitBtn')?.addEventListener('click', transferOwnership);

    // ==================== Board Selector Change Handler ====================
    const boardTypeSelect = document.getElementById('boardTypeSelect');

    if (boardTypeSelect) {
        boardTypeSelect.addEventListener('change', async function() {
            const selectedValue = this.value;
            positionsLoaded = false; // Reset to reload positions for new board

            // Save selected board to localStorage
            localStorage.setItem('lastViewedRecruitingBoard', selectedValue);

            if (selectedValue === 'personal') {
                await loadPersonalBoard(classYearSelect.value);
            } else {
                await loadSharedBoard(selectedValue, classYearSelect.value);
            }
        });
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
            if (currentBoardType === 'personal') {
                await API.put('/recruiting-board/personal/config', config);
            } else {
                await API.put(`/recruiting-board/shared/${currentBoardId}/config`, config);
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

    // ==================== Class Year Change ====================
    classYearSelect.addEventListener('change', function() {
        localStorage.setItem('lastViewedRecruitingBoardClassYear', this.value);
        loadPlayersForBoard(this.value);
    });

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
            const classYear = classYearSelect.value;
            if (currentBoardType === 'personal') {
                await API.put(`/recruiting-board/personal/${classYear}/players/${playerId}/position`, {
                    oldPosition: oldPosition,
                    newPosition: newPosition
                });
            } else {
                await API.put(`/recruiting-board/shared/${currentBoardId}/${classYear}/players/${playerId}/position`, {
                    oldPosition: oldPosition,
                    newPosition: newPosition
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

    // ==================== Initialize ====================
    initializeBoards();

});
