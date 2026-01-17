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
    const optimizerLoader = document.getElementById('optimizer-loader');
    const optimizerProgress = document.getElementById('optimizer-progress');
    const generateAnswerBtn = document.getElementById('generate-answer-btn');
    const generatedAnswer = document.getElementById('generated-answer');

    // Agent Builder
    const agentPlatformSelect = document.getElementById('agent-platform');
    const agentDescriptionInput = document.getElementById('agent-description');
    const buildAgentBtn = document.getElementById('build-agent-btn');
    const agentResult = document.getElementById('agent-result');
    const agentOutput = document.getElementById('agent-output');
    const agentLoader = document.getElementById('agent-loader');
    const agentProgress = document.getElementById('agent-progress');

    // Skills Builder
    const skillNameInput = document.getElementById('skill-name');
    const skillDescriptionInput = document.getElementById('skill-description');
    const fetchVeniceModelsBtn = document.getElementById('fetch-venice-models-btn');
    const veniceStatus = document.getElementById('venice-status');
    const buildSkillBtn = document.getElementById('build-skill-btn');
    const skillLoader = document.getElementById('skill-loader');
    const skillProgress = document.getElementById('skill-progress');
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

        // UI Reset
        optimizeBtn.disabled = true;
        optimizerResult.style.display = 'none';
        optimizerLoader.style.display = 'block';
        optimizerProgress.innerText = '0%';

        // Animation
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.floor(Math.random() * 5) + 1;
                if (progress > 90) progress = 90;
                optimizerProgress.innerText = `${progress}%`;
            }
        }, 200);

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

        try {
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

            clearInterval(interval);
            optimizerProgress.innerText = '100%';

            setTimeout(() => {
                optimizerLoader.style.display = 'none';
                optimizeBtn.disabled = false;

                if (response && response.choices) {
                    optimizedOutput.innerText = response.choices[0].message.content;
                    optimizerResult.style.display = 'block';
                    showToast('Prompt Optimized!');
                    optimizerResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 500);

        } catch (e) {
            clearInterval(interval);
            optimizerLoader.style.display = 'none';
            optimizeBtn.disabled = false;
            showToast('Error optimizing prompt');
        }
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

        // UI Reset
        buildAgentBtn.disabled = true;
        agentResult.style.display = 'none';
        agentLoader.style.display = 'block';
        agentProgress.innerText = '0%';

        // Animation
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.floor(Math.random() * 5) + 1;
                if (progress > 90) progress = 90;
                agentProgress.innerText = `${progress}%`;
            }
        }, 200);

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

        try {
            const response = await callApi('/api/chat', {
                model: "llama-3.3-70b",
                venice_parameters: { include_venice_system_prompt: true },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Agent Goal: "${description}"` }
                ]
            });

            clearInterval(interval);
            agentProgress.innerText = '100%';

            setTimeout(() => {
                agentLoader.style.display = 'none';
                buildAgentBtn.disabled = false;

                if (response && response.choices) {
                    let content = response.choices[0].message.content;

                    // Robust JSON extraction
                    const jsonStart = content.indexOf('{');
                    const jsonEnd = content.lastIndexOf('}');

                    let agentData = null;

                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        const jsonString = content.substring(jsonStart, jsonEnd + 1);
                        try {
                            agentData = JSON.parse(jsonString);
                        } catch (e) {
                            console.error('JSON Parse Error:', e);
                        }
                    }

                    if (agentData) {
                        // Success: Populate UI
                        document.querySelector('#agent-section-name .content-box').textContent = agentData.name;
                        document.querySelector('#agent-section-description .content-box').textContent = agentData.description;
                        document.querySelector('#agent-section-instructions .content-box').textContent = agentData.instructions;
                        document.querySelector('#agent-section-starters .content-box').textContent = Array.isArray(agentData.conversation_starters) ? agentData.conversation_starters.join('\n') : agentData.conversation_starters;

                        agentResult.style.display = 'block';
                        showToast('Agent Configuration Built!');
                        agentResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    } else {
                        // Fallback
                        console.warn('Falling back to raw text display');
                        let cleanText = content.replace(/```json/gi, '').replace(/```/g, '').trim();
                        document.querySelector('#agent-section-instructions .content-box').textContent = cleanText;

                        document.querySelector('#agent-section-name .content-box').textContent = "See Instructions";
                        document.querySelector('#agent-section-description .content-box').textContent = "See Instructions";
                        document.querySelector('#agent-section-starters .content-box').textContent = "See Instructions";

                        agentResult.style.display = 'block';
                        showToast('Agent Built (Raw Format)');
                        agentResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }, 500);

        } catch (e) {
            clearInterval(interval);
            agentLoader.style.display = 'none';
            buildAgentBtn.disabled = false;
            showToast('Error building agent');
        }
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

        // Initialize UI
        skillResult.style.display = 'none';
        skillLoader.style.display = 'block';
        skillProgress.innerText = '0%';

        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.floor(Math.random() * 5) + 1;
                if (progress > 90) progress = 90;
                skillProgress.innerText = `${progress}%`;
            }
        }, 300);

        try {
            const systemPrompt = `You are an expert Claude Agent Skills Architect. Your task is to generate a comprehensive 'SKILL.md' file based on the user's request.

            REFERENCE GUIDE SUMMARY:
            - Agent Skills are modular packages extending Claude's capabilities.
            - Structure: YAML frontmatter (name, description) + formatting Markdown instructions.
            - Frontmatter 'description' is CRITICAL: must state WHAT it does and WHEN to use it (triggers).
            
            INPUT:
            Skill Name: "${name}"
            Goal/Description: "${description}"

            OUTPUT FORMAT:
            Return a JSON object with this exact structure:
            {
                "skill_name": "clean-kebab-case-name",
                "skill_content": "...full escaped markdown content of SKILL.md including YAML frontmatter...",
                "readme_tips": "Short bullet points on how to use this skill."
            }

            CONTENT RULES:
            1. 'name' in YAML must be lowercase, numbers, hyphens only.
            2. 'description' in YAML must follow the pattern: "[WHAT is does]. Use when [TRIGGERS]."
            3. Include clear headers: # Title, ## Instructions, ## Examples.
            `;

            const response = await callApi('/api/chat', {
                model: "llama-3.3-70b",
                venice_parameters: { include_venice_system_prompt: true },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Generate the SKILL.md file now." }
                ]
            });

            // Finish Animation
            clearInterval(interval);
            skillProgress.innerText = '100%';

            setTimeout(() => {
                skillLoader.style.display = 'none';

                if (response && response.choices) {
                    let content = response.choices[0].message.content;
                    // Clean up markdown block if present
                    const jsonStart = content.indexOf('{');
                    const jsonEnd = content.lastIndexOf('}');

                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        content = content.substring(jsonStart, jsonEnd + 1);
                    }

                    try {
                        const skillData = JSON.parse(content);
                        currentSkillData = skillData;

                        skillOutput.innerText = skillData.skill_content;
                        skillResult.style.display = 'block';
                        showToast('Agent Skill Generated!');

                        // Auto-scroll to result
                        skillResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    } catch (e) {
                        console.error('JSON Parse Error', e);
                        skillOutput.innerText = response.choices[0].message.content; // Fallback
                        currentSkillData = { raw: response.choices[0].message.content };
                        skillResult.style.display = 'block';
                        showToast('Skill Generated (Raw)');
                        skillResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }, 500); // Short delay to show 100%

        } catch (err) {
            clearInterval(interval);
            skillLoader.style.display = 'none';
            showToast('Error generating skill');
            console.error(err);
        }
    });

    downloadSkillBtn.addEventListener('click', () => {
        if (!currentSkillData) return;

        let fileContent = "";
        let fileName = skillNameInput.value || 'skill';

        if (currentSkillData.raw) {
            fileContent = currentSkillData.raw;
        } else if (currentSkillData.skill_content) {
            // New Format: SKILL.md
            fileContent = currentSkillData.skill_content;
            fileName = currentSkillData.skill_name || fileName;
        } else {
            // Legacy Format (fallback)
            fileContent = `SKILL PACKAGE: ${fileName}\n\n` +
                `--- tool.py ---\n${currentSkillData.tool_code}\n\n` +
                `--- requirements.txt ---\n${currentSkillData.requirements}\n\n` +
                `--- README.md ---\n${currentSkillData.readme}\n`;
        }

        downloadMockZip(fileName, fileContent);
    });
});