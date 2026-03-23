// Recruit Assistant - Full Page Chat

document.addEventListener('DOMContentLoaded', function() {
    const messagesContainer = document.getElementById('raMessages');
    const welcome = document.getElementById('raWelcome');
    const input = document.getElementById('raInput');
    const sendBtn = document.getElementById('raSendBtn');
    const historyList = document.getElementById('raHistoryList');
    const newChatBtn = document.getElementById('newChatBtn');
    const mobileNewChatBtn = document.getElementById('mobileNewChatBtn');
    const suggestions = document.querySelectorAll('.ra-suggestion');

    if (!messagesContainer || !input) return;

    const STORAGE_KEY = 'raChats';
    let chats = loadChats();
    let activeChatId = null;

    // ========================
    // STORAGE
    // ========================

    function loadChats() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    function saveChats() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
        } catch (e) {
            console.error('Error saving chats:', e);
        }
    }

    function getActiveChat() {
        return chats.find(c => c.id === activeChatId);
    }

    // ========================
    // CHAT MANAGEMENT
    // ========================

    function createNewChat() {
        const chat = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: new Date().toISOString()
        };
        chats.unshift(chat);
        saveChats();
        activeChatId = chat.id;
        renderHistory();
        renderChat();
        input.focus();
        return chat;
    }

    function deleteChat(chatId) {
        chats = chats.filter(c => c.id !== chatId);
        saveChats();
        if (activeChatId === chatId) {
            activeChatId = chats.length > 0 ? chats[0].id : null;
        }
        renderHistory();
        renderChat();
    }

    function selectChat(chatId) {
        activeChatId = chatId;
        renderHistory();
        renderChat();
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
            const timeStr = formatTimeAgo(chat.createdAt);
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

    function renderChat() {
        const chat = getActiveChat();

        if (!chat || chat.messages.length === 0) {
            // Show welcome screen
            if (welcome) welcome.style.display = '';
            messagesContainer.querySelectorAll('.ra-msg, .ra-typing').forEach(el => el.remove());
            return;
        }

        // Hide welcome
        if (welcome) welcome.style.display = 'none';

        // Clear and re-render messages
        messagesContainer.querySelectorAll('.ra-msg, .ra-typing').forEach(el => el.remove());

        chat.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `ra-msg ${msg.role}`;
            div.textContent = msg.content;
            messagesContainer.appendChild(div);
        });

        scrollToBottom();
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

    function sendMessage(text) {
        text = text.trim();
        if (!text) return;

        // Create chat if none active
        let chat = getActiveChat();
        if (!chat) {
            chat = createNewChat();
        }

        // Hide welcome
        if (welcome) welcome.style.display = 'none';

        // Update chat title from first message
        if (chat.messages.length === 0) {
            chat.title = text.length > 50 ? text.substring(0, 50) + '...' : text;
        }

        // Add user message
        chat.messages.push({ role: 'user', content: text });
        saveChats();
        renderHistory();

        const userDiv = document.createElement('div');
        userDiv.className = 'ra-msg user';
        userDiv.textContent = text;
        messagesContainer.appendChild(userDiv);
        scrollToBottom();

        input.value = '';
        input.style.height = 'auto';

        // Placeholder AI response
        showTyping();

        setTimeout(() => {
            removeTyping();

            const response = "This feature is coming soon! I'll be able to help you find players matching your criteria.";
            chat.messages.push({ role: 'assistant', content: response });
            saveChats();

            const aiDiv = document.createElement('div');
            aiDiv.className = 'ra-msg assistant';
            aiDiv.textContent = response;
            messagesContainer.appendChild(aiDiv);
            scrollToBottom();
        }, 1200);
    }

    // ========================
    // HELPERS
    // ========================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // Send on button click
    sendBtn.addEventListener('click', () => sendMessage(input.value));

    // Send on Enter (Shift+Enter for newline)
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

    // New chat buttons
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => createNewChat());
    }
    if (mobileNewChatBtn) {
        mobileNewChatBtn.addEventListener('click', () => createNewChat());
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

    // Default baselines by division
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

    // Coach division fetched from backend
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

    // Auto-format height: digits only → insert ' after first digit
    // e.g. "6" stays "6", "61" → "6'1", "510" → "5'10", "6'2" stays "6'2"
    function formatHeightInput(input) {
        input.addEventListener('input', () => {
            // Strip everything except digits
            let raw = input.value.replace(/[^0-9]/g, '');

            // Cap at 3 digits (e.g. 510, 611)
            if (raw.length > 3) raw = raw.substring(0, 3);

            if (raw.length >= 2) {
                input.value = raw[0] + "'" + raw.substring(1);
            } else {
                input.value = raw;
            }
        });
    }

    // Build position rows
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

        // Attach auto-format to all height inputs
        positionsContainer.querySelectorAll('.ra-height-input').forEach(formatHeightInput);
    }

    // Open modal
    function openBaselines() {
        if (!baselinesOverlay) return;
        const baselines = getCurrentBaselines();

        // Set division display
        if (divisionDisplay) {
            divisionDisplay.textContent = getDivision();
        }

        // Set GPA slider
        if (gpaSlider && gpaValue) {
            const gpa = baselines.gpa !== undefined ? baselines.gpa : 2.5;
            gpaSlider.value = Math.round(gpa * 10);
            gpaValue.textContent = gpa.toFixed(1);
        }

        renderPositionFields(baselines);
        baselinesOverlay.classList.add('active');
    }

    // Close modal
    function closeBaselines() {
        if (baselinesOverlay) baselinesOverlay.classList.remove('active');
    }

    // Collect form data
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

    // GPA slider live update
    if (gpaSlider && gpaValue) {
        gpaSlider.addEventListener('input', () => {
            const val = (parseInt(gpaSlider.value) / 10).toFixed(1);
            gpaValue.textContent = val;
        });
    }

    // Open
    if (openBaselinesBtn) {
        openBaselinesBtn.addEventListener('click', openBaselines);
    }

    // Close
    if (closeBaselinesBtn) {
        closeBaselinesBtn.addEventListener('click', closeBaselines);
    }

    // Close on overlay click
    if (baselinesOverlay) {
        baselinesOverlay.addEventListener('click', (e) => {
            if (e.target === baselinesOverlay) closeBaselines();
        });
    }

    // Save
    if (saveBaselinesBtn) {
        saveBaselinesBtn.addEventListener('click', () => {
            const data = collectBaselinesData();
            saveBaselines(data);
            closeBaselines();
        });
    }

    // Reset to division defaults
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

    // Close on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && baselinesOverlay && baselinesOverlay.classList.contains('active')) {
            closeBaselines();
        }
    });

    // ========================
    // INIT
    // ========================

    // Load most recent chat or show welcome
    if (chats.length > 0) {
        activeChatId = chats[0].id;
    }
    renderHistory();
    renderChat();
    fetchCoachDivision();
});
