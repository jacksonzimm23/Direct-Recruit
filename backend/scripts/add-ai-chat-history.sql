-- AI Chat History tables for Recruiting Assistant (and future Portal Intelligence)
-- Each coach has private chat conversations with the AI

CREATE TABLE ai_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_type VARCHAR(20) NOT NULL DEFAULT 'recruit_assistant',
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX idx_ai_chats_coach_user_id ON ai_chats(coach_user_id);
CREATE INDEX idx_ai_chats_coach_type ON ai_chats(coach_user_id, chat_type);
CREATE INDEX idx_ai_chat_messages_chat_id ON ai_chat_messages(chat_id);
