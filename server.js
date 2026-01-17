const express = require('express');
const path = require('path');
const cors = require('cors');
const archiver = require('archiver');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for skill packages
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

// 4. Generate Skill Package (.skill ZIP file)
app.post('/api/skill-package', async (req, res) => {
    try {
        const { name, description, skillType, skillMd, scripts, references, assets } = req.body;

        if (!name || !skillMd) {
            return res.status(400).json({ error: 'Skill name and SKILL.md content are required' });
        }

        // Set headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.skill"`);

        // Create ZIP archive
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Handle archive errors
        archive.on('error', (err) => {
            console.error('[SERVER] Archive Error:', err);
            res.status(500).json({ error: 'Failed to create skill package' });
        });

        // Pipe archive to response
        archive.pipe(res);

        // Add SKILL.md to the root of skill folder
        archive.append(skillMd, { name: `${name}/SKILL.md` });

        // Add scripts if present
        if (scripts && scripts.length > 0) {
            scripts.forEach(script => {
                archive.append(script.content, { name: `${name}/scripts/${script.filename}` });
            });
        }

        // Add references if present
        if (references && references.length > 0) {
            references.forEach(ref => {
                archive.append(ref.content, { name: `${name}/references/${ref.filename}` });
            });
        }

        // Add assets placeholder if needed
        if (assets) {
            archive.append('# Assets Folder\n\nPlace templates, images, fonts, and other assets here.',
                { name: `${name}/assets/.gitkeep` });
        }

        // Finalize the archive
        await archive.finalize();

        console.log(`[SERVER] Skill package "${name}.skill" generated successfully`);
    } catch (error) {
        console.error('[SERVER] Skill Package Error:', error);
        res.status(500).json({ error: 'Failed to generate skill package' });
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