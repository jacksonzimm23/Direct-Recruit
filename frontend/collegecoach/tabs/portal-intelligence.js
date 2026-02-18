// Portal Intelligence - AI Chat for Transfer Portal Predictions

document.addEventListener('DOMContentLoaded', function() {

    // ========================
    // SUBTAB SWITCHING
    // ========================

    const subtabs = document.querySelectorAll('.tp-subtab');
    const tabContents = {
        'current-portal': document.getElementById('currentPortalTab'),
        'portal-intelligence': document.getElementById('portalIntelligenceTab')
    };

    subtabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active subtab
            subtabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide tab content
            Object.entries(tabContents).forEach(([key, content]) => {
                if (content) {
                    if (key === targetTab) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                }
            });

            // Save active tab to sessionStorage
            sessionStorage.setItem('tpActiveTab', targetTab);
        });
    });

    // Restore active tab from sessionStorage
    const savedTab = sessionStorage.getItem('tpActiveTab');
    if (savedTab && tabContents[savedTab]) {
        const targetBtn = document.querySelector(`.tp-subtab[data-tab="${savedTab}"]`);
        if (targetBtn) targetBtn.click();
    }

    // ========================
    // PORTAL INTELLIGENCE CHAT
    // ========================

    const messagesContainer = document.getElementById('piMessages');
    const welcome = document.getElementById('piWelcome');
    const input = document.getElementById('piInput');
    const sendBtn = document.getElementById('piSendBtn');
    const historyList = document.getElementById('piHistoryList');
    const newChatBtn = document.getElementById('piNewChatBtn');
    const suggestions = document.querySelectorAll('.pi-suggestion');

    if (!messagesContainer || !input) return;

    const STORAGE_KEY = 'piChats';
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
            console.error('Error saving PI chats:', e);
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
                <div class="pi-history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.57-3.25 3.92L12 22"></path>
                        <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.57 3.25 3.92"></path>
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
                <div class="pi-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                    <div class="pi-history-item-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.57-3.25 3.92L12 22"></path>
                            <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.57 3.25 3.92"></path>
                        </svg>
                    </div>
                    <div class="pi-history-item-info">
                        <div class="pi-history-item-title">${escapeHtml(chat.title)}</div>
                        <div class="pi-history-item-time">${timeStr}</div>
                    </div>
                    <button class="pi-history-item-delete" data-delete-id="${chat.id}" title="Delete chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // Attach click handlers
        historyList.querySelectorAll('.pi-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.pi-history-item-delete')) return;
                selectChat(item.dataset.chatId);
            });
        });

        historyList.querySelectorAll('.pi-history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(btn.dataset.deleteId);
            });
        });
    }

    function renderChat() {
        const chat = getActiveChat();

        if (!chat || chat.messages.length === 0) {
            if (welcome) welcome.style.display = '';
            messagesContainer.querySelectorAll('.pi-msg, .pi-typing').forEach(el => el.remove());
            return;
        }

        if (welcome) welcome.style.display = 'none';

        messagesContainer.querySelectorAll('.pi-msg, .pi-typing').forEach(el => el.remove());

        chat.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `pi-msg ${msg.role}`;
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
        typing.className = 'pi-typing';
        typing.id = 'piTyping';
        typing.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typing);
        scrollToBottom();
    }

    function removeTyping() {
        const typing = document.getElementById('piTyping');
        if (typing) typing.remove();
    }

    function sendMessage(text) {
        text = text.trim();
        if (!text) return;

        let chat = getActiveChat();
        if (!chat) {
            chat = createNewChat();
        }

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
        userDiv.className = 'pi-msg user';
        userDiv.textContent = text;
        messagesContainer.appendChild(userDiv);
        scrollToBottom();

        input.value = '';
        input.style.height = 'auto';

        // Placeholder AI response
        showTyping();

        setTimeout(() => {
            removeTyping();

            const response = "Portal Intelligence is coming soon! I'll analyze behavioral signals — profile updates, film uploads, and school searches — to predict which players are likely to enter the transfer portal.";
            chat.messages.push({ role: 'assistant', content: response });
            saveChats();

            const aiDiv = document.createElement('div');
            aiDiv.className = 'pi-msg assistant';
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
    // INIT
    // ========================

    if (chats.length > 0) {
        activeChatId = chats[0].id;
    }
    renderHistory();
    renderChat();
});
