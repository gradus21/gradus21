-- Migration 005: Update encrypted_envelopes primary key to composite (owner_user_id, id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'encrypted_envelopes_pkey' 
        AND table_name = 'encrypted_envelopes'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage 
            WHERE constraint_name = 'encrypted_envelopes_pkey' 
            AND column_name = 'owner_user_id'
        ) THEN
            ALTER TABLE encrypted_envelopes DROP CONSTRAINT encrypted_envelopes_pkey;
            ALTER TABLE encrypted_envelopes ADD PRIMARY KEY (owner_user_id, id);
        END IF;
    END IF;
END $$;
