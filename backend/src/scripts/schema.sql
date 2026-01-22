-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('kid', 'adult')),
    role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    display_name VARCHAR(100),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_role ON users(role);

-- Storage Configs Table
CREATE TABLE storage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    blob_endpoint VARCHAR(500) NOT NULL,
    container_name VARCHAR(100) NOT NULL,
    access_key_encrypted TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    storage_quota_gb INTEGER,
    current_usage_gb DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_storage_active ON storage_configs(is_active);
CREATE INDEX idx_storage_primary ON storage_configs(is_primary);

-- Audiobooks Table
CREATE TABLE audiobooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    author VARCHAR(255),
    narrator VARCHAR(255),
    cover_url TEXT,
    book_type VARCHAR(10) NOT NULL CHECK (book_type IN ('adult', 'kids')),
    storage_config_id UUID REFERENCES storage_configs(id) ON DELETE RESTRICT,
    blob_path VARCHAR(500) NOT NULL,
    total_duration_seconds INTEGER,
    episodes JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_books_type ON audiobooks(book_type);
CREATE INDEX idx_books_published ON audiobooks(is_published);
CREATE INDEX idx_books_storage ON audiobooks(storage_config_id);
CREATE INDEX idx_books_type_published ON audiobooks(book_type, is_published);

-- Playback History Table
CREATE TABLE playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES audiobooks(id) ON DELETE CASCADE,
    current_time_seconds DECIMAL(10,2) NOT NULL DEFAULT 0,
    episode_index INTEGER NOT NULL DEFAULT 0,
    playback_rate DECIMAL(3,2) DEFAULT 1.0,
    last_played_at TIMESTAMP DEFAULT NOW(),
    device_info JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, book_id)
);

CREATE INDEX idx_history_user_played ON playback_history(user_id, last_played_at DESC);
CREATE INDEX idx_history_book ON playback_history(book_id);

-- Refresh Tokens Table
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_tokens_expires ON refresh_tokens(expires_at);

-- Admin Activity Log
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_logs_admin_time ON admin_logs(admin_id, created_at DESC);
CREATE INDEX idx_logs_resource ON admin_logs(resource_type, resource_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storage_configs_updated_at BEFORE UPDATE ON storage_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audiobooks_updated_at BEFORE UPDATE ON audiobooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playback_history_updated_at BEFORE UPDATE ON playback_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
