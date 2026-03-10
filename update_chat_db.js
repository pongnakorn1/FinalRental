import pool from './pool.js';

async function updateSchema() {
    try {
        console.log('Checking messages table for image_url column...');
        const res = await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_schema='public' AND table_name='messages' AND column_name='image_url') THEN
                    ALTER TABLE public.messages ADD COLUMN image_url TEXT;
                    RAISE NOTICE 'Added image_url column to messages table';
                END IF;
            END $$;
        `);
        console.log('Schema update completed.');
        process.exit(0);
    } catch (err) {
        console.error('Error updating schema:', err);
        process.exit(1);
    }
}

updateSchema();
