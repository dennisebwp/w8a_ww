const dotenv = require('dotenv');

dotenv.config();

const requiredKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const key of requiredKeys) {
    if (!process.env[key]) {
        console.warn(`[config] Missing environment variable: ${key}`);
    }
}

function parseJwtPayload(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
        return null;
    }

    try {
        const payload = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

        return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch (error) {
        return null;
    }
}

function classifySupabaseServerKey(key) {
    if (!key) {
        return { valid: false, reason: 'missing' };
    }

    if (key.startsWith('sb_publishable_')) {
        return { valid: false, reason: 'publishable' };
    }

    if (key.startsWith('sb_secret_')) {
        return { valid: true, reason: 'secret' };
    }

    const payload = parseJwtPayload(key);
    if (!payload) {
        return { valid: false, reason: 'unknown' };
    }

    if (payload.role === 'service_role') {
        return { valid: true, reason: 'service_role_jwt' };
    }

    if (payload.role === 'anon') {
        return { valid: false, reason: 'anon_jwt' };
    }

    return { valid: false, reason: `jwt_role_${payload.role || 'unknown'}` };
}

const supabaseServerKeyStatus = classifySupabaseServerKey(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

module.exports = {
    port: Number(process.env.PORT || 3000),
    botName: process.env.BOT_NAME || 'W8A Training and Nutrition',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseServerKeyStatus,
    whatsappHeadless: process.env.WHATSAPP_HEADLESS !== 'false',
    chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH || '',
};
