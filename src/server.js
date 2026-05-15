const express = require('express');
const fs = require('fs');
const path = require('path');
const env = require('./lib/env');
const adminRouter = require('./routes/admin');

const adminDistPath = path.resolve(process.cwd(), 'admin', 'dist');

function createServer() {
    const app = express();

    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({ ok: true });
    });

    app.use('/api/admin', adminRouter);

    if (fs.existsSync(adminDistPath)) {
        app.use(express.static(adminDistPath));

        app.use((req, res, next) => {
            if (req.path.startsWith('/api/')) {
                return next();
            }

            res.sendFile(path.join(adminDistPath, 'index.html'));
        });
    }

    return app;
}

function startServer() {
    const app = createServer();
    return app.listen(env.port, () => {
        console.log(`HTTP server listening on port ${env.port}`);
    });
}

module.exports = {
    createServer,
    startServer,
};
