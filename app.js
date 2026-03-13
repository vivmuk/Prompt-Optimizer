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
    const answerModelSelect = document.getElementById('answer-model-select'); // NEW
    const generatedAnswer = document.getElementById('generated-answer');
    const optimizerInlineStatus = document.getElementById('optimizer-inline-status'); // NEW

    // Agent Builder

    const agentDescriptionInput = document.getElementById('agent-description');
    const agentModelSelect = document.getElementById('agent-model-select');
    const buildAgentBtn = document.getElementById('build-agent-btn');
    const agentResult = document.getElementById('agent-result');
    const agentOutput = document.getElementById('agent-output');
    const agentLoader = document.getElementById('agent-loader');
    const agentProgress = document.getElementById('agent-progress');
    const agentInlineStatus = document.getElementById('agent-inline-status'); // NEW


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
    const anthropicInlineStatus = document.getElementById('anthropic-inline-status'); // NEW
    const anthropicProgress = document.getElementById('anthropic-progress'); // Ensure this ID selector exists for new logic

    let currentAnthropicSkill = null; // Store generated Anthropic skill

    // --- HELPER: Load Venice Models ---
    async function loadVeniceModels() {
        try {
            console.log('Fetching Venice models...');
            const response = await fetch('/api/models');

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();

            if (data && data.data && Array.isArray(data.data)) {
                loadedModels = data.data;
                console.log(`Loaded ${loadedModels.length} Venice models`);

                // Populate model dropdowns with fetched models
                populateModelDropdowns();

                showToast(`Loaded ${loadedModels.length} Venice models!`);
                return true;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error loading Venice models:', error);
            showToast('Using default models.');

            // Fallback to default models
            loadedModels = [
                { id: 'deepseek-r1-671b-thinking', name: 'DeepSeek R1 671B' },
                { id: 'zai-org-glm-4.7', name: 'GLM 4.7' },
                { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
                { id: 'qwen3-4b', name: 'Qwen 3 4B' },
                { id: 'qwen3-235b-a22b-thinking-2507', name: 'Qwen 3 235B Thinking' },
                { id: 'venice-uncensored', name: 'Venice Uncensored' }
            ];
            return false;
        }
    }

    // --- HELPER: Populate Model Dropdowns ---
    function populateModelDropdowns() {
        if (loadedModels.length === 0) return;

        // Clear existing options
        modelSelect.innerHTML = '';
        agentModelSelect.innerHTML = '';
        answerModelSelect.innerHTML = ''; // Clear new dropdown

        // Populate both dropdowns with fetched models
        loadedModels.forEach(model => {
            const optionForOptimizer = document.createElement('option');
            optionForOptimizer.value = model.id;
            optionForOptimizer.textContent = model.name || model.id;
            modelSelect.appendChild(optionForOptimizer);

            const optionForAgent = document.createElement('option');
            optionForAgent.value = model.id;
            optionForAgent.textContent = model.name || model.id;
            agentModelSelect.appendChild(optionForAgent);

            const optionForAnswer = document.createElement('option');
            optionForAnswer.value = model.id;
            optionForAnswer.textContent = model.name || model.id;
            answerModelSelect.appendChild(optionForAnswer);
        });

        console.log('Model dropdowns populated with latest models');
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

        // UI Reset
        optimizeBtn.disabled = true;
        optimizerResult.style.display = 'none';
        optimizerLoader.style.display = 'block';
        optimizerInlineStatus.style.display = 'block'; // Show inline
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

        // --- ADVANCED PROMPT ENGINEERING SYSTEM ---
        // Build a comprehensive system prompt using modern techniques:
        // CO-STAR (Context, Objective, Style, Tone, Audience, Response)
        // RISEN (Role, Instructions, Steps, End Goal, Narrowing)
        // Chain-of-Thought, XML structuring, few-shot, constraints, and format specs

        let systemPrompt = '';

        // Provider-specific optimization strategies
        if (provider === 'claude') {
            systemPrompt = `You are a world-class prompt engineer specializing in Anthropic Claude models. Your mission is to transform a rough user input into a masterfully structured, production-ready prompt that will elicit Claude's best performance.

Apply ALL of the following techniques:

1. **ROLE ASSIGNMENT**: Open with a precise expert persona (e.g., "You are a senior software engineer with 15 years of experience in...").
2. **XML STRUCTURE**: Wrap distinct sections in semantic XML tags. Use tags like <context>, <task>, <requirements>, <constraints>, <examples>, <output_format>, <thinking> as appropriate.
3. **CHAIN-OF-THOUGHT**: For analytical or multi-step tasks, instruct Claude to reason before answering (e.g., "Think through this step by step inside <thinking> tags before providing your response").
4. **SPECIFICITY**: Replace vague words with precise, measurable instructions. "Good code" → "production-ready, PEP-8 compliant Python with docstrings and error handling".
5. **OUTPUT FORMAT**: Explicitly define the structure, length, tone, and format of the desired response.
6. **POSITIVE + NEGATIVE CONSTRAINTS**: State both what to DO and what to AVOID.
7. **SUCCESS CRITERIA**: Describe what an ideal, correct response looks like.
8. **FEW-SHOT EXAMPLES**: If the task benefits from examples, add a brief <examples> section showing the input→output pattern.`;

        } else if (provider === 'gemini') {
            systemPrompt = `You are a world-class prompt engineer specializing in Google Gemini models. Your mission is to transform a rough user input into a masterfully structured prompt using the CO-STAR framework and Gemini best practices.

Apply ALL of the following techniques:

**CO-STAR FRAMEWORK** — Structure every optimized prompt with these sections:
- **C – Context**: Background information Gemini needs to understand the situation
- **O – Objective**: The precise task, framed as a clear action verb + desired outcome
- **S – Style**: The writing/reasoning style to adopt (academic, casual, technical, Socratic, etc.)
- **T – Tone**: The emotional register (professional, empathetic, authoritative, encouraging)
- **A – Audience**: Who this response is for (experts, beginners, executives, developers, etc.)
- **R – Response**: Exact output format, length, and structure (bullet list, JSON, numbered steps, prose)

Additional techniques:
1. **MULTIMODAL AWARENESS**: Note if images, diagrams, or structured data would enhance the response.
2. **EXPLICIT REASONING**: Add "First, reason through the problem, then provide your answer."
3. **GROUNDING INSTRUCTIONS**: For factual tasks, specify "cite sources" or "note confidence level."
4. **VERBOSITY CALIBRATION**: Specify the ideal response length (brief/detailed/comprehensive).`;

        } else if (provider === 'openai') {
            systemPrompt = `You are a world-class prompt engineer specializing in OpenAI GPT models. Your mission is to transform a rough user input into a masterfully engineered prompt using OpenAI's proven best practices.

Apply ALL of the following techniques:

1. **SYSTEM + USER SPLIT**: Structure the output as a clearly delineated System Message followed by a User Message.
   - System Message: Define the AI's persona, expertise, rules, and output format
   - User Message: The specific request with context and constraints
2. **CHAIN-OF-THOUGHT (CoT)**: For reasoning tasks, add "Let's think step by step." or "Work through this systematically before answering."
3. **MARKDOWN STRUCTURE**: Use ## headers, bullet lists, and code blocks to organize complex prompts.
4. **DELIMITERS**: Use triple backticks \`\`\`, triple quotes """, or XML tags to clearly separate inputs from instructions.
5. **ROLE + PERSONA**: Open with a concrete expert role (e.g., "You are a senior data scientist at a Fortune 500 company...").
6. **FEW-SHOT EXAMPLES**: For classification, formatting, or stylistic tasks, include 2–3 examples in the format:
   Input: [example] → Output: [example]
7. **OUTPUT SPECIFICATION**: Define exact format (JSON, markdown table, numbered list, prose) and length.
8. **NEGATIVE CONSTRAINTS**: Explicitly list what the model should NOT do.`;

        } else {
            systemPrompt = `You are a world-class prompt engineer. Your mission is to transform a rough user input into a masterfully crafted, model-agnostic prompt using the RISEN framework and universal prompt engineering best practices.

Apply ALL of the following techniques using the RISEN framework:

**RISEN FRAMEWORK**:
- **R – Role**: Assign a precise expert persona with relevant credentials and experience
- **I – Instructions**: Give clear, unambiguous, step-by-step directions
- **S – Steps**: Break complex tasks into an ordered sequence of sub-tasks
- **E – End Goal**: State the exact desired outcome and what success looks like
- **N – Narrowing**: Add constraints that scope and focus the response (format, length, style, what to avoid)

Additional universal techniques:
1. **SPECIFICITY OVER VAGUENESS**: Replace every abstract word with a concrete, measurable alternative
2. **CONTEXT INJECTION**: Add all background information needed to answer without further clarification
3. **OUTPUT CONTRACT**: Define the exact structure, format, and length of the expected response
4. **CONSTRAINT PAIRS**: For each thing to do, also specify the corresponding thing to avoid
5. **VERIFICATION STEP**: End with "Before responding, verify your answer meets: [success criteria]"`;
        }

        // Category-specific enhancements
        if (selectedCategory === 'coding') {
            systemPrompt += `

**CODING CATEGORY REQUIREMENTS** — The optimized prompt must also demand:
- Language, framework, and version specification (e.g., "Python 3.11+", "React 18")
- Code quality standards: type hints, docstrings, error handling, logging
- Edge case coverage: null inputs, boundary values, concurrency, security
- Testing requirements: unit tests, example usage, expected output
- Performance considerations: time/space complexity where relevant
- "Explain your approach before writing the code" for algorithmic tasks`;

        } else if (selectedCategory === 'creative') {
            systemPrompt += `

**CREATIVE WRITING CATEGORY REQUIREMENTS** — The optimized prompt must also demand:
- Point of view (first/second/third person, omniscient vs. limited)
- Tone and mood (melancholic, tense, whimsical, satirical, etc.)
- Target audience and reading level
- Word count or scene length
- "Show, don't tell" instruction for sensory and emotional details
- Specific narrative techniques (in medias res, unreliable narrator, etc.) if relevant
- Style references: "Write in the style of [author/genre]" if applicable`;
        }

        systemPrompt += `

**CRITICAL OUTPUT RULE**: Return ONLY the fully optimized, ready-to-use prompt. Do NOT include explanations, meta-commentary, headings like "Optimized Prompt:", or any wrapper text. The entire response should be the prompt itself — nothing before it, nothing after it.`;

        // Build a richer user message with context
        const userMessage = `Transform the following rough input into an excellent, production-ready prompt using all the techniques in your instructions.

Raw user input:
"""
${prompt}
"""

Remember: Return ONLY the optimized prompt itself — no preamble, no explanation.`;

        try {
            const selectedModel = modelSelect.value;
            const response = await callApi('/api/chat', {
                model: selectedModel,
                venice_parameters: {
                    include_venice_system_prompt: true,
                    enable_web_search: "off"
                },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ]
            });

            clearInterval(interval);
            optimizerProgress.innerText = '100%';

            setTimeout(() => {
                optimizerLoader.style.display = 'none';
                optimizerInlineStatus.style.display = 'none'; // Hide inline
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
        const selectedModel = answerModelSelect.value;


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
        const platform = 'chatgpt'; // Default since selector removed in favor of model selector
        const description = agentDescriptionInput.value.trim();

        if (!description) return showToast('Please describe your agent.');

        // UI Reset
        buildAgentBtn.disabled = true;
        agentResult.style.display = 'none';
        agentLoader.style.display = 'block';
        agentInlineStatus.style.display = 'block'; // Show inline
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
            const selectedModel = agentModelSelect.value;
            const response = await callApi('/api/chat', {
                model: selectedModel,
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
                agentInlineStatus.style.display = 'none'; // Hide inline
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

    // --- FEATURE 3: ANTHROPIC SKILLS BUILDER ---
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
                model: "zai-org-glm-4.7",
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
            buildAnthropicSkillBtn.textContent = 'Generating...';
            anthropicSkillLoader.style.display = 'block';
            anthropicInlineStatus.style.display = 'block'; // Show inline
            anthropicSkillResult.style.display = 'none';
            if (anthropicProgress) anthropicProgress.innerText = '0%';

            let progress = 0;
            const progressInterval = setInterval(() => {
                if (progress < 90) progress += Math.random() * 5;
                if (progress > 90) progress = 90;
                if (anthropicProgress) anthropicProgress.innerText = Math.floor(progress) + '%';
            }, 300);

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
                model: "zai-org-glm-4.7",
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
                    model: "zai-org-glm-4.7",
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
                    model: "zai-org-glm-4.7",
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
            // Display the result
            clearInterval(progressInterval);
            if (anthropicProgress) anthropicProgress.innerText = '100%';
            anthropicSkillLoader.style.display = 'none';
            anthropicInlineStatus.style.display = 'none'; // Hide inline
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

    // --- INITIALIZE: Load Venice models on page load ---
    loadVeniceModels();
});
