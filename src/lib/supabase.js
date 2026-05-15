const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const env = require('./env');

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

if (!env.supabaseServerKeyStatus.valid) {
    throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY is not a valid server-side bypass key. Detected: ${env.supabaseServerKeyStatus.reason}. Use your project's service_role or secret key, not the anon/publishable key.`,
    );
}

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
    realtime: {
        transport: WebSocket,
    },
});

module.exports = supabase;
