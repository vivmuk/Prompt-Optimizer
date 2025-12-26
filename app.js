document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let currentTab = 'optimizer';
    let selectedCategory = 'general';
    let loadedModels = [];
    let currentSkillData = null; // Store generated skill files

    // --- DOM ELEMENTS ---
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.section');
    const categoryCards = document.querySelectorAll('.category-card');

    // Optimizer
    const basicPromptInput = document.getElementById('basic-prompt');
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const optimizeBtn = document.getElementById('optimize-btn');
    const optimizerResult = document.getElementById('optimizer-result');
    const optimizedOutput = document.getElementById('optimized-output');
    const generateAnswerBtn = document.getElementById('generate-answer-btn');
    const generatedAnswer = document.getElementById('generated-answer');

    // Agent Builder
    const agentPlatformSelect = document.getElementById('agent-platform');
    const agentDescriptionInput = document.getElementById('agent-description');
    const buildAgentBtn = document.getElementById('build-agent-btn');
    const agentResult = document.getElementById('agent-result');
    const agentOutput = document.getElementById('agent-output');

    // Skills Builder
    const skillNameInput = document.getElementById('skill-name');
    const skillDescriptionInput = document.getElementById('skill-description');
    const fetchVeniceModelsBtn = document.getElementById('fetch-venice-models-btn');
    const veniceStatus = document.getElementById('venice-status');
    const buildSkillBtn = document.getElementById('build-skill-btn');
    const skillLoader = document.getElementById('skill-loader');
    const skillResult = document.getElementById('skill-result');
    const skillOutput = document.getElementById('skill-output');
    const downloadSkillBtn = document.getElementById('download-skill-btn');

    const toast = document.getElementById('toast');

    // --- TAB SWITCHING ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetId = tab.dataset.tab;
            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === targetId) sec.classList.add('active');
            });
            currentTab = targetId;
        });
    });

    // --- CATEGORY SELECTION ---
    categoryCards.forEach(card => {
        card.addEventListener('click', () => {
            categoryCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedCategory = card.dataset.category;
        });
    });

    // --- HELPER FUNCTIONS ---
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function callApi(endpoint, body) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            showToast('Error communicating with server.');
            return null;
        }
    }

    window.copyToClipboard = (elementId) => {
        const text = document.getElementById(elementId).innerText;
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
    };

    // Simple Zip generation simulation (in a real app, use JSZip)
    function downloadMockZip(filename, textContent) {
        const element = document.createElement('a');
        const file = new Blob([textContent], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = filename + '_package.txt'; // Fallback for pure JS without lib
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    // --- FEATURE 1: PROMPT OPTIMIZER ---
    optimizeBtn.addEventListener('click', async () => {
        const prompt = basicPromptInput.value.trim();
        const provider = providerSelect.value;
        if (!prompt) return showToast('Please enter a prompt first.');

        optimizeBtn.textContent = 'Transforming...';
        optimizeBtn.disabled = true;
        optimizeBtn.classList.add('thinking'); // Start Animation

        // Context Engineering System Prompt
        let systemPrompt = `You are a world-class prompt engineer. Transform this prompt for ${provider.toUpperCase()}.`;

        // Provider Logic
        if (provider === 'claude') {
            systemPrompt += ` Use XML tags (<context>, <instruction>, <examples>) to structure the prompt. Claude loves structured data and XML.`;
        } else if (provider === 'gemini') {
            systemPrompt += ` Use the PTCF (Persona, Task, Context, Format) framework. Be verbose and explicit.`;
        } else if (provider === 'openai') {
            systemPrompt += ` Use clear Markdown headers and a System Role definition. Focus on Chain of Thought.`;
        } else {
            systemPrompt += ` Ensure clarity, specificity, and structured output.`;
        }

        // Category Logic
        if (selectedCategory === 'coding') {
            systemPrompt += ` Focus on production-ready code, reliability, and edge cases.`;
        } else if (selectedCategory === 'creative') {
            systemPrompt += ` Focus on narrative flow, sensory details, and "Show, don't tell".`;
        }

        systemPrompt += `\n\nReturn ONLY the optimized prompt.`;



        const response = await callApi('/api/chat', {
            model: "llama-3.3-70b",
            venice_parameters: {
                include_venice_system_prompt: true,
                enable_web_search: "off"
            },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Optimize this prompt: "${prompt}"` }
            ]
        });

        if (response && response.choices) {
            optimizedOutput.innerText = response.choices[0].message.content;
            optimizerResult.style.display = 'block';
            showToast('Prompt Optimized!');
        }

        optimizeBtn.textContent = 'TRANSFORM ✨';
        optimizeBtn.disabled = false;
        optimizeBtn.classList.remove('thinking'); // Stop Animation
    });

    generateAnswerBtn.addEventListener('click', async () => {
        const optimizedPrompt = optimizedOutput.innerText;
        const selectedModel = modelSelect.value;

        generateAnswerBtn.textContent = 'Generating...';
        generatedAnswer.style.display = 'block';
        generatedAnswer.innerText = 'Thinking...';

        const response = await callApi('/api/chat', {
            model: selectedModel,
            venice_parameters: { include_venice_system_prompt: true },
            messages: [{ role: "user", content: optimizedPrompt }]
        });

        if (response && response.choices) {
            generatedAnswer.innerText = response.choices[0].message.content;
            showToast('Answer Generated!');
        }
        generateAnswerBtn.textContent = 'Generate Answer with AI';
    });

    // --- FEATURE 2: AGENT BUILDER ---
    // --- FEATURE 2: AGENT BUILDER ---
    buildAgentBtn.addEventListener('click', async () => {
        const platform = agentPlatformSelect.value;
        const description = agentDescriptionInput.value.trim();

        if (!description) return showToast('Please describe your agent.');

        buildAgentBtn.textContent = 'Building...';
        buildAgentBtn.disabled = true;
        buildAgentBtn.classList.add('thinking');

        let systemPrompt = `You are an expert AI Architect. Create a FULL AGENT CONFIGURATION for a user.
        
        Target Platform: ${platform.toUpperCase()}
        
        Context:
        - Copilot Studio: Needs Name, Description, System Prompt, Trigger Phrases.
        - Gemini Gems: Needs Name, Instructions, Premade Inputs (Starters).
        - CustomGPT: Needs Name, Description, Instructions, Conversation Starters, Knowledge Base Suggestions.
        
        Output Format:
        Return a JSON object with these exact keys:
        {
            "name": "Agent Name",
            "description": "Short description",
            "instructions": "Detailed system instructions/prompt...",
            "conversation_starters": ["Starter 1", "Starter 2"...]
        }
        
        Ensure "instructions" are highly detailed and platform-specific.
        Wrap the response in a JSON code block.`;

        const response = await callApi('/api/chat', {
            model: "llama-3.3-70b",
            venice_parameters: { include_venice_system_prompt: true },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Agent Goal: "${description}"` }
            ]
        });

        if (response && response.choices) {
            let content = response.choices[0].message.content;
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                const agentData = JSON.parse(content);

                // Populate UI
                document.querySelector('#agent-section-name .content-box').textContent = agentData.name;
                document.querySelector('#agent-section-description .content-box').textContent = agentData.description;
                document.querySelector('#agent-section-instructions .content-box').textContent = agentData.instructions;
                document.querySelector('#agent-section-starters .content-box').textContent = agentData.conversation_starters.join('\n');

                agentResult.style.display = 'block';
                showToast('Agent Configuration Built!');
            } catch (e) {
                console.error('JSON Parse Error', e);
                // Fallback: Dump raw text into instructions
                document.querySelector('#agent-section-instructions .content-box').textContent = response.choices[0].message.content;
                agentResult.style.display = 'block';
                showToast('Agent Built (Raw Format)');
            }
        }

        buildAgentBtn.textContent = 'BUILD INSTRUCTIONS 🛠️';
        buildAgentBtn.disabled = false;
        buildAgentBtn.classList.remove('thinking');
    });

    window.copyAgentSection = (section) => {
        const selector = `#agent-section-${section} .content-box`;
        const text = document.querySelector(selector).textContent;
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
    };

    // --- FEATURE 3: SKILLS BUILDER (UPDATED) ---
    fetchVeniceModelsBtn.addEventListener('click', async () => {
        loadedModels = []; // Reset to force reload
        await loadVeniceModels();
    });

    buildSkillBtn.addEventListener('click', async () => {
        const name = skillNameInput.value.trim();
        const description = skillDescriptionInput.value.trim();

        if (!name || !description) return showToast('Details required.');
        if (loadedModels.length === 0) await fetchVeniceModelsBtn.click();

        skillResult.style.display = 'none';
        skillLoader.style.display = 'block';

        // Timeout for "Waiting Graphics" effect
        setTimeout(async () => {
            const systemPrompt = `You are a Python Developer. Create a FULL SKILL PACKAGE for a tool named "${name}".
             
             Context:
             - Description: "${description}"
             - Available Models: ${loadedModels.slice(0, 5).map(m => m.id).join(', ')}...
             
             Output Format:
             Return a JSON object with 3 keys:
             1. "tool_code": Python code for the tool.
             2. "requirements": content for requirements.txt.
             3. "readme": content for README.md.
             
             Wrap the whole response in a JSON code block.`;

            const response = await callApi('/api/chat', {
                model: "llama-3.3-70b",
                venice_parameters: { include_venice_system_prompt: true },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Generate the skill package." }
                ]
            });

            skillLoader.style.display = 'none';

            if (response && response.choices) {
                let content = response.choices[0].message.content;
                // Basic clean up to try and parse JSON if wrapped in markdown
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    const skillData = JSON.parse(content);
                    currentSkillData = skillData;

                    const display = `
=== tool.py ===
${skillData.tool_code}

=== requirements.txt ===
${skillData.requirements}

=== README.md ===
${skillData.readme}
                    `;
                    skillOutput.innerText = display;
                    skillResult.style.display = 'block';
                    showToast('Skill Package Generated!');
                } catch (e) {
                    skillOutput.innerText = content; // Fallback to raw text
                    currentSkillData = { raw: content };
                    skillResult.style.display = 'block';
                    showToast('Skill Generated (Raw Format)');
                }
            }
        }, 1500);
    });

    downloadSkillBtn.addEventListener('click', () => {
        if (!currentSkillData) return;

        let fileContent = "";
        if (currentSkillData.raw) {
            fileContent = currentSkillData.raw;
        } else {
            fileContent = `SKILL PACKAGE: ${skillNameInput.value}\n\n` +
                `--- tool.py ---\n${currentSkillData.tool_code}\n\n` +
                `--- requirements.txt ---\n${currentSkillData.requirements}\n\n` +
                `--- README.md ---\n${currentSkillData.readme}\n`;
        }

        downloadMockZip(skillNameInput.value || 'skill', fileContent);
    });
});