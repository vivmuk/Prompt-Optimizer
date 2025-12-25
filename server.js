const express = require('express');
const path = require('path');
const cors = require('cors'); // Ensure you install this: npm install cors
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// --- API PROXY ENDPOINTS ---

// Generic proxy for Venice API chat completions
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Server configuration error: API key missing' });
        }

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
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Failed to communicate with AI provider' });
    }
});

// Endpoint to list available models from Venice
app.get('/api/models', async (req, res) => {
    try {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Server configuration error: API key missing' });
        }

        const response = await fetch('https://api.venice.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Model Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});