const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// --- HELPER: Get and Sanitize API Key ---
function getVeniceKey() {
    let apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) return null;

    // Remove ALL quotes (single or double) from anywhere in the string
    // This fixes issues where users accidentally copy '"key"' into the variable
    apiKey = apiKey.replace(/['"]/g, '').trim();
    return apiKey;
}

// --- API ENDPOINTS ---

// 1. Debug Endpoint (Safe)
app.get('/api/health', (req, res) => {
    const key = getVeniceKey();
    res.json({
        status: 'ok',
        env_check: {
            has_key: !!key,
            key_length: key ? key.length : 0,
            key_start: key ? `${key.substring(0, 4)}...` : 'N/A'
        }
    });
});

// 2. Chat Completions Proxy
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = getVeniceKey();
        if (!apiKey) {
            console.error('[SERVER] Msg: Missing API Key');
            return res.status(500).json({ error: 'Configuration Error: VENICE_API_KEY missing on server.' });
        }

        console.log(`[SERVER] Proxying Chat Request to Venice...`);

        const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[SERVER] Venice API Error:', response.status, data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('[SERVER] Exception:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Models Proxy
app.get('/api/models', async (req, res) => {
    try {
        const apiKey = getVeniceKey();
        if (!apiKey) {
            return res.status(500).json({ error: 'Configuration Error: VENICE_API_KEY missing on server.' });
        }

        const response = await fetch('https://api.venice.ai/api/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[SERVER] Venice Models Error:', response.status, data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('[SERVER] Exception:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

// Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment Check: VENICE_API_KEY is ${getVeniceKey() ? 'SET' : 'MISSING'}`);
});