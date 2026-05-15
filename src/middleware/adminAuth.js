const supabase = require('../lib/supabase');

function getBearerToken(req) {
    const header = req.header('authorization') || '';
    if (!header.startsWith('Bearer ')) {
        return null;
    }

    return header.slice('Bearer '.length).trim();
}

async function requireAdminAuth(req, res, next) {
    try {
        const accessToken = getBearerToken(req);
        if (!accessToken) {
            return res.status(401).json({ error: 'Missing bearer token.' });
        }

        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data?.user) {
            return res.status(401).json({ error: 'Invalid or expired session.' });
        }

        req.authUser = data.user;
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    requireAdminAuth,
};
