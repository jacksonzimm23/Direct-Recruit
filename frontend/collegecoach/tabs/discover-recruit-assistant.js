// Discover Page — Recruiting Assistant AI Tab + Subtab Switching

document.addEventListener('DOMContentLoaded', function() {

    // ========================
    // SUBTAB SWITCHING
    // ========================

    const subtabs = document.querySelectorAll('.dp-subtab');
    const tabContents = {
        'find-players': document.getElementById('findPlayersTab'),
        'recruit-assistant': document.getElementById('recruitAssistantTab')
    };

    subtabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active subtab
            subtabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide tab content
            const mainContent = document.querySelector('.main-content');
            Object.entries(tabContents).forEach(([key, content]) => {
                if (content) {
                    if (key === targetTab) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                }
            });
            // Constrain main-content when RA is active to prevent gap below
            if (mainContent) {
                if (targetTab === 'recruit-assistant') {
                    mainContent.classList.add('ra-active');
                } else {
                    mainContent.classList.remove('ra-active');
                }
            }

            // Save active tab to sessionStorage
            sessionStorage.setItem('dpActiveTab', targetTab);
        });
    });

    // Restore active tab from sessionStorage
    const savedTab = sessionStorage.getItem('dpActiveTab');
    if (savedTab && tabContents[savedTab]) {
        const targetBtn = document.querySelector(`.dp-subtab[data-tab="${savedTab}"]`);
        if (targetBtn) targetBtn.click();
    }

    // ========================
    // RECRUITING ASSISTANT CHAT
    // ========================

    const messagesContainer = document.getElementById('raMessages');
    const welcome = document.getElementById('raWelcome');
    const input = document.getElementById('raInput');
    const sendBtn = document.getElementById('raSendBtn');
    const historyList = document.getElementById('raHistoryList');
    const newChatBtn = document.getElementById('raNewChatBtn');
    const suggestions = document.querySelectorAll('#recruitAssistantTab .ra-suggestion');

    if (!messagesContainer || !input) return;

    // Preload school logos for transfer player display
    if (typeof ensureSchoolLogosLoaded === 'function') {
        ensureSchoolLogosLoaded('../../assets');
    }

    let chats = [];
    let activeChatId = null;
    let isSending = false;
    let lastSearchFilters = null;
    let currentSearchOffset = 0;

    const SHOW_MORE_PATTERN = /^(show\s*(me\s*)?more|more\s*players?|next\s*(5|players?|results?|batch)?|load\s*more|keep\s*going|any\s*more|see\s*more)/i;

    // ========================
    // API-BACKED CHAT STORAGE
    // ========================

    async function loadChats() {
        try {
            const data = await API.ai.getChats('recruit_assistant');
            chats = data.chats || [];
            renderHistory();
        } catch (e) {
            console.error('Failed to load chats:', e);
            chats = [];
        }
    }

    async function createNewChat() {
        try {
            const data = await API.ai.createChat('recruit_assistant');
            const chat = data.chat;
            chats.unshift(chat);
            activeChatId = chat.id;
            sessionStorage.setItem('raActiveChatId', chat.id);
            messagesContainer.querySelectorAll('.ra-msg, .ra-typing, .ra-player-cards').forEach(el => el.remove());
            if (welcome) welcome.style.display = '';
            renderHistory();
            input.focus();
            return chat;
        } catch (e) {
            console.error('Failed to create chat:', e);
            return null;
        }
    }

    async function deleteChat(chatId) {
        try {
            await API.ai.deleteChat(chatId);
            chats = chats.filter(c => c.id !== chatId);
            if (activeChatId === chatId) {
                activeChatId = chats.length > 0 ? chats[0].id : null;
                if (activeChatId) {
                    await selectChat(activeChatId);
                } else {
                    messagesContainer.querySelectorAll('.ra-msg, .ra-typing, .ra-player-cards').forEach(el => el.remove());
                    if (welcome) welcome.style.display = '';
                }
            }
            renderHistory();
        } catch (e) {
            console.error('Failed to delete chat:', e);
        }
    }

    async function selectChat(chatId) {
        activeChatId = chatId;
        lastSearchFilters = null;
        currentSearchOffset = 0;
        sessionStorage.setItem('raActiveChatId', chatId);
        try {
            const data = await API.ai.getChat(chatId);
            const chat = data.chat;
            messagesContainer.querySelectorAll('.ra-msg, .ra-typing, .ra-player-cards').forEach(el => el.remove());

            if (!chat.messages || chat.messages.length === 0) {
                if (welcome) welcome.style.display = '';
            } else {
                if (welcome) welcome.style.display = 'none';
                for (const msg of chat.messages) {
                    const div = document.createElement('div');
                    div.className = `ra-msg ${msg.role}`;
                    if (msg.role === 'assistant') {
                        div.innerHTML = formatResponseWithTables(msg.content);
                    } else {
                        div.textContent = msg.content;
                    }
                    messagesContainer.appendChild(div);

                    // If this assistant message had player results, re-run the search to show cards
                    if (msg.role === 'assistant' && msg.metadata && msg.metadata.filters && msg.metadata.playerCount > 0) {
                        // Track filters and offset for "show more" continuity
                        lastSearchFilters = msg.metadata.filters;
                        currentSearchOffset = msg.metadata.offset || 0;

                        try {
                            if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded('../../assets');
                            const searchData = await API.ai.reSearch(msg.metadata.filters, msg.metadata.offset || 0);
                            if (searchData.players && searchData.players.length > 0) {
                                const cardsContainer = document.createElement('div');
                                cardsContainer.className = 'ra-player-cards';
                                searchData.players.forEach(player => {
                                    cardsContainer.appendChild(createPlayerCard(player));
                                });
                                messagesContainer.appendChild(cardsContainer);
                                batchCheckSavedPlayers(cardsContainer);
                            }
                        } catch (searchErr) {
                            console.error('Failed to re-load player cards:', searchErr);
                        }
                    }
                }
                const savedScroll = sessionStorage.getItem('raScrollPosition');
                if (savedScroll !== null) {
                    messagesContainer.scrollTop = parseInt(savedScroll);
                    sessionStorage.removeItem('raScrollPosition');
                } else {
                    scrollToBottom();
                }
            }
            renderHistory();
        } catch (e) {
            console.error('Failed to load chat:', e);
        }
    }

    // ========================
    // RENDERING
    // ========================

    function renderHistory() {
        if (!historyList) return;

        if (chats.length === 0) {
            historyList.innerHTML = `
                <div class="ra-history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>No conversations yet</span>
                </div>
            `;
            return;
        }

        historyList.innerHTML = chats.map(chat => {
            const timeStr = formatTimeAgo(chat.created_at);
            const isActive = chat.id === activeChatId;
            return `
                <div class="ra-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                    <div class="ra-history-item-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <div class="ra-history-item-info">
                        <div class="ra-history-item-title">${escapeHtml(chat.title)}</div>
                        <div class="ra-history-item-time">${timeStr}</div>
                    </div>
                    <button class="ra-history-item-delete" data-delete-id="${chat.id}" title="Delete chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // Attach click handlers
        historyList.querySelectorAll('.ra-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.ra-history-item-delete')) return;
                selectChat(item.dataset.chatId);
            });
        });

        historyList.querySelectorAll('.ra-history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(btn.dataset.deleteId);
            });
        });
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ========================
    // MESSAGING
    // ========================

    function showTyping() {
        const typing = document.createElement('div');
        typing.className = 'ra-typing';
        typing.id = 'raTyping';
        typing.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typing);
        scrollToBottom();
    }

    function removeTyping() {
        const typing = document.getElementById('raTyping');
        if (typing) typing.remove();
    }

    async function sendMessage(text) {
        text = text.trim();
        if (!text || isSending) return;

        isSending = true;

        // Create a new chat if none active
        if (!activeChatId) {
            const chat = await createNewChat();
            if (!chat) {
                isSending = false;
                return;
            }
        }

        if (welcome) welcome.style.display = 'none';

        // Show user message immediately
        const userDiv = document.createElement('div');
        userDiv.className = 'ra-msg user';
        userDiv.textContent = text;
        messagesContainer.appendChild(userDiv);
        scrollToBottom();

        input.value = '';
        input.style.height = 'auto';

        // Show typing indicator
        showTyping();

        try {
            // Check for "show more" pattern — skip Claude, query DB directly
            const isShowMore = SHOW_MORE_PATTERN.test(text) && lastSearchFilters && activeChatId;

            let data;
            if (isShowMore) {
                currentSearchOffset += 5;
                data = await API.ai.showMore(activeChatId, 'recruit_assistant', lastSearchFilters, null, currentSearchOffset);
            } else {
                // Get current baselines from the modal
                const baselines = getCurrentBaselines();

                // Call the real API (triggers Claude)
                data = await API.ai.sendMessage(activeChatId, text, baselines);

                // Track filters for "show more" follow-ups
                if (data.filters) {
                    lastSearchFilters = data.filters;
                    currentSearchOffset = 0;
                }
            }

            removeTyping();

            // Show the AI response text
            const aiDiv = document.createElement('div');
            aiDiv.className = 'ra-msg assistant';
            aiDiv.innerHTML = formatResponseWithTables(data.response);
            messagesContainer.appendChild(aiDiv);

            // If players were returned, render player cards
            if (data.players && data.players.length > 0) {
                if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded('../../assets');
                const cardsContainer = document.createElement('div');
                cardsContainer.className = 'ra-player-cards';
                data.players.forEach(player => {
                    cardsContainer.appendChild(createPlayerCard(player));
                });
                messagesContainer.appendChild(cardsContainer);
                batchCheckSavedPlayers(cardsContainer);
            }

            scrollToBottom();

            // Refresh the chat list to update title/order
            loadChats();

        } catch (error) {
            removeTyping();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ra-msg assistant error';
            errorDiv.textContent = 'Sorry, something went wrong. Please try again.';
            messagesContainer.appendChild(errorDiv);
            scrollToBottom();
        }

        isSending = false;
    }

    // Helper: format height from DB value
    function formatHeight(heightVal) {
        if (!heightVal) return 'N/A';
        if (typeof heightVal === 'string' && heightVal.includes("'")) return heightVal;
        const totalInches = parseInt(heightVal);
        if (isNaN(totalInches) || totalInches <= 0) return 'N/A';
        return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
    }

    // Helper: format positions as badges
    const positionNames = {
        'QB': 'Quarterback (QB)', 'RB': 'Running Back (RB)', 'FB': 'Fullback (FB)',
        'WR': 'Wide Receiver (WR)', 'TE': 'Tight End (TE)', 'OT': 'Offensive Tackle (OT)',
        'OG': 'Offensive Guard (OG)', 'C': 'Center (C)', 'OL': 'Offensive Line (OL)',
        'DE': 'Defensive End (DE)', 'DT': 'Defensive Tackle (DT)', 'NT': 'Nose Tackle (NT)',
        'ILB': 'Inside Linebacker (ILB)', 'OLB': 'Outside Linebacker (OLB)', 'LB': 'Linebacker (LB)',
        'CB': 'Cornerback (CB)', 'S': 'Safety (S)', 'K': 'Kicker (K)', 'P': 'Punter (P)',
        'LS': 'Long Snapper (LS)', 'ATH': 'Athlete (ATH)'
    };

    function formatPositions(positionString) {
        if (!positionString) return '';
        return positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '').map(pos => {
            const fullName = positionNames[pos.toUpperCase()] || pos;
            return `<span class="ra-position-badge">${fullName}</span>`;
        }).join('');
    }

    // Helper: count offers
    function countOffers(offersString) {
        if (!offersString || offersString.trim() === '') return 0;
        return offersString.split('|').filter(o => o.trim() !== '').length;
    }

    // Helper: format division
    function formatDivision(division) {
        if (!division) return '';
        const div = division.trim().toUpperCase();
        if (div === 'D1 FBS' || div === 'FBS') return 'D1 FBS';
        if (div === 'D1 FCS' || div === 'FCS') return 'D1 FCS';
        if (div === 'D2' || div === 'DIVISION II') return 'D2';
        if (div === 'D3' || div === 'DIVISION III') return 'D3';
        if (div === 'NAIA') return 'NAIA';
        if (div === 'NJCAA' || div === 'JUCO') return 'JUCO';
        return division;
    }

    // Helper: format all positions as plain text joined by /
    function formatAllPositions(posStr) {
        if (!posStr) return '';
        return posStr.split(/[,\/]/).map(p => p.trim()).filter(p => p).join('/');
    }

    function createPlayerCard(player) {
        const row = document.createElement('div');
        const isTransfer = player.transfer === 'y';
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const school = player.team_name || '';
        const state = player.state || '';
        const profileImage = player.profile_image_url;
        const position = formatAllPositions(player.position);

        const avatarHtml = profileImage
            ? `<img src="${profileImage}" alt="${escapeHtml(displayName)}">`
            : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

        let line1, line2, line3, avatarClass;

        if (isTransfer) {
            const eligibility = player.eligibility ? `YOE: ${player.eligibility} year${player.eligibility > 1 ? 's' : ''}` : '';
            const division = formatDivision(player.college_division);
            const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(school, '../../assets', 16) : '';

            const line2Parts = [position, height, weight, eligibility].filter(p => p);

            line1 = `${escapeHtml(displayName)}${logoHtml ? ' ' + logoHtml : ''}`;
            line2 = line2Parts.join(' &bull; ');
            line3 = school ? `<span class="ra-row-stats-label">Previously:</span> ${escapeHtml(school)}${division ? ` (${division})` : ''}` : '';
            avatarClass = 'ra-row-avatar transfer-border';
            row.className = 'ra-player-row ra-transfer';
        } else {
            const gradYear = player.graduation_year || '';
            const offerCount = countOffers(player.offers);
            const schoolState = school + (state ? `, ${escapeHtml(state)}` : '');
            const offersHtml = `<span class="ra-row-offers">Offers: ${offerCount}</span>`;

            const line2Parts = [position, height, weight, gradYear].filter(p => p);

            line1 = escapeHtml(displayName);
            line2 = line2Parts.join(' &bull; ');
            line3 = `${escapeHtml(schoolState)}${schoolState ? ' &bull; ' : ''}${offersHtml}`;
            avatarClass = 'ra-row-avatar player-border';
            row.className = 'ra-player-row';
        }

        row.innerHTML = `
            <div class="${avatarClass}">
                ${avatarHtml}
            </div>
            <div class="ra-row-info">
                <div class="ra-row-name">${line1}</div>
                <div class="ra-row-line2 ${isTransfer ? 'color-red' : 'color-cerulean'}">${line2}</div>
                <div class="ra-row-line3">${line3}</div>
            </div>
            <div class="ra-row-actions">
                <button class="ra-btn-save-player" data-player-id="${player.user_id || ''}" data-saved="false" title="Save player for later">
                    <svg class="ra-save-icon-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <svg class="ra-save-icon-filled" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="ra-save-label">Save</span>
                </button>
                <button class="ra-btn-view-profile">View Profile</button>
            </div>
        `;

        // Save button toggle
        const saveBtn = row.querySelector('.ra-btn-save-player');
        if (saveBtn && player.user_id) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSavePlayer(saveBtn, player.user_id);
            });
        }

        row.querySelector('.ra-btn-view-profile').addEventListener('click', (e) => {
            e.stopPropagation();
            if (player.username) {
                sessionStorage.setItem('raScrollPosition', String(messagesContainer.scrollTop));
                window.location.href = `../../shared/view-profile.html?username=${player.username}&from=discover`;
            }
        });

        row.addEventListener('click', () => {
            if (player.username) {
                sessionStorage.setItem('raScrollPosition', String(messagesContainer.scrollTop));
                window.location.href = `../../shared/view-profile.html?username=${player.username}&from=discover`;
            }
        });

        return row;
    }

    // ========================
    // HELPERS
    // ========================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatResponseWithTables(text) {
        if (!text) return '';
        // Split on [STATS_TABLE] ... [/STATS_TABLE] blocks
        const parts = text.split(/\[STATS_TABLE\]/i);
        if (parts.length === 1) {
            // No table markers — return escaped plain text with line breaks
            return escapeHtml(text).replace(/\n/g, '<br>');
        }

        let html = '';
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                // Text before the first table
                html += escapeHtml(parts[i]).replace(/\n/g, '<br>');
                continue;
            }
            // This part contains table content then possibly [/STATS_TABLE] then more text
            const endIdx = parts[i].search(/\[\/STATS_TABLE\]/i);
            let tableContent, afterTable;
            if (endIdx !== -1) {
                tableContent = parts[i].substring(0, endIdx).trim();
                afterTable = parts[i].substring(endIdx + '[/STATS_TABLE]'.length);
            } else {
                tableContent = parts[i].trim();
                afterTable = '';
            }

            // Parse the table rows
            const rows = tableContent.split('\n').filter(r => r.trim());
            if (rows.length > 0) {
                html += '<div class="ra-stats-table-wrapper"><table class="ra-stats-table">';
                // First row is the header
                const headers = rows[0].split('|').map(h => h.trim());
                html += '<thead><tr>';
                headers.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
                html += '</tr></thead><tbody>';
                // Remaining rows are data
                for (let r = 1; r < rows.length; r++) {
                    const cells = rows[r].split('|').map(c => c.trim());
                    html += '<tr>';
                    cells.forEach((c, ci) => {
                        html += ci === 0 ? `<td class="ra-stats-label">${escapeHtml(c)}</td>` : `<td>${escapeHtml(c)}</td>`;
                    });
                    html += '</tr>';
                }
                html += '</tbody></table></div>';
            }

            // Text after the table
            if (afterTable.trim()) {
                html += escapeHtml(afterTable).replace(/\n/g, '<br>');
            }
        }
        return html;
    }

    function formatTimeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ========================
    // EVENT LISTENERS
    // ========================

    sendBtn.addEventListener('click', () => sendMessage(input.value));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value);
        }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => createNewChat());
    }

    // Suggestion buttons
    suggestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) sendMessage(prompt);
        });
    });

    // ========================
    // BASELINE METRICS MODAL
    // ========================

    const baselinesOverlay = document.getElementById('raBaselinesOverlay');
    const openBaselinesBtn = document.getElementById('openBaselinesBtn');
    const closeBaselinesBtn = document.getElementById('closeBaselinesBtn');
    const saveBaselinesBtn = document.getElementById('saveBaselinesBtn');
    const resetBaselinesBtn = document.getElementById('resetBaselinesBtn');
    const gpaSlider = document.getElementById('baselineGpaSlider');
    const gpaValue = document.getElementById('baselineGpaValue');
    const divisionDisplay = document.getElementById('baselineDivision');
    const positionsContainer = document.getElementById('raBaselinesPositions');

    const BASELINES_KEY = 'raBaselines';

    const POSITIONS = [
        { key: 'QB', label: 'Quarterback (QB)' },
        { key: 'RB', label: 'Running Back (RB)' },
        { key: 'WR', label: 'Wide Receiver (WR)' },
        { key: 'TE', label: 'Tight End (TE)' },
        { key: 'OL', label: 'Offensive Line (OL)' },
        { key: 'DE', label: 'Defensive End (DE)' },
        { key: 'DT', label: 'Defensive Tackle (DT)' },
        { key: 'LB', label: 'Linebacker (LB)' },
        { key: 'CB', label: 'Cornerback (CB)' },
        { key: 'S', label: 'Safety (S)' },
        { key: 'K/P', label: 'Kicker / Punter (K/P)' },
        { key: 'ATH', label: 'Athlete (ATH)' }
    ];

    const DIVISION_DEFAULTS = {
        'D1 FBS': {
            gpa: 2.5,
            QB:  { minHeight: "6'1",  maxHeight: "6'5",  minWeight: 200, maxWeight: 230 },
            RB:  { minHeight: "5'9",  maxHeight: "6'1",  minWeight: 190, maxWeight: 220 },
            WR:  { minHeight: "5'10", maxHeight: "6'3",  minWeight: 175, maxWeight: 210 },
            TE:  { minHeight: "6'3",  maxHeight: "6'6",  minWeight: 230, maxWeight: 260 },
            OL:  { minHeight: "6'3",  maxHeight: "6'7",  minWeight: 285, maxWeight: 330 },
            DE:  { minHeight: "6'2",  maxHeight: "6'6",  minWeight: 240, maxWeight: 275 },
            DT:  { minHeight: "6'1",  maxHeight: "6'5",  minWeight: 275, maxWeight: 320 },
            LB:  { minHeight: "6'0",  maxHeight: "6'3",  minWeight: 215, maxWeight: 250 },
            CB:  { minHeight: "5'9",  maxHeight: "6'1",  minWeight: 170, maxWeight: 200 },
            S:   { minHeight: "5'11", maxHeight: "6'2",  minWeight: 190, maxWeight: 215 },
            'K/P': { minHeight: "5'9",  maxHeight: "6'3",  minWeight: 160, maxWeight: 210 },
            ATH: { minHeight: "5'10", maxHeight: "6'4",  minWeight: 180, maxWeight: 230 }
        },
        'D1 FCS': {
            gpa: 2.5,
            QB:  { minHeight: "5'11", maxHeight: "6'4",  minWeight: 185, maxWeight: 225 },
            RB:  { minHeight: "5'8",  maxHeight: "6'0",  minWeight: 180, maxWeight: 215 },
            WR:  { minHeight: "5'9",  maxHeight: "6'2",  minWeight: 165, maxWeight: 200 },
            TE:  { minHeight: "6'2",  maxHeight: "6'5",  minWeight: 220, maxWeight: 255 },
            OL:  { minHeight: "6'2",  maxHeight: "6'6",  minWeight: 275, maxWeight: 320 },
            DE:  { minHeight: "6'1",  maxHeight: "6'5",  minWeight: 230, maxWeight: 265 },
            DT:  { minHeight: "6'0",  maxHeight: "6'4",  minWeight: 265, maxWeight: 310 },
            LB:  { minHeight: "5'11", maxHeight: "6'2",  minWeight: 210, maxWeight: 245 },
            CB:  { minHeight: "5'8",  maxHeight: "6'0",  minWeight: 165, maxWeight: 195 },
            S:   { minHeight: "5'10", maxHeight: "6'1",  minWeight: 185, maxWeight: 210 },
            'K/P': { minHeight: "5'8",  maxHeight: "6'2",  minWeight: 155, maxWeight: 200 },
            ATH: { minHeight: "5'9",  maxHeight: "6'3",  minWeight: 175, maxWeight: 225 }
        },
        'D2': {
            gpa: 2.5,
            QB:  { minHeight: "5'10", maxHeight: "6'3",  minWeight: 180, maxWeight: 220 },
            RB:  { minHeight: "5'7",  maxHeight: "5'11", minWeight: 175, maxWeight: 210 },
            WR:  { minHeight: "5'8",  maxHeight: "6'1",  minWeight: 160, maxWeight: 195 },
            TE:  { minHeight: "6'1",  maxHeight: "6'5",  minWeight: 215, maxWeight: 250 },
            OL:  { minHeight: "6'1",  maxHeight: "6'5",  minWeight: 265, maxWeight: 310 },
            DE:  { minHeight: "6'0",  maxHeight: "6'4",  minWeight: 225, maxWeight: 260 },
            DT:  { minHeight: "5'11", maxHeight: "6'3",  minWeight: 255, maxWeight: 300 },
            LB:  { minHeight: "5'10", maxHeight: "6'2",  minWeight: 200, maxWeight: 240 },
            CB:  { minHeight: "5'7",  maxHeight: "5'11", minWeight: 160, maxWeight: 190 },
            S:   { minHeight: "5'9",  maxHeight: "6'1",  minWeight: 180, maxWeight: 205 },
            'K/P': { minHeight: "5'7",  maxHeight: "6'1",  minWeight: 150, maxWeight: 195 },
            ATH: { minHeight: "5'8",  maxHeight: "6'2",  minWeight: 170, maxWeight: 220 }
        },
        'DEFAULT': {
            gpa: 2.0,
            QB:  { minHeight: "5'9",  maxHeight: "6'3",  minWeight: 175, maxWeight: 215 },
            RB:  { minHeight: "5'6",  maxHeight: "5'11", minWeight: 170, maxWeight: 205 },
            WR:  { minHeight: "5'7",  maxHeight: "6'1",  minWeight: 155, maxWeight: 190 },
            TE:  { minHeight: "6'0",  maxHeight: "6'4",  minWeight: 210, maxWeight: 245 },
            OL:  { minHeight: "6'0",  maxHeight: "6'5",  minWeight: 255, maxWeight: 305 },
            DE:  { minHeight: "5'11", maxHeight: "6'4",  minWeight: 215, maxWeight: 255 },
            DT:  { minHeight: "5'10", maxHeight: "6'3",  minWeight: 245, maxWeight: 295 },
            LB:  { minHeight: "5'9",  maxHeight: "6'2",  minWeight: 195, maxWeight: 235 },
            CB:  { minHeight: "5'7",  maxHeight: "5'11", minWeight: 155, maxWeight: 185 },
            S:   { minHeight: "5'8",  maxHeight: "6'0",  minWeight: 175, maxWeight: 200 },
            'K/P': { minHeight: "5'7",  maxHeight: "6'1",  minWeight: 145, maxWeight: 190 },
            ATH: { minHeight: "5'7",  maxHeight: "6'2",  minWeight: 165, maxWeight: 215 }
        }
    };

    let coachDivision = null;

    async function fetchCoachDivision() {
        try {
            const response = await API.get('/auth/me');
            if (response.profile && response.profile.college_division) {
                coachDivision = response.profile.college_division;
                if (divisionDisplay) divisionDisplay.textContent = coachDivision;
            }
        } catch (e) {
            console.error('Error fetching coach division:', e);
        }
    }

    function getDivision() {
        return coachDivision || 'D1 FBS';
    }

    function getDefaults() {
        const div = getDivision();
        return DIVISION_DEFAULTS[div] || DIVISION_DEFAULTS['DEFAULT'];
    }

    function loadBaselines() {
        try {
            const saved = localStorage.getItem(BASELINES_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* fall through */ }
        return null;
    }

    function saveBaselines(data) {
        localStorage.setItem(BASELINES_KEY, JSON.stringify(data));
    }

    function getCurrentBaselines() {
        return loadBaselines() || getDefaults();
    }

    function formatHeightInput(input) {
        input.addEventListener('input', () => {
            let raw = input.value.replace(/[^0-9]/g, '');
            if (raw.length > 3) raw = raw.substring(0, 3);
            if (raw.length >= 2) {
                input.value = raw[0] + "'" + raw.substring(1);
            } else {
                input.value = raw;
            }
        });
    }

    function renderPositionFields(baselines) {
        if (!positionsContainer) return;

        positionsContainer.innerHTML = POSITIONS.map(pos => {
            const data = baselines[pos.key] || { minHeight: '', maxHeight: '', minWeight: '', maxWeight: '' };
            return `
                <div class="ra-baselines-pos-group" data-pos="${pos.key}">
                    <div class="ra-baselines-pos-label">${pos.label}</div>
                    <div class="ra-baselines-pos-fields">
                        <div class="ra-baselines-field">
                            <div class="ra-baselines-field-label">Height Range</div>
                            <div class="ra-baselines-range">
                                <input type="text" class="ra-baselines-input ra-height-input" data-field="minHeight" value="${data.minHeight}" placeholder="5'10">
                                <span>to</span>
                                <input type="text" class="ra-baselines-input ra-height-input" data-field="maxHeight" value="${data.maxHeight}" placeholder="6'2">
                            </div>
                        </div>
                        <div class="ra-baselines-field">
                            <div class="ra-baselines-field-label">Weight Range (lbs)</div>
                            <div class="ra-baselines-range">
                                <input type="text" class="ra-baselines-input" data-field="minWeight" value="${data.minWeight}" placeholder="185">
                                <span>to</span>
                                <input type="text" class="ra-baselines-input" data-field="maxWeight" value="${data.maxWeight}" placeholder="220">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        positionsContainer.querySelectorAll('.ra-height-input').forEach(formatHeightInput);
    }

    function openBaselines() {
        if (!baselinesOverlay) return;
        const baselines = getCurrentBaselines();

        if (divisionDisplay) {
            divisionDisplay.textContent = getDivision();
        }

        if (gpaSlider && gpaValue) {
            const gpa = baselines.gpa !== undefined ? baselines.gpa : 2.5;
            gpaSlider.value = Math.round(gpa * 10);
            gpaValue.textContent = gpa.toFixed(1);
        }

        renderPositionFields(baselines);
        baselinesOverlay.classList.add('active');
    }

    function closeBaselines() {
        if (baselinesOverlay) baselinesOverlay.classList.remove('active');
    }

    function collectBaselinesData() {
        const data = {};
        data.gpa = gpaSlider ? parseFloat((parseInt(gpaSlider.value) / 10).toFixed(1)) : 2.5;

        if (positionsContainer) {
            positionsContainer.querySelectorAll('.ra-baselines-pos-group').forEach(group => {
                const posKey = group.dataset.pos;
                const inputs = group.querySelectorAll('.ra-baselines-input');
                data[posKey] = {
                    minHeight: inputs[0] ? inputs[0].value.trim() : '',
                    maxHeight: inputs[1] ? inputs[1].value.trim() : '',
                    minWeight: inputs[2] ? inputs[2].value.trim() : '',
                    maxWeight: inputs[3] ? inputs[3].value.trim() : ''
                };
            });
        }

        return data;
    }

    if (gpaSlider && gpaValue) {
        gpaSlider.addEventListener('input', () => {
            const val = (parseInt(gpaSlider.value) / 10).toFixed(1);
            gpaValue.textContent = val;
        });
    }

    if (openBaselinesBtn) {
        openBaselinesBtn.addEventListener('click', openBaselines);
    }

    if (closeBaselinesBtn) {
        closeBaselinesBtn.addEventListener('click', closeBaselines);
    }

    if (baselinesOverlay) {
        baselinesOverlay.addEventListener('click', (e) => {
            if (e.target === baselinesOverlay) closeBaselines();
        });
    }

    if (saveBaselinesBtn) {
        saveBaselinesBtn.addEventListener('click', () => {
            const data = collectBaselinesData();
            saveBaselines(data);
            closeBaselines();
        });
    }

    if (resetBaselinesBtn) {
        resetBaselinesBtn.addEventListener('click', () => {
            const defaults = getDefaults();
            if (gpaSlider && gpaValue) {
                gpaSlider.value = Math.round(defaults.gpa * 10);
                gpaValue.textContent = defaults.gpa.toFixed(1);
            }
            renderPositionFields(defaults);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && baselinesOverlay && baselinesOverlay.classList.contains('active')) {
            closeBaselines();
        }
        if (e.key === 'Escape' && usageOverlay && usageOverlay.classList.contains('active')) {
            closeUsageModal();
        }
    });

    // ========================
    // VIEW USAGE MODAL
    // ========================

    const usageOverlay = document.getElementById('raUsageOverlay');
    const openUsageBtn = document.getElementById('raOpenUsageBtn');
    const closeUsageBtn = document.getElementById('raCloseUsageBtn');

    function formatTokenCount(n) {
        if (n == null) return '—';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toLocaleString();
    }

    async function openUsageModal() {
        if (!usageOverlay) return;
        try {
        const usage = await API.ai.getUsage();
        const totalUsed = usage.inputTokens + usage.outputTokens;
        const percent = Math.min((totalUsed / usage.tokenCap) * 100, 100);
        const remaining = Math.max(usage.tokenCap - totalUsed, 0);

        document.getElementById('raUsagePlanName').textContent = usage.plan;
        document.getElementById('raUsagePeriod').textContent =
            new Date(usage.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
            ' – ' +
            new Date(usage.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('raUsageNumbers').textContent = formatTokenCount(totalUsed) + ' / ' + formatTokenCount(usage.tokenCap);
        document.getElementById('raUsagePercent').textContent = percent.toFixed(1) + '% used';
        document.getElementById('raUsageRemaining').textContent = formatTokenCount(remaining) + ' tokens remaining';
        document.getElementById('raUsageInput').textContent = totalUsed === 0 ? '—' : usage.inputTokens.toLocaleString();
        document.getElementById('raUsageOutput').textContent = totalUsed === 0 ? '—' : usage.outputTokens.toLocaleString();
        document.getElementById('raUsageRequests').textContent = usage.totalRequests.toLocaleString();

        const barFill = document.getElementById('raUsageBarFill');
        barFill.style.width = percent + '%';
        barFill.classList.remove('warning', 'critical');
        if (percent >= 90) barFill.classList.add('critical');
        else if (percent >= 75) barFill.classList.add('warning');

        // Update sidebar badge
        const summary = document.getElementById('raUsageSummary');
        if (summary) summary.textContent = Math.round(percent) + '%';

        usageOverlay.classList.add('active');
        } catch (err) {
            console.error('Failed to load usage:', err);
        }
    }

    function closeUsageModal() {
        if (usageOverlay) usageOverlay.classList.remove('active');
    }

    if (openUsageBtn) {
        openUsageBtn.addEventListener('click', openUsageModal);
    }

    if (closeUsageBtn) {
        closeUsageBtn.addEventListener('click', closeUsageModal);
    }

    if (usageOverlay) {
        usageOverlay.addEventListener('click', (e) => {
            if (e.target === usageOverlay) closeUsageModal();
        });
    }

    // ========================
    // INIT
    // ========================

    async function init() {
        await loadChats();
        const savedChatId = sessionStorage.getItem('raActiveChatId');
        const savedChatExists = savedChatId && chats.some(c => c.id === savedChatId);

        if (savedChatExists) {
            await selectChat(savedChatId);
        } else if (chats.length > 0) {
            await selectChat(chats[0].id);
        }
        fetchCoachDivision();

        // Update usage badge on page load
        try {
            const usage = await API.ai.getUsage();
            const totalUsed = usage.inputTokens + usage.outputTokens;
            const percent = Math.min((totalUsed / usage.tokenCap) * 100, 100);
            const summary = document.getElementById('raUsageSummary');
            if (summary) summary.textContent = Math.round(percent) + '%';
        } catch (e) { /* silent — badge stays as dash */ }
    }

    // ========================
    // SAVED PLAYERS FUNCTIONS
    // ========================

    function setSaveState(btn, saved) {
        btn.dataset.saved = saved ? 'true' : 'false';
        const outlineIcon = btn.querySelector('.ra-save-icon-outline');
        const filledIcon = btn.querySelector('.ra-save-icon-filled');
        const label = btn.querySelector('.ra-save-label');
        if (saved) {
            btn.classList.add('saved');
            if (outlineIcon) outlineIcon.style.display = 'none';
            if (filledIcon) filledIcon.style.display = '';
            if (label) label.textContent = 'Saved';
        } else {
            btn.classList.remove('saved');
            if (outlineIcon) outlineIcon.style.display = '';
            if (filledIcon) filledIcon.style.display = 'none';
            if (label) label.textContent = 'Save';
        }
    }

    async function toggleSavePlayer(btn, playerUserId) {
        const isSaved = btn.dataset.saved === 'true';
        try {
            if (isSaved) {
                const data = await API.ai.unsavePlayer(playerUserId);
                setSaveState(btn, false);
                updateSavedCount(data.count);
            } else {
                const data = await API.ai.savePlayer(playerUserId);
                if (!data.success) {
                    showSaveError(btn, data.error || 'Failed to save');
                    return;
                }
                setSaveState(btn, true);
                updateSavedCount(data.count);
            }
        } catch (e) {
            if (e.message && e.message.includes('full')) {
                showSaveError(btn, 'Saved list full — maximum 50 players');
            } else {
                console.error('Save toggle error:', e);
            }
        }
    }

    function showSaveError(btn, message) {
        const existing = btn.parentElement.querySelector('.ra-save-error');
        if (existing) existing.remove();
        const errorEl = document.createElement('div');
        errorEl.className = 'ra-save-error';
        errorEl.textContent = message;
        btn.parentElement.appendChild(errorEl);
        setTimeout(() => errorEl.remove(), 3000);
    }

    async function batchCheckSavedPlayers(container) {
        const buttons = container.querySelectorAll('.ra-btn-save-player[data-player-id]');
        const playerIds = [...buttons].map(b => b.dataset.playerId).filter(id => id);
        if (playerIds.length === 0) return;

        try {
            const data = await API.ai.checkSavedPlayers(playerIds);
            const savedSet = new Set(data.savedIds || []);
            buttons.forEach(btn => {
                if (savedSet.has(btn.dataset.playerId)) {
                    setSaveState(btn, true);
                }
            });
        } catch (e) {
            console.error('Batch check saved players error:', e);
        }
    }

    function updateSavedCount(count) {
        const countEl = document.getElementById('raSavesCount');
        if (countEl) countEl.textContent = `${count}/50`;
    }

    // ========================
    // SAVED PLAYERS MODAL
    // ========================

    function initSavedPlayersModal() {
        const openBtn = document.getElementById('openSavesBtn');
        if (!openBtn) return;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'ra-saved-overlay';
        overlay.id = 'raSavedOverlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="ra-saved-modal">
                <div class="ra-saved-header">
                    <div class="ra-saved-header-left">
                        <h3>Saved Players</h3>
                        <span class="ra-saved-header-count" id="raSavedHeaderCount">0/50</span>
                    </div>
                    <button class="ra-saved-close" id="raSavedCloseBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="ra-saved-body" id="raSavedBody">
                    <div class="ra-saved-empty">No saved players yet</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        openBtn.addEventListener('click', () => openSavedModal());
        document.getElementById('raSavedCloseBtn').addEventListener('click', () => closeSavedModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSavedModal();
        });

        // Load initial count
        loadSavedCount();

        // Auto-reopen modal if returning from profile view
        const shouldReopen = sessionStorage.getItem('raSavedModalOpen');
        if (shouldReopen) {
            sessionStorage.removeItem('raSavedModalOpen');
            setTimeout(() => openSavedModal(), 300);
        }
    }

    async function loadSavedCount() {
        try {
            const data = await API.ai.getSavedPlayers();
            updateSavedCount(data.count);
        } catch (e) {
            // Silently fail
        }
    }

    async function openSavedModal() {
        const overlay = document.getElementById('raSavedOverlay');
        const body = document.getElementById('raSavedBody');
        overlay.style.display = 'flex';

        body.innerHTML = '<div class="ra-saved-loading">Loading...</div>';

        try {
            const data = await API.ai.getSavedPlayers();
            document.getElementById('raSavedHeaderCount').textContent = `${data.count}/50`;
            updateSavedCount(data.count);

            if (!data.players || data.players.length === 0) {
                body.innerHTML = '<div class="ra-saved-empty">No saved players yet</div>';
                return;
            }

            body.innerHTML = '';
            data.players.forEach(player => {
                const item = document.createElement('div');
                item.className = 'ra-saved-item';
                item.dataset.userId = player.user_id;

                const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
                const position = player.position || '—';
                const heightDisplay = player.height ? `${Math.floor(player.height / 12)}'${player.height % 12}"` : null;
                const weightDisplay = player.weight ? `${player.weight} lbs` : null;

                // Role-specific subheader (lesson 7)
                let subheader, subColor;
                if (player.transfer === 'y') {
                    const elig = player.eligibility ? `YOE: ${player.eligibility} year${player.eligibility > 1 ? 's' : ''}` : '';
                    subheader = [position, heightDisplay, weightDisplay, elig].filter(Boolean).join(' \u2022 ');
                    subColor = '#b91c1c';
                } else {
                    const gradYear = player.graduation_year ? `Class of ${player.graduation_year}` : '';
                    subheader = [position, heightDisplay, weightDisplay, gradYear].filter(Boolean).join(' \u2022 ');
                    subColor = '#1282a2';
                }

                const school = player.team_name || '';
                const state = player.state || '';
                const profileImg = player.profile_image_url
                    ? `<img src="${player.profile_image_url}" alt="${displayName}" class="ra-saved-item-img">`
                    : `<div class="ra-saved-item-img-placeholder"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;

                item.innerHTML = `
                    <div class="ra-saved-item-avatar">${profileImg}</div>
                    <div class="ra-saved-item-info">
                        <div class="ra-saved-item-name">${escapeHtml(displayName)}</div>
                        <div class="ra-saved-item-detail" style="color: ${subColor}">${escapeHtml(subheader)}</div>
                        <div class="ra-saved-item-school">${escapeHtml(school)}${state ? ', ' + escapeHtml(state) : ''}</div>
                    </div>
                    <button class="ra-saved-item-remove" data-remove-id="${player.user_id}" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;

                // Click item to view profile
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.ra-saved-item-remove')) return;
                    if (player.username) {
                        sessionStorage.setItem('raSavedModalOpen', 'true');
                        window.location.href = `../../shared/view-profile.html?username=${player.username}&from=discover`;
                    }
                });

                // Remove button
                item.querySelector('.ra-saved-item-remove').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const result = await API.ai.unsavePlayer(player.user_id);
                        item.remove();
                        updateSavedCount(result.count);
                        document.getElementById('raSavedHeaderCount').textContent = `${result.count}/50`;
                        // Update card button if visible
                        const cardBtn = document.querySelector(`.ra-btn-save-player[data-player-id="${player.user_id}"]`);
                        if (cardBtn) setSaveState(cardBtn, false);
                        // Show empty message if no more players
                        if (body.children.length === 0) {
                            body.innerHTML = '<div class="ra-saved-empty">No saved players yet</div>';
                        }
                    } catch (err) {
                        console.error('Remove saved player error:', err);
                    }
                });

                body.appendChild(item);
            });
        } catch (e) {
            body.innerHTML = '<div class="ra-saved-empty">Failed to load saved players</div>';
            console.error('Load saved players error:', e);
        }
    }

    function closeSavedModal() {
        const overlay = document.getElementById('raSavedOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    init();
    initSavedPlayersModal();
});
