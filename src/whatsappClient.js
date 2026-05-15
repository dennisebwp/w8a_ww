const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const env = require('./lib/env');

function resolveChromeExecutablePath() {
    if (env.chromeExecutablePath) {
        return env.chromeExecutablePath;
    }

    const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    for (const candidate of macCandidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

const chromeExecutablePath = resolveChromeExecutablePath();

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth',
    }),
    authTimeoutMs: 60000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: {
        headless: env.whatsappHeadless,
        executablePath: chromeExecutablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
        ],
    },
});

let userSession = {}; // Store temporary session data for each user
let isInitializing = false;
let restartTimer = null;

function isMissingChromeError(error) {
    const message = String(error?.message || '');
    return message.includes('Could not find Chrome');
}

function isBrowserAlreadyRunningError(error) {
    const message = String(error?.message || '');
    return message.includes('The browser is already running for');
}

function scheduleRestart(reason, delayMs = 5000) {
    if (restartTimer) {
        return;
    }

    console.log(`Scheduling WhatsApp client restart in ${delayMs}ms. Reason: ${reason}`);
    restartTimer = setTimeout(async () => {
        restartTimer = null;
        await initializeClient(`restart:${reason}`);
    }, delayMs);
}

async function initializeClient(reason = 'startup') {
    if (isInitializing) {
        return;
    }

    isInitializing = true;

    try {
        console.log(`Initializing WhatsApp client (${reason})...`);
        if (chromeExecutablePath) {
            console.log(`Using Chrome executable: ${chromeExecutablePath}`);
        }
        await client.initialize();
    } catch (error) {
        console.error('WhatsApp client initialization failed:', error);
        if (isMissingChromeError(error)) {
            console.error('Chrome is missing for Puppeteer. Install it with `npm run puppeteer:install` or set CHROME_EXECUTABLE_PATH.');
            return;
        }
        if (isBrowserAlreadyRunningError(error)) {
            console.error('The WhatsApp browser profile is locked by another Chrome process. Stop the previous bot process or kill the Chrome instance using `.wwebjs_auth/session` before starting again.');
            return;
        }
        scheduleRestart(error.message || 'initialize_failed');
    } finally {
        isInitializing = false;
    }
}

// Generate and display the QR code for WhatsApp authentication
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("QR code generated, waiting for scan...");
});

// Log when the client is ready
client.on('ready', () => {
    console.log('Client is ready!');
});

// Log client authentication status
client.on('authenticated', () => {
    console.log('WhatsApp client authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
    scheduleRestart('auth_failure', 10000);
});

client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
    scheduleRestart(reason || 'disconnected');
});

module.exports = {
    client,
    userSession,
    initializeClient,
};
