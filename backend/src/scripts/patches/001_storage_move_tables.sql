-- Patch 001: Storage Move Tables
-- Description: Add tables for bulk storage move operations
-- Date: 2024-01-24

-- Check if tables exist before creating
DO $$
BEGIN
    -- Create storage_move_batches if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'storage_move_batches') THEN
        CREATE TABLE storage_move_batches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            total_books INTEGER NOT NULL,
            completed_books INTEGER DEFAULT 0,
            failed_books INTEGER DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'completed_with_errors', 'cancelled', 'stopped_on_error')),
            created_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP
        );

        CREATE INDEX idx_move_batches_status ON storage_move_batches(status);

        RAISE NOTICE 'Created table: storage_move_batches';
    ELSE
        RAISE NOTICE 'Table storage_move_batches already exists, skipping';
    END IF;

    -- Create storage_move_history if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'storage_move_history') THEN
        CREATE TABLE storage_move_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            audiobook_id UUID NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
            batch_id UUID REFERENCES storage_move_batches(id) ON DELETE SET NULL,
            source_path TEXT NOT NULL,
            dest_path TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
            error_message TEXT,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_move_history_audiobook ON storage_move_history(audiobook_id);

        RAISE NOTICE 'Created table: storage_move_history';
    ELSE
        RAISE NOTICE 'Table storage_move_history already exists, skipping';
    END IF;
END $$;
