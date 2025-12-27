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

    // Anthropic Skills Builder
    const anthropicSkillNameInput = document.getElementById('anthropic-skill-name');
    const anthropicSkillDescriptionInput = document.getElementById('anthropic-skill-description');
    const anthropicSkillTypeSelect = document.getElementById('anthropic-skill-type');
    const analyzeSkillBtn = document.getElementById('analyze-skill-btn');
    const buildAnthropicSkillBtn = document.getElementById('build-anthropic-skill-btn');
    const anthropicSkillLoader = document.getElementById('anthropic-skill-loader');
    const anthropicSkillResult = document.getElementById('anthropic-skill-result');
    const anthropicSkillPreview = document.getElementById('anthropic-skill-preview');
    const downloadAnthropicSkillBtn = document.getElementById('download-anthropic-skill-btn');
    const anthropicSkillAnalysis = document.getElementById('anthropic-skill-analysis');
    const anthropicSkillStructure = document.getElementById('anthropic-skill-structure');

    let currentAnthropicSkill = null; // Store generated Anthropic skill

    // --- HELPER: Load Venice Models ---
    async function loadVeniceModels() {
        try {
            veniceStatus.textContent = 'Loading models...';
            const response = await fetch('/api/models');

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();

            if (data && data.data) {
                loadedModels = data.data;
                veniceStatus.textContent = `Models loaded: ${loadedModels.length}`;
                showToast(`Loaded ${loadedModels.length} Venice models!`);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error loading Venice models:', error);
            veniceStatus.textContent = 'Failed to load models';
            showToast('Error loading Venice models.');

            // Fallback to default models
            loadedModels = [
                { id: 'llama-3.3-70b', name: 'Llama 3.3 70B' },
                { id: 'deepseek-r1-671b-thinking', name: 'DeepSeek R1' },
                { id: 'qwen3-235b-a22b-thinking-2507', name: 'Qwen 3 235B' }
            ];
        }
    }

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

            // Robust JSON extraction: Find the first '{' and the last '}'
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
            } else {
                // Fallback: Display raw content but clean up markdown markers
                console.warn('Falling back to raw text display');
                let cleanText = content.replace(/```json/gi, '').replace(/```/g, '').trim();
                document.querySelector('#agent-section-instructions .content-box').textContent = cleanText;

                // Clear other boxes to avoid confusion
                document.querySelector('#agent-section-name .content-box').textContent = "See Instructions";
                document.querySelector('#agent-section-description .content-box').textContent = "See Instructions";
                document.querySelector('#agent-section-starters .content-box').textContent = "See Instructions";

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

    // --- FEATURE 4: ANTHROPIC SKILLS BUILDER ---
    let selectedSkillType = 'workflow';

    // Skill type card selection
    const skillTypeCards = document.querySelectorAll('.skill-type-card');
    skillTypeCards.forEach(card => {
        card.addEventListener('click', () => {
            skillTypeCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedSkillType = card.dataset.skillType;
        });
    });

    // Skill file tabs
    const skillFileTabs = document.querySelectorAll('.skill-file-tab');
    skillFileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            skillFileTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            displaySkillFile(tab.dataset.file);
        });
    });

    function displaySkillFile(fileType) {
        if (!currentAnthropicSkill) return;

        let content = '';
        switch (fileType) {
            case 'skill-md':
                content = currentAnthropicSkill.skillMd || 'No SKILL.md content generated';
                break;
            case 'scripts':
                if (currentAnthropicSkill.scripts && currentAnthropicSkill.scripts.length > 0) {
                    content = currentAnthropicSkill.scripts.map(s =>
                        `=== ${s.filename} ===\n${s.content}`
                    ).join('\n\n');
                } else {
                    content = 'No scripts included in this skill.';
                }
                break;
            case 'structure':
                content = generateStructurePreview();
                break;
        }
        anthropicSkillPreview.textContent = content;
    }

    function generateStructurePreview() {
        if (!currentAnthropicSkill) return '';

        const name = currentAnthropicSkill.name || 'skill-name';
        let structure = `${name}/\n├── SKILL.md\n`;

        if (currentAnthropicSkill.scripts && currentAnthropicSkill.scripts.length > 0) {
            structure += `├── scripts/\n`;
            currentAnthropicSkill.scripts.forEach((s, i) => {
                const isLast = i === currentAnthropicSkill.scripts.length - 1 && !currentAnthropicSkill.references && !currentAnthropicSkill.assets;
                structure += `│   ${isLast ? '└' : '├'}── ${s.filename}\n`;
            });
        }

        if (currentAnthropicSkill.references && currentAnthropicSkill.references.length > 0) {
            structure += `├── references/\n`;
            currentAnthropicSkill.references.forEach((r, i) => {
                const isLast = i === currentAnthropicSkill.references.length - 1 && !currentAnthropicSkill.assets;
                structure += `│   ${isLast ? '└' : '├'}── ${r.filename}\n`;
            });
        }

        if (currentAnthropicSkill.assets) {
            structure += `└── assets/\n`;
            structure += `    └── (placeholder for templates, images, fonts)\n`;
        }

        return structure;
    }

    // Analyze button - provides skill analysis before full generation
    if (analyzeSkillBtn) {
        analyzeSkillBtn.addEventListener('click', async () => {
            const name = anthropicSkillNameInput.value.trim();
            const description = anthropicSkillDescriptionInput.value.trim();

            if (!name || !description) {
                return showToast('Please provide skill name and description.');
            }

            analyzeSkillBtn.disabled = true;
            analyzeSkillBtn.classList.add('thinking');
            analyzeSkillBtn.textContent = 'Analyzing...';

            const includeScripts = document.getElementById('include-scripts').checked;
            const includeReferences = document.getElementById('include-references').checked;
            const includeAssets = document.getElementById('include-assets').checked;

            const systemPrompt = `You are an expert at designing Anthropic Agent Skills. Analyze this skill request and provide a structured plan.

An Anthropic Skill is a modular package containing:
- SKILL.md: YAML frontmatter (name, description) + Markdown instructions
- Optional scripts/: Python or Bash scripts for deterministic operations
- Optional references/: Documentation files to load into context
- Optional assets/: Templates, images, fonts used in outputs

Skill Types:
- workflow: Multi-step processes (document creation, data analysis pipelines)
- tool: Format handlers (PDF, Excel, API integrations)
- reference: Guidelines and standards (brand guidelines, coding standards)
- capabilities: Extend agent abilities with new features

Return a JSON object with this structure:
{
    "skill_name": "kebab-case-name",
    "description": "One sentence describing when to use this skill",
    "skill_type": "${selectedSkillType}",
    "needs_scripts": ${includeScripts},
    "needs_references": ${includeReferences},
    "needs_assets": ${includeAssets},
    "suggested_scripts": ["script1.py", "script2.sh"],
    "suggested_references": ["guide.md", "examples.md"],
    "key_capabilities": ["capability1", "capability2", "capability3"],
    "workflow_steps": ["step1", "step2", "step3"],
    "complexity": "simple|moderate|complex",
    "estimated_skill_md_lines": 100
}

Wrap the response in a JSON code block.`;

            const response = await callApi('/api/chat', {
                model: "llama-3.3-70b",
                venice_parameters: {
                    include_venice_system_prompt: true,
                    enable_web_search: "off"
                },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analyze this skill request:\nName: ${name}\nDescription: ${description}\nType: ${selectedSkillType}` }
                ]
            });

            analyzeSkillBtn.disabled = false;
            analyzeSkillBtn.classList.remove('thinking');
            analyzeSkillBtn.textContent = 'ANALYZE REQUIREMENTS 🔍';

            if (response && response.choices) {
                let content = response.choices[0].message.content;

                // Extract JSON from response
                const jsonStart = content.indexOf('{');
                const jsonEnd = content.lastIndexOf('}');

                if (jsonStart !== -1 && jsonEnd !== -1) {
                    try {
                        const analysis = JSON.parse(content.substring(jsonStart, jsonEnd + 1));

                        // Display analysis
                        let analysisHtml = `
                            <div class="analysis-item"><strong>Skill Name:</strong> ${analysis.skill_name}</div>
                            <div class="analysis-item"><strong>Type:</strong> ${analysis.skill_type}</div>
                            <div class="analysis-item"><strong>Complexity:</strong> ${analysis.complexity}</div>
                            <div class="analysis-item"><strong>Est. SKILL.md Lines:</strong> ~${analysis.estimated_skill_md_lines}</div>
                            <div class="analysis-item"><strong>Key Capabilities:</strong>
                                <ul>${analysis.key_capabilities.map(c => `<li>${c}</li>`).join('')}</ul>
                            </div>
                        `;

                        if (analysis.workflow_steps && analysis.workflow_steps.length > 0) {
                            analysisHtml += `
                                <div class="analysis-item"><strong>Workflow Steps:</strong>
                                    <ol>${analysis.workflow_steps.map(s => `<li>${s}</li>`).join('')}</ol>
                                </div>
                            `;
                        }

                        if (analysis.suggested_scripts && analysis.suggested_scripts.length > 0) {
                            analysisHtml += `
                                <div class="analysis-item"><strong>Suggested Scripts:</strong> ${analysis.suggested_scripts.join(', ')}</div>
                            `;
                        }

                        anthropicSkillStructure.innerHTML = analysisHtml;
                        anthropicSkillAnalysis.style.display = 'block';
                        showToast('Analysis complete!');
                    } catch (e) {
                        console.error('JSON Parse Error:', e);
                        anthropicSkillStructure.innerHTML = `<pre>${content}</pre>`;
                        anthropicSkillAnalysis.style.display = 'block';
                    }
                }
            }
        });
    }

    // Main build button - generates full skill package
    if (buildAnthropicSkillBtn) {
        buildAnthropicSkillBtn.addEventListener('click', async () => {
            const name = anthropicSkillNameInput.value.trim();
            const description = anthropicSkillDescriptionInput.value.trim();

            if (!name || !description) {
                return showToast('Please provide skill name and description.');
            }

            // Validate kebab-case name
            const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
            if (!kebabCaseRegex.test(name)) {
                return showToast('Skill name should be kebab-case (e.g., my-skill-name)');
            }

            buildAnthropicSkillBtn.disabled = true;
            buildAnthropicSkillBtn.classList.add('thinking');
            buildAnthropicSkillBtn.textContent = 'Generating...';
            anthropicSkillLoader.style.display = 'block';
            anthropicSkillResult.style.display = 'none';

            const includeScripts = document.getElementById('include-scripts').checked;
            const includeReferences = document.getElementById('include-references').checked;
            const includeAssets = document.getElementById('include-assets').checked;

            const statusEl = document.getElementById('anthropic-skill-status');

            // Step 1: Generate SKILL.md content
            statusEl.textContent = 'Generating SKILL.md content...';

            const skillMdPrompt = `You are an expert at creating Anthropic Agent Skills. Generate a complete SKILL.md file.

SKILL.md Structure:
1. YAML Frontmatter:
---
name: skill-name
description: When to use this skill and what it does
---

2. Markdown Body with instructions for Claude/AI agents:
- Overview (1-2 sentences)
- Main workflow or capabilities
- Step-by-step procedures
- Examples of usage
- References to scripts/assets if applicable

Guidelines:
- Keep under 500 lines (progressive disclosure - put detailed info in references/)
- Write in imperative form ("Read the file", "Parse the data")
- Claude already knows a lot - only include non-obvious procedural knowledge
- Be specific and actionable
- For ${selectedSkillType} skills, focus on:
  ${selectedSkillType === 'workflow' ? '- Step-by-step processes\n  - Decision points\n  - Error handling' : ''}
  ${selectedSkillType === 'tool' ? '- Input/output formats\n  - API patterns\n  - Data transformation' : ''}
  ${selectedSkillType === 'reference' ? '- Guidelines and standards\n  - Examples of correct usage\n  - Common mistakes to avoid' : ''}
  ${selectedSkillType === 'capabilities' ? '- New abilities being added\n  - When to use each capability\n  - Integration with existing tools' : ''}

Skill Details:
Name: ${name}
Description: ${description}
Type: ${selectedSkillType}
Include Scripts: ${includeScripts}
Include References: ${includeReferences}
Include Assets: ${includeAssets}

Return ONLY the complete SKILL.md content (frontmatter + body), no additional text or explanation.`;

            const skillMdResponse = await callApi('/api/chat', {
                model: "llama-3.3-70b",
                venice_parameters: {
                    include_venice_system_prompt: true,
                    enable_web_search: "off"
                },
                messages: [
                    { role: "system", content: skillMdPrompt },
                    { role: "user", content: "Generate the complete SKILL.md file." }
                ]
            });

            let skillMdContent = '';
            if (skillMdResponse && skillMdResponse.choices) {
                skillMdContent = skillMdResponse.choices[0].message.content;
                // Clean up any markdown code block wrappers
                skillMdContent = skillMdContent.replace(/^```(?:markdown|md|yaml)?\n?/i, '').replace(/\n?```$/i, '').trim();
            }

            // Step 2: Generate scripts if needed
            let scripts = [];
            if (includeScripts) {
                statusEl.textContent = 'Generating scripts...';

                const scriptsPrompt = `Generate Python/Bash scripts for this Anthropic Skill.

Skill: ${name}
Description: ${description}
Type: ${selectedSkillType}

Return a JSON array of script objects:
[
    {
        "filename": "script_name.py",
        "content": "#!/usr/bin/env python3\\n# Full script content here..."
    }
]

Guidelines:
- Create practical, executable scripts
- Include proper shebang lines
- Add helpful comments
- Handle errors gracefully
- Make scripts modular and reusable
- For Python: use type hints, follow PEP 8
- For Bash: use set -e for error handling

Wrap the response in a JSON code block.`;

                const scriptsResponse = await callApi('/api/chat', {
                    model: "llama-3.3-70b",
                    venice_parameters: {
                        include_venice_system_prompt: true,
                        enable_web_search: "off"
                    },
                    messages: [
                        { role: "system", content: scriptsPrompt },
                        { role: "user", content: "Generate the scripts." }
                    ]
                });

                if (scriptsResponse && scriptsResponse.choices) {
                    let scriptsContent = scriptsResponse.choices[0].message.content;
                    const jsonStart = scriptsContent.indexOf('[');
                    const jsonEnd = scriptsContent.lastIndexOf(']');

                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        try {
                            scripts = JSON.parse(scriptsContent.substring(jsonStart, jsonEnd + 1));
                        } catch (e) {
                            console.error('Scripts JSON Parse Error:', e);
                        }
                    }
                }
            }

            // Step 3: Generate references if needed
            let references = [];
            if (includeReferences) {
                statusEl.textContent = 'Generating reference documentation...';

                const referencesPrompt = `Generate reference documentation files for this Anthropic Skill.

Skill: ${name}
Description: ${description}
Type: ${selectedSkillType}

Return a JSON array of reference document objects:
[
    {
        "filename": "guide.md",
        "content": "# Guide Title\\n\\nContent here..."
    }
]

Guidelines:
- Create detailed, helpful documentation
- Include examples and best practices
- Use clear markdown formatting
- Make content scannable with headers

Wrap the response in a JSON code block.`;

                const referencesResponse = await callApi('/api/chat', {
                    model: "llama-3.3-70b",
                    venice_parameters: {
                        include_venice_system_prompt: true,
                        enable_web_search: "off"
                    },
                    messages: [
                        { role: "system", content: referencesPrompt },
                        { role: "user", content: "Generate the reference documentation." }
                    ]
                });

                if (referencesResponse && referencesResponse.choices) {
                    let refsContent = referencesResponse.choices[0].message.content;
                    const jsonStart = refsContent.indexOf('[');
                    const jsonEnd = refsContent.lastIndexOf(']');

                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        try {
                            references = JSON.parse(refsContent.substring(jsonStart, jsonEnd + 1));
                        } catch (e) {
                            console.error('References JSON Parse Error:', e);
                        }
                    }
                }
            }

            // Store the complete skill data
            currentAnthropicSkill = {
                name: name,
                description: description,
                skillType: selectedSkillType,
                skillMd: skillMdContent,
                scripts: scripts,
                references: references,
                assets: includeAssets
            };

            // Display the result
            anthropicSkillLoader.style.display = 'none';
            anthropicSkillResult.style.display = 'block';

            // Show SKILL.md by default
            displaySkillFile('skill-md');

            buildAnthropicSkillBtn.disabled = false;
            buildAnthropicSkillBtn.classList.remove('thinking');
            buildAnthropicSkillBtn.textContent = 'GENERATE SKILL PACKAGE 📦';

            showToast('Skill package generated!');
        });
    }

    // Regenerate button
    const regenerateSkillBtn = document.getElementById('regenerate-skill-btn');
    if (regenerateSkillBtn) {
        regenerateSkillBtn.addEventListener('click', () => {
            if (buildAnthropicSkillBtn) {
                buildAnthropicSkillBtn.click();
            }
        });
    }

    // Download .skill file
    if (downloadAnthropicSkillBtn) {
        downloadAnthropicSkillBtn.addEventListener('click', async () => {
            if (!currentAnthropicSkill) {
                return showToast('No skill to download. Generate one first!');
            }

            downloadAnthropicSkillBtn.disabled = true;
            downloadAnthropicSkillBtn.textContent = 'Packaging...';

            try {
                // Try server-side ZIP generation first
                const response = await fetch('/api/skill-package', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentAnthropicSkill)
                });

                if (response.ok) {
                    // Download the ZIP file
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${currentAnthropicSkill.name}.skill`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast('Skill package downloaded!');
                } else {
                    throw new Error('Server unavailable');
                }
            } catch (error) {
                console.log('Falling back to text download:', error);

                // Fallback to text file download
                let packageContent = `ANTHROPIC SKILL PACKAGE: ${currentAnthropicSkill.name}\n`;
                packageContent += `${'='.repeat(50)}\n\n`;
                packageContent += `Type: ${currentAnthropicSkill.skillType}\n`;
                packageContent += `Description: ${currentAnthropicSkill.description}\n\n`;

                packageContent += `${'='.repeat(50)}\n`;
                packageContent += `SKILL.md\n`;
                packageContent += `${'='.repeat(50)}\n\n`;
                packageContent += currentAnthropicSkill.skillMd + '\n\n';

                if (currentAnthropicSkill.scripts && currentAnthropicSkill.scripts.length > 0) {
                    packageContent += `${'='.repeat(50)}\n`;
                    packageContent += `SCRIPTS\n`;
                    packageContent += `${'='.repeat(50)}\n\n`;

                    currentAnthropicSkill.scripts.forEach(s => {
                        packageContent += `--- ${s.filename} ---\n`;
                        packageContent += s.content + '\n\n';
                    });
                }

                if (currentAnthropicSkill.references && currentAnthropicSkill.references.length > 0) {
                    packageContent += `${'='.repeat(50)}\n`;
                    packageContent += `REFERENCES\n`;
                    packageContent += `${'='.repeat(50)}\n\n`;

                    currentAnthropicSkill.references.forEach(r => {
                        packageContent += `--- ${r.filename} ---\n`;
                        packageContent += r.content + '\n\n';
                    });
                }

                packageContent += `\n${'='.repeat(50)}\n`;
                packageContent += `STRUCTURE\n`;
                packageContent += `${'='.repeat(50)}\n\n`;
                packageContent += generateStructurePreview();

                // Download the file
                const element = document.createElement('a');
                const file = new Blob([packageContent], { type: 'text/plain' });
                element.href = URL.createObjectURL(file);
                element.download = `${currentAnthropicSkill.name}.skill.txt`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);

                showToast('Skill package downloaded (text format)!');
            }

            downloadAnthropicSkillBtn.disabled = false;
            downloadAnthropicSkillBtn.textContent = 'Download .skill File 📥';
        });
    }
});