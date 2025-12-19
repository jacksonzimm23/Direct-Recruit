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
    let positionsLoaded = false; // Track if positions have been rendered

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

    // Load shared position configuration (only called once on page load)
    async function loadPositionConfig() {
        try {
            const configData = await API.get('/recruiting-board/config');
            renderBoard(configData.offensePositions || DEFAULT_OFFENSE_POSITIONS,
                       configData.defensePositions || DEFAULT_DEFENSE_POSITIONS);
            positionsLoaded = true;
        } catch (error) {
            console.error('Error loading position config:', error);
            // Use defaults on error
            renderBoard(DEFAULT_OFFENSE_POSITIONS, DEFAULT_DEFENSE_POSITIONS);
            positionsLoaded = true;
        }
    }

    // Load players for a specific class year (called when switching years)
    async function loadPlayersForYear(classYear) {
        try {
            // Clear existing players from all lists
            document.querySelectorAll('.recruits-list').forEach(list => {
                list.innerHTML = '';
            });

            const playersData = await API.get(`/recruiting-board/${classYear}/players`);
            loadPlayersIntoBoard(playersData || []);
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    // Load board configuration for a specific year
    async function loadBoardConfiguration(classYear) {
        if (!positionsLoaded) {
            // First load - get positions and players
            await loadPositionConfig();
        }
        // Load players for the selected year
        await loadPlayersForYear(classYear);
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

        // Build info lines based on player type
        // Height • Weight on one line
        // HS Player: high_school, state
        // Transfer Player: high_school • college_division
        const nameLine = `${player.first_name} ${player.last_name}`;
        const physicalLine = [heightDisplay, player.weight ? `${player.weight} lbs` : ''].filter(Boolean).join(' • ');

        let locationLine = '';
        if (isTransfer) {
            locationLine = [player.high_school, player.college_division].filter(Boolean).join(' • ');
        } else {
            locationLine = [player.high_school, player.state].filter(Boolean).join(', ');
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
            // Don't show menu if card is being dragged
            if (!card.classList.contains('dragging')) {
                e.stopPropagation();
                showPlayerContextMenu(card, player);
            }
        });

        return card;
    }

    // Show context menu for player card
    function showPlayerContextMenu(card, player) {
        // Remove any existing context menu
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
            <button class="context-menu-item delete-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Remove from Board
            </button>
        `;

        // Position the menu
        const cardRect = card.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${cardRect.bottom + 5}px`;
        menu.style.left = `${cardRect.left}px`;
        menu.style.zIndex = '1000';

        document.body.appendChild(menu);

        // View profile handler
        menu.querySelector('.view-profile-btn').addEventListener('click', () => {
            menu.remove();
            const username = player.username;
            if (username) {
                const folder = player.player_type === 'transfer' ? 'transferplayer' : 'hsplayer';
                window.location.href = `/frontend/${folder}/tabs/my-profile.html?username=${username}&from=recruiting`;
            }
        });

        // Delete handler
        menu.querySelector('.delete-btn').addEventListener('click', () => {
            menu.remove();
            showRemoveConfirmModal(player, card);
        });

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !card.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    // Track current card being removed
    let cardToRemove = null;

    // Setup remove modal elements
    const removeModal = document.getElementById('removeRecruitingBoardModal');
    const removeModalOverlay = document.getElementById('removeRecruitingBoardModalOverlay');
    const removeModalClose = document.getElementById('removeRecruitingBoardModalClose');
    const removeModalCancel = document.getElementById('removeRecruitingBoardCancelBtn');
    const removeModalSubmit = document.getElementById('removeRecruitingBoardSubmitBtn');
    const removeConfirmText = document.getElementById('removeConfirmText');
    const removeBoardInfo = document.getElementById('removeBoardInfo');

    // Close modal function
    function closeRemoveModal() {
        removeModal.classList.remove('active');
        document.body.style.overflow = '';
        cardToRemove = null;
    }

    // Setup modal close handlers
    if (removeModalOverlay) removeModalOverlay.addEventListener('click', closeRemoveModal);
    if (removeModalClose) removeModalClose.addEventListener('click', closeRemoveModal);
    if (removeModalCancel) removeModalCancel.addEventListener('click', closeRemoveModal);

    // Setup submit handler
    if (removeModalSubmit) {
        removeModalSubmit.addEventListener('click', async () => {
            if (!cardToRemove) return;

            removeModalSubmit.disabled = true;
            removeModalSubmit.textContent = 'Removing...';

            try {
                const playerId = cardToRemove.dataset.playerId;
                const position = cardToRemove.dataset.position;
                await API.delete(`/recruiting-board/${classYearSelect.value}/players/${playerId}?position=${position}`);
                cardToRemove.remove();
                // Update rankings
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

    // Show confirmation modal for removing a player
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

    // ==================== Collaborator System ====================
    const collabModal = document.getElementById('inviteCollaboratorsModal');
    const collabModalOverlay = document.getElementById('inviteCollaboratorsModalOverlay');
    const collabModalClose = document.getElementById('inviteCollaboratorsModalClose');
    const collabModalCancel = document.getElementById('inviteCollaboratorsCancelBtn');
    const collabSearchInput = document.getElementById('collabSearchInput');
    const collabSearchResults = document.getElementById('collabSearchResults');
    const collaboratorsList = document.getElementById('collaboratorsList');
    const inviteCollaboratorsBtn = document.getElementById('inviteCollaboratorsBtn');
    const boardOwnerName = document.getElementById('boardOwnerName');
    const boardOwnerAvatar = document.getElementById('boardOwnerAvatar');
    const transferOwnershipSection = document.getElementById('transferOwnershipSection');
    const transferOwnershipSelect = document.getElementById('transferOwnershipSelect');
    const transferOwnershipBtn = document.getElementById('transferOwnershipBtn');

    // Board selector elements
    const boardTypeSelect = document.getElementById('boardTypeSelect');
    const boardTypeContainer = document.getElementById('boardTypeContainer');
    const leaveBoardBtn = document.getElementById('leaveBoardBtn');

    // Confirmation modals
    const inviteConfirmModal = document.getElementById('inviteConfirmModal');
    const removeCollabModal = document.getElementById('removeCollabModal');
    const leaveBoardModal = document.getElementById('leaveBoardModal');
    const transferConfirmModal = document.getElementById('transferConfirmModal');

    // Track board state
    let currentBoardInfo = null;
    let sharedBoards = [];
    let currentBoardOwner = null; // The owner of the currently viewed board
    let searchTimeout = null;
    let selectedCoachForInvite = null;
    let selectedCollabForRemoval = null;
    let selectedCollabForTransfer = null;

    // Polling interval for real-time sync
    let pollInterval = null;

    // Initialize collaborator system
    async function initCollaboratorSystem() {
        try {
            // Load board info and shared boards
            const [boardInfoRes, sharedBoardsRes] = await Promise.all([
                API.get('/recruiting-board/board-info'),
                API.get('/recruiting-board/shared-boards')
            ]);

            currentBoardInfo = boardInfoRes;
            sharedBoards = sharedBoardsRes.sharedBoards || [];

            // Update board selector dropdown
            updateBoardSelector();

            // Update UI based on ownership
            updateOwnershipUI();

            // Start polling for real-time sync
            startPolling();
        } catch (error) {
            console.error('Error initializing collaborator system:', error);
        }
    }

    // Update the board selector dropdown
    function updateBoardSelector() {
        // Clear existing shared board options
        const options = boardTypeSelect.querySelectorAll('option:not([value="own"])');
        options.forEach(opt => opt.remove());

        // Add shared boards
        sharedBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.owner_user_id;
            option.textContent = `${board.owner_first_name} ${board.owner_last_name}'s Board`;
            boardTypeSelect.appendChild(option);
        });

        // Always show the dropdown (removed the hide logic)
        boardTypeContainer.classList.remove('hidden');
    }

    // Update UI based on whether user is owner or collaborator
    function updateOwnershipUI() {
        const isOwner = currentBoardInfo && currentBoardInfo.isOwner;
        const isViewingSharedBoard = boardTypeSelect.value !== 'own';

        // Show/hide invite button (only for owner viewing their own board)
        if (inviteCollaboratorsBtn) {
            inviteCollaboratorsBtn.style.display = isOwner && !isViewingSharedBoard ? 'flex' : 'none';
        }

        // Show/hide leave button (only when viewing a shared board)
        if (leaveBoardBtn) {
            leaveBoardBtn.style.display = isViewingSharedBoard ? 'flex' : 'none';
        }
    }

    // Handle board type change
    if (boardTypeSelect) {
        boardTypeSelect.addEventListener('change', async function() {
            const selectedValue = this.value;

            if (selectedValue === 'own') {
                // Switch back to own board
                currentBoardOwner = null;
                updateOwnershipUI();
                await loadBoardConfiguration(classYearSelect.value);
            } else {
                // Switch to shared board
                currentBoardOwner = selectedValue;
                updateOwnershipUI();
                // Load the shared board's configuration and players
                await loadSharedBoardConfiguration(selectedValue, classYearSelect.value);
            }
        });
    }

    // Load a shared board's configuration
    async function loadSharedBoardConfiguration(ownerUserId, classYear) {
        try {
            // For shared boards, we need to load from the owner's board
            // The API will need to be enhanced to support this
            // For now, we'll use the same endpoints but pass the owner context

            // Clear existing players
            document.querySelectorAll('.recruits-list').forEach(list => {
                list.innerHTML = '';
            });

            // Load players (API needs to support loading by owner)
            const playersData = await API.get(`/recruiting-board/${classYear}/players?owner=${ownerUserId}`);
            loadPlayersIntoBoard(playersData || []);
        } catch (error) {
            console.error('Error loading shared board:', error);
        }
    }

    // Close collab modal
    function closeCollabModal() {
        collabModal.classList.remove('active');
        document.body.style.overflow = '';
        if (collabSearchInput) collabSearchInput.value = '';
        if (collabSearchResults) collabSearchResults.innerHTML = '';
    }

    // Open collab modal
    async function openCollabModal() {
        collabModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (collabSearchInput) collabSearchInput.focus();

        // Load fresh board info
        await loadBoardInfoForModal();
    }

    // Load board info for the modal
    async function loadBoardInfoForModal() {
        try {
            const boardInfo = await API.get('/recruiting-board/board-info');
            currentBoardInfo = boardInfo;

            // Update owner section
            const ownerName = boardInfo.owner_first_name && boardInfo.owner_last_name
                ? `${boardInfo.owner_first_name} ${boardInfo.owner_last_name}`
                : 'You';
            if (boardOwnerName) boardOwnerName.textContent = ownerName;

            // Update owner avatar if profile image exists
            if (boardOwnerAvatar && boardInfo.owner_profile_image) {
                boardOwnerAvatar.innerHTML = `<img src="${boardInfo.owner_profile_image}" alt="${ownerName}">`;
            }

            // Render collaborators and pending invites
            renderCollaboratorsList(boardInfo.collaborators || [], boardInfo.pendingInvites || []);

            // Update transfer ownership section
            updateTransferOwnershipSection(boardInfo.collaborators || []);
        } catch (error) {
            console.error('Error loading board info for modal:', error);
        }
    }

    // Render collaborators list with pending invites
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

        // Add event listeners to remove buttons
        collaboratorsList.querySelectorAll('.btn-remove-collab').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = this.dataset.userId;
                const isPending = this.dataset.isPending === 'true';
                const name = this.dataset.name || 'this person';

                if (isPending) {
                    // Cancel pending invite
                    cancelPendingInvite(userId);
                } else {
                    // Show remove confirmation modal
                    showRemoveCollabModal(userId, name);
                }
            });
        });
    }

    // Update transfer ownership section
    function updateTransferOwnershipSection(collaborators) {
        if (!transferOwnershipSection || !transferOwnershipSelect) return;

        if (collaborators.length === 0) {
            transferOwnershipSection.style.display = 'none';
            return;
        }

        transferOwnershipSection.style.display = 'block';

        // Clear and populate select
        transferOwnershipSelect.innerHTML = '<option value="">Select a collaborator...</option>';
        collaborators.forEach(collab => {
            const option = document.createElement('option');
            option.value = collab.user_id;
            option.textContent = `${collab.first_name} ${collab.last_name}`;
            transferOwnershipSelect.appendChild(option);
        });
    }

    // Search for coaches
    async function searchCoaches(query) {
        if (!query || query.length < 2) {
            collabSearchResults.innerHTML = '';
            return;
        }

        try {
            const response = await API.get(`/recruiting-board/search-coaches?query=${encodeURIComponent(query)}`);
            renderSearchResults(response.coaches || []);
        } catch (error) {
            console.error('Error searching coaches:', error);
            collabSearchResults.innerHTML = '<p class="search-error">Error searching coaches</p>';
        }
    }

    // Render search results
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
                            <span class="collab-result-username">@${coach.username || 'coach'}${coach.college_name ? ` • ${coach.college_name}` : ''}</span>
                        </div>
                    </div>
                    <button class="btn-add-collab">Invite</button>
                </div>
            `;
        });

        collabSearchResults.innerHTML = html;

        // Add click handlers
        collabSearchResults.querySelectorAll('.collab-search-result-item').forEach(item => {
            item.querySelector('.btn-add-collab').addEventListener('click', function(e) {
                e.stopPropagation();
                const userId = item.dataset.userId;
                const name = item.dataset.name;
                showInviteConfirmModal(userId, name);
            });
        });
    }

    // Show invite confirmation modal
    function showInviteConfirmModal(userId, name) {
        selectedCoachForInvite = { userId, name };
        document.getElementById('inviteConfirmCoachName').textContent = name;
        inviteConfirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close invite confirm modal
    function closeInviteConfirmModal() {
        inviteConfirmModal.classList.remove('active');
        document.body.style.overflow = 'hidden'; // Keep hidden because collab modal is still open
        selectedCoachForInvite = null;
    }

    // Send invite
    async function sendInvite() {
        if (!selectedCoachForInvite) return;

        const submitBtn = document.getElementById('inviteConfirmSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            await API.post('/recruiting-board/invite', { inviteeUserId: selectedCoachForInvite.userId });

            closeInviteConfirmModal();
            collabSearchInput.value = '';
            collabSearchResults.innerHTML = '';

            // Refresh the collaborators list
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

    // Cancel pending invite
    async function cancelPendingInvite(userId) {
        try {
            await API.delete(`/recruiting-board/invite/${userId}`);
            await loadBoardInfoForModal();
            showToast('Invite cancelled');
        } catch (error) {
            console.error('Error cancelling invite:', error);
            showToast('Failed to cancel invite', 'error');
        }
    }

    // Show remove collaborator modal
    function showRemoveCollabModal(userId, name) {
        selectedCollabForRemoval = { userId, name };
        document.getElementById('removeCollabName').textContent = name;
        removeCollabModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close remove collab modal
    function closeRemoveCollabModal() {
        removeCollabModal.classList.remove('active');
        document.body.style.overflow = 'hidden'; // Keep hidden because collab modal is still open
        selectedCollabForRemoval = null;
    }

    // Remove collaborator
    async function removeCollaborator() {
        if (!selectedCollabForRemoval) return;

        const submitBtn = document.getElementById('removeCollabSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Removing...';

        try {
            await API.delete(`/recruiting-board/collaborator/${selectedCollabForRemoval.userId}`);

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

    // Show leave board modal
    function showLeaveBoardModal() {
        const selectedBoard = sharedBoards.find(b => b.owner_user_id === boardTypeSelect.value);
        if (selectedBoard) {
            document.getElementById('leaveBoardOwnerName').textContent =
                `${selectedBoard.owner_first_name} ${selectedBoard.owner_last_name}'s Board`;
        }
        leaveBoardModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close leave board modal
    function closeLeaveBoardModal() {
        leaveBoardModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Leave board
    async function leaveBoard() {
        const ownerUserId = boardTypeSelect.value;
        if (!ownerUserId || ownerUserId === 'own') return;

        const submitBtn = document.getElementById('leaveBoardSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Leaving...';

        try {
            await API.post('/recruiting-board/leave', { ownerUserId });

            closeLeaveBoardModal();

            // Switch back to own board
            boardTypeSelect.value = 'own';
            currentBoardOwner = null;

            // Refresh shared boards list
            const sharedBoardsRes = await API.get('/recruiting-board/shared-boards');
            sharedBoards = sharedBoardsRes.sharedBoards || [];
            updateBoardSelector();
            updateOwnershipUI();

            // Reload own board
            await loadBoardConfiguration(classYearSelect.value);

            showToast('You have left the board');
        } catch (error) {
            console.error('Error leaving board:', error);
            showToast('Failed to leave board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Leave Board';
        }
    }

    // Show transfer ownership modal
    function showTransferConfirmModal() {
        const selectedUserId = transferOwnershipSelect.value;
        if (!selectedUserId) return;

        const selectedOption = transferOwnershipSelect.options[transferOwnershipSelect.selectedIndex];
        selectedCollabForTransfer = { userId: selectedUserId, name: selectedOption.textContent };

        document.getElementById('transferConfirmName').textContent = selectedOption.textContent;
        transferConfirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close transfer confirm modal
    function closeTransferConfirmModal() {
        transferConfirmModal.classList.remove('active');
        document.body.style.overflow = 'hidden'; // Keep hidden because collab modal is still open
        selectedCollabForTransfer = null;
    }

    // Transfer ownership
    async function transferOwnership() {
        if (!selectedCollabForTransfer) return;

        const submitBtn = document.getElementById('transferConfirmSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Transferring...';

        try {
            await API.post('/recruiting-board/transfer-ownership', { newOwnerUserId: selectedCollabForTransfer.userId });

            closeTransferConfirmModal();
            closeCollabModal();

            // Refresh everything
            await initCollaboratorSystem();
            await loadBoardConfiguration(classYearSelect.value);

            showToast('Ownership transferred successfully');
        } catch (error) {
            console.error('Error transferring ownership:', error);
            showToast(error.error || 'Failed to transfer ownership', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Transfer Ownership';
        }
    }

    // Start polling for real-time sync
    function startPolling() {
        // Poll every 60 seconds
        pollInterval = setInterval(async () => {
            try {
                // Reload current board data
                if (currentBoardOwner) {
                    await loadSharedBoardConfiguration(currentBoardOwner, classYearSelect.value);
                } else {
                    await loadPlayersForYear(classYearSelect.value);
                }

                // Refresh shared boards list
                const sharedBoardsRes = await API.get('/recruiting-board/shared-boards');
                sharedBoards = sharedBoardsRes.sharedBoards || [];
                updateBoardSelector();
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 60000); // 60 seconds
    }

    // Stop polling
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // Toast notification helper
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

        // Add animation keyframes if not present
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

    // Setup collaborators modal event listeners
    if (inviteCollaboratorsBtn) inviteCollaboratorsBtn.addEventListener('click', openCollabModal);
    if (collabModalOverlay) collabModalOverlay.addEventListener('click', closeCollabModal);
    if (collabModalClose) collabModalClose.addEventListener('click', closeCollabModal);
    if (collabModalCancel) collabModalCancel.addEventListener('click', closeCollabModal);

    // Search input debounce
    if (collabSearchInput) {
        collabSearchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchCoaches(this.value), 300);
        });
    }

    // Invite confirm modal listeners
    document.getElementById('inviteConfirmModalOverlay')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmModalClose')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmCancelBtn')?.addEventListener('click', closeInviteConfirmModal);
    document.getElementById('inviteConfirmSubmitBtn')?.addEventListener('click', sendInvite);

    // Remove collab modal listeners
    document.getElementById('removeCollabModalOverlay')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabModalClose')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabCancelBtn')?.addEventListener('click', closeRemoveCollabModal);
    document.getElementById('removeCollabSubmitBtn')?.addEventListener('click', removeCollaborator);

    // Leave board modal listeners
    if (leaveBoardBtn) leaveBoardBtn.addEventListener('click', showLeaveBoardModal);
    document.getElementById('leaveBoardModalOverlay')?.addEventListener('click', closeLeaveBoardModal);
    document.getElementById('leaveBoardModalClose')?.addEventListener('click', closeLeaveBoardModal);
    document.getElementById('leaveBoardCancelBtn')?.addEventListener('click', closeLeaveBoardModal);
    document.getElementById('leaveBoardSubmitBtn')?.addEventListener('click', leaveBoard);

    // Transfer ownership listeners
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

    // Initialize collaborator system
    initCollaboratorSystem();

    // Cleanup on page unload
    window.addEventListener('beforeunload', stopPolling);

    // Render the board based on configuration
    function renderBoard(offensePositions, defensePositions) {
        const offenseField = document.getElementById('offenseField');
        const defenseField = document.getElementById('defenseField');

        // Clear existing content
        offenseField.innerHTML = '';
        defenseField.innerHTML = '';

        // Render offense positions
        offensePositions.forEach(groupConfig => {
            const group = document.createElement('div');
            group.className = `position-group ${groupConfig.group}`;

            groupConfig.positions.forEach(pos => {
                const slot = createPositionSlotFromConfig(pos);
                group.appendChild(slot);
            });

            offenseField.appendChild(group);
        });

        // Render defense positions
        defensePositions.forEach(groupConfig => {
            const group = document.createElement('div');
            group.className = `position-group ${groupConfig.group}`;

            groupConfig.positions.forEach(pos => {
                const slot = createPositionSlotFromConfig(pos);
                group.appendChild(slot);
            });

            defenseField.appendChild(group);
        });

        // Re-initialize drag and drop for all lists
        document.querySelectorAll('.recruits-list').forEach(list => {
            initDragDropForList(list);
        });

        // Initialize column drag-drop after rendering
        setTimeout(initAllColumnDragDrop, 100);
    }

    // Column drag-drop helper - defined early so it's available
    function initAllColumnDragDrop() {
        document.querySelectorAll('.position-slot').forEach(slot => {
            slot.classList.add('draggable');
            slot.draggable = true;
            // Remove existing listeners to avoid duplicates
            slot.removeEventListener('dragstart', handleColumnDragStart);
            slot.removeEventListener('dragend', handleColumnDragEnd);
            slot.removeEventListener('dragover', handleColumnDragOver);
            slot.removeEventListener('dragenter', handleColumnDragEnter);
            slot.removeEventListener('dragleave', handleColumnDragLeave);
            slot.removeEventListener('drop', handleColumnDrop);
            // Add fresh listeners
            slot.addEventListener('dragstart', handleColumnDragStart);
            slot.addEventListener('dragend', handleColumnDragEnd);
            slot.addEventListener('dragover', handleColumnDragOver);
            slot.addEventListener('dragenter', handleColumnDragEnter);
            slot.addEventListener('dragleave', handleColumnDragLeave);
            slot.addEventListener('drop', handleColumnDrop);
        });
    }

    // Column drag handlers - defined early
    let draggedColumn = null;
    let columnSourceGroup = null;

    function handleColumnDragStart(e) {
        // Don't start drag if we're clicking on the input or a recruit card
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

    // Create position slot from config
    function createPositionSlotFromConfig(positionName) {
        const slot = document.createElement('div');
        slot.className = 'position-slot';
        slot.dataset.position = positionName;

        slot.innerHTML = `
            <input type="text" class="position-label-input" value="${positionName}" maxlength="10" placeholder="Position">
            <div class="recruits-list" data-position="${positionName}"></div>
        `;

        const input = slot.querySelector('.position-label-input');

        // Update on change
        input.addEventListener('change', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        // Save on blur (when clicking out of input)
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

    // Get current board configuration from DOM
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

    // Save board configuration (saves to shared config, applies to all class years)
    async function saveBoardConfiguration() {
        const config = getBoardConfiguration();

        try {
            await API.put('/recruiting-board/config', config);
            hasUnsavedChanges = false;
            console.log('Board configuration saved (applies to all class years)');
        } catch (error) {
            console.error('Error saving board configuration:', error);
        }
    }

    // Schedule save with debounce
    function scheduleSave() {
        hasUnsavedChanges = true;
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(saveBoardConfiguration, 500);
    }

    // Handle class year change
    classYearSelect.addEventListener('change', function() {
        const selectedYear = this.value;
        console.log(`Selected recruiting class: ${selectedYear}`);
        loadBoardConfiguration(selectedYear);
    });

    // Load initial board configuration
    loadBoardConfiguration(classYearSelect.value);

    // Toggle between offense and defense
    const offenseBtn = document.getElementById('offenseBtn');
    const defenseBtn = document.getElementById('defenseBtn');
    const offenseField = document.getElementById('offenseField');
    const defenseField = document.getElementById('defenseField');

    offenseBtn.addEventListener('click', () => {
        offenseBtn.classList.add('active');
        defenseBtn.classList.remove('active');
        offenseField.classList.remove('hidden');
        defenseField.classList.add('hidden');
        // Exit remove mode when switching tabs
        exitRemoveMode();
    });

    defenseBtn.addEventListener('click', () => {
        defenseBtn.classList.add('active');
        offenseBtn.classList.remove('active');
        defenseField.classList.remove('hidden');
        offenseField.classList.add('hidden');
        // Exit remove mode when switching tabs
        exitRemoveMode();
    });

    // Position management
    const addPositionBtn = document.getElementById('addPositionBtn');
    const removePositionBtn = document.getElementById('removePositionBtn');
    const removeModeIndicator = document.getElementById('removeModeIndicator');
    let isRemoveMode = false;
    let positionCounter = 0; // For generating unique IDs

    // Get current active field
    function getActiveField() {
        return offenseField.classList.contains('hidden') ? defenseField : offenseField;
    }

    // Create a new position slot (for adding new positions)
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

        // Add event listener to the input for updating data-position
        const input = slot.querySelector('.position-label-input');
        input.addEventListener('change', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        // Save on blur
        input.addEventListener('blur', function() {
            const newValue = this.value.toUpperCase().trim() || 'NEW';
            this.value = newValue;
            slot.dataset.position = newValue;
            slot.querySelector('.recruits-list').dataset.position = newValue;
            scheduleSave();
        });

        // Select all text when focused
        input.addEventListener('focus', function() {
            this.select();
        });

        // If in remove mode, add remove-mode class and click listener
        if (isRemoveMode) {
            slot.classList.add('remove-mode');
            slot.addEventListener('click', handlePositionRemove);
        }

        return slot;
    }

    // Add position button click handler
    addPositionBtn.addEventListener('click', function() {
        const activeField = getActiveField();

        // Get the last position group or create one if none exists
        let lastGroup = activeField.querySelector('.position-group:last-child');

        if (!lastGroup) {
            lastGroup = document.createElement('div');
            lastGroup.className = 'position-group custom-group';
            activeField.appendChild(lastGroup);
        }

        // Create and add new position slot
        const newSlot = createPositionSlot('NEW');
        lastGroup.appendChild(newSlot);

        // Focus the input for immediate editing
        const input = newSlot.querySelector('.position-label-input');
        input.focus();
        input.select();

        // Initialize drag and drop for the new recruits list
        initDragDropForList(newSlot.querySelector('.recruits-list'));

        // Save after adding position
        scheduleSave();
    });

    // Handle position removal
    function handlePositionRemove(e) {
        e.stopPropagation();
        const slot = e.currentTarget;

        // Confirm removal if there are recruits
        const recruitsList = slot.querySelector('.recruits-list');
        const hasRecruits = recruitsList && recruitsList.children.length > 0;

        if (hasRecruits) {
            if (!confirm('This position has recruits. Are you sure you want to remove it?')) {
                return;
            }
        }

        // Remove the slot
        slot.remove();

        // Check if parent group is empty and remove it
        const groups = document.querySelectorAll('.position-group');
        groups.forEach(group => {
            if (group.children.length === 0) {
                group.remove();
            }
        });

        // Save after removing position
        scheduleSave();
    }

    // Enter remove mode
    function enterRemoveMode() {
        isRemoveMode = true;
        removePositionBtn.classList.add('active');
        removeModeIndicator.classList.remove('hidden');

        // Add remove-mode class and click listeners to all position slots in active field
        const activeField = getActiveField();
        const slots = activeField.querySelectorAll('.position-slot');
        slots.forEach(slot => {
            slot.classList.add('remove-mode');
            slot.addEventListener('click', handlePositionRemove);
        });
    }

    // Exit remove mode
    function exitRemoveMode() {
        isRemoveMode = false;
        removePositionBtn.classList.remove('active');
        removeModeIndicator.classList.add('hidden');

        // Remove remove-mode class and click listeners from all position slots
        const allSlots = document.querySelectorAll('.position-slot');
        allSlots.forEach(slot => {
            slot.classList.remove('remove-mode');
            slot.removeEventListener('click', handlePositionRemove);
        });
    }

    // Remove position button click handler
    removePositionBtn.addEventListener('click', function() {
        if (isRemoveMode) {
            exitRemoveMode();
        } else {
            enterRemoveMode();
        }
    });

    // Drag and drop functionality
    let draggedElement = null;
    let sourceContainer = null;

    function initDragDropForList(list) {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('drop', handleDrop);
        list.addEventListener('dragenter', handleDragEnter);
        list.addEventListener('dragleave', handleDragLeave);
    }

    function handleDragStart(e) {
        // Prevent column drag from triggering when dragging cards
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

    // Global cleanup function to ensure drag state is always reset
    function cleanupDragState() {
        // Remove dragging class from all recruit cards
        document.querySelectorAll('.recruit-card.dragging').forEach(card => {
            card.classList.remove('dragging');
        });

        // Remove drag-over class from all lists
        document.querySelectorAll('.recruits-list').forEach(list => {
            list.classList.remove('drag-over');
        });

        draggedElement = null;
        sourceContainer = null;
    }

    // Add document-level listener to catch drops outside valid targets
    // This ensures cleanup happens even if dragend doesn't fire properly
    document.addEventListener('dragend', cleanupDragState);
    document.addEventListener('drop', function(e) {
        // If drop happens outside a valid target, still cleanup
        if (!e.target.closest('.recruits-list')) {
            cleanupDragState();
        }
    });

    // Also add mouseup as a fallback cleanup
    document.addEventListener('mouseup', function() {
        // Small delay to let dragend fire first
        setTimeout(cleanupDragState, 100);
    });

    function handleDragOver(e) {
        // Only allow if we have a dragged element (player card being dragged)
        if (!draggedElement) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        // Highlight any recruits-list when dragging a player card
        if (draggedElement) {
            this.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        // Only remove class if we're actually leaving the container
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

        // Move the element
        if (afterElement == null) {
            this.appendChild(draggedElement);
        } else {
            this.insertBefore(draggedElement, afterElement);
        }

        // Update the player's position data if moved to different position
        if (targetPosition !== sourcePosition) {
            draggedElement.dataset.position = targetPosition;
            // Save the position change to backend
            updatePlayerPosition(playerId, sourcePosition, targetPosition);
        }

        // Update rankings for both source and target containers
        updateRankings(this);
        if (sourceContainer !== this) {
            updateRankings(sourceContainer);
        }

        return false;
    }

    // Update player position in the database when dragged to a new position column
    async function updatePlayerPosition(playerId, oldPosition, newPosition) {
        try {
            const classYear = classYearSelect.value;
            await API.put(`/recruiting-board/${classYear}/players/${playerId}/position`, {
                oldPosition: oldPosition,
                newPosition: newPosition
            });
            console.log(`Player ${playerId} moved from ${oldPosition} to ${newPosition}`);
        } catch (error) {
            console.error('Error updating player position:', error);
            // Optionally show a toast or reload the board on error
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

});
