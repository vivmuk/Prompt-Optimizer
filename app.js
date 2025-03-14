document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const userPromptInput = document.getElementById('user-prompt');
    const transformBtn = document.getElementById('transform-btn');
    const optimizedPromptOutput = document.getElementById('optimized-prompt');
    const copyBtn = document.getElementById('copy-btn');
    const generateAnswerBtn = document.getElementById('generate-answer-btn');
    const answerOutput = document.getElementById('answer-output');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const modelSelector = document.getElementById('model');
    
    // API Configuration
    const API_URL = 'https://api.venice.ai/api/v1';
    const TRANSFORMER_MODEL_ID = 'llama-3.3-70b'; // Model for transforming prompts
    
    // Check for API key in different sources
    let API_KEY = '';
    
    // First check if there's an environment variable (for Netlify deployment)
    if (typeof VENICE_API_KEY !== 'undefined') {
        API_KEY = VENICE_API_KEY;
    } 
    // Then check localStorage
    else if (localStorage.getItem('venice_api_key')) {
        API_KEY = localStorage.getItem('venice_api_key');
    } 
    // Finally, prompt user if no key is found
    else {
        promptForApiKey();
    }
    
    // Event Listeners
    transformBtn.addEventListener('click', transformPrompt);
    copyBtn.addEventListener('click', copyToClipboard);
    generateAnswerBtn.addEventListener('click', generateAnswer);
    
    // Initialize UI
    initializeUI();
    
    // Function to initialize UI elements
    async function initializeUI() {
        try {
            // Fetch available models
            const models = await fetchModels();
            updateModelSelector(models);
            
            // Add animation to cards
            document.querySelectorAll('.card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    card.style.transform = 'translateY(-5px)';
                    card.style.boxShadow = '0 15px 35px var(--shadow-color)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'translateY(0)';
                    card.style.boxShadow = '0 10px 30px var(--shadow-color)';
                });
            });
        } catch (error) {
            console.error('Error initializing UI:', error);
            showError('Failed to fetch available models. Please check your API key.');
        }
    }
    
    // Function to fetch available models
    async function fetchModels() {
        const response = await fetch(`${API_URL}/models`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch models');
        }
        
        const data = await response.json();
        return data.data;
    }
    
    // Function to update model selector with fetched models
    function updateModelSelector(models) {
        // Clear existing options
        modelSelector.innerHTML = '';
        
        // Sort models by creation date (newest first)
        models.sort((a, b) => b.created - a.created);
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            
            // Create capability icons
            const capabilities = [];
            const specs = model.model_spec.capabilities;
            
            // Add icons based on capabilities
            if (specs.optimizedForCode) capabilities.push('💻');
            if (specs.supportsVision) capabilities.push('��️');
            if (specs.supportsFunctionCalling) capabilities.push('🔧');
            if (specs.supportsResponseSchema) capabilities.push('📋');
            if (specs.supportsWebSearch) capabilities.push('🔍');
            if (specs.supportsReasoning) capabilities.push('🧠');
            
            // Add model traits
            const traits = model.model_spec.traits || [];
            const traitIcons = traits.map(trait => {
                switch(trait) {
                    case 'fastest': return '⚡';
                    case 'most_uncensored': return '🔓';
                    case 'most_intelligent': return '🎯';
                    case 'default_code': return '📝';
                    case 'default_reasoning': return '🤔';
                    case 'default_vision': return '📸';
                    case 'function_calling_default': return '⚙️';
                    case 'default': return '✨';
                    default: return '';
                }
            }).filter(icon => icon);
            
            // Add context window size indicator
            const contextTokens = model.model_spec.availableContextTokens;
            const contextIcon = contextTokens >= 100000 ? '🌟' : 
                              contextTokens >= 50000 ? '⭐' : '💫';
            
            const icons = [...capabilities, ...traitIcons, contextIcon].join(' ');
            
            // Create tooltip content
            const tooltipContent = [
                `Context: ${(contextTokens/1000).toFixed(1)}K tokens`,
                specs.optimizedForCode ? 'Code Optimized' : '',
                specs.supportsVision ? 'Vision Capable' : '',
                specs.supportsFunctionCalling ? 'Function Calling' : '',
                specs.supportsResponseSchema ? 'Schema Support' : '',
                specs.supportsWebSearch ? 'Web Search' : '',
                specs.supportsReasoning ? 'Advanced Reasoning' : '',
                ...traits.map(t => t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
            ].filter(Boolean).join(' • ');
            
            option.setAttribute('data-tooltip', tooltipContent);
            option.textContent = `${model.id} ${icons}`;
            
            // Set default model for transformation
            if (model.id === TRANSFORMER_MODEL_ID) {
                option.selected = true;
            }
            
            modelSelector.appendChild(option);
        });
    }
    
    // Function to format markdown text with better formatting
    function formatMarkdown(text) {
        // Clean up the text first
        text = text.trim();
        
        // Replace markdown headers with proper hierarchy
        text = text.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
            const level = hashes.length;
            return `<h${level} class="markdown-header">${content}</h${level}>`;
        });
        
        // Replace bold text
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Replace italic text
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Replace inline code with syntax highlighting
        text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Replace code blocks with syntax highlighting
        text = text.replace(/```(\w*)\n([\s\S]+?)```/g, (match, lang, code) => {
            const language = lang || 'plaintext';
            return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
        });
        
        // Replace bullet points with proper nesting
        text = text.replace(/^(\s*)-\s+(.+)$/gm, (match, spaces, content) => {
            const indent = spaces.length;
            return `<li class="indent-${indent}">${content}</li>`;
        });
        text = text.replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
        
        // Replace numbered lists with proper nesting
        text = text.replace(/^(\s*)\d+\.\s+(.+)$/gm, (match, spaces, content) => {
            const indent = spaces.length;
            return `<li class="indent-${indent}">${content}</li>`;
        });
        text = text.replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ol>$1</ol>');
        
        // Replace links with target="_blank" and rel="noopener"
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, 
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Replace horizontal rules
        text = text.replace(/^---+$/gm, '<hr class="markdown-hr">');
        
        // Replace blockquotes
        text = text.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Add paragraphs to text blocks
        text = text.replace(/^(?!<[a-z])[^<\n].+$/gm, '<p>$&</p>');
        
        // Clean up empty lines and multiple spaces
        text = text.replace(/\n\s*\n/g, '\n\n');
        text = text.replace(/ {2,}/g, ' ');
        
        return text;
    }
    
    // Function to prompt user for API key
    function promptForApiKey() {
        API_KEY = prompt('Please enter your Venice.ai API key:');
        if (API_KEY) {
            localStorage.setItem('venice_api_key', API_KEY);
        } else {
            alert('API key is required to use this application.');
        }
    }
    
    // Function to update progress bar
    function updateProgress(percent) {
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `Processing: ${percent}%`;
    }
    
    // Function to show progress bar
    function showProgress() {
        progressContainer.style.display = 'block';
        // Add a small delay before starting the animation to ensure smooth transition
        setTimeout(() => {
            updateProgress(0);
        }, 10);
    }
    
    // Function to hide progress bar
    function hideProgress() {
        // Complete the progress to 100% before hiding
        updateProgress(100);
        
        // Add a delay before hiding to show the completed progress
        setTimeout(() => {
            // Fade out effect
            progressContainer.style.opacity = '0';
            progressContainer.style.transition = 'opacity 0.5s ease';
            
            // After fade out, hide and reset
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressContainer.style.opacity = '1';
                progressContainer.style.transition = '';
            }, 500);
        }, 300);
    }
    
    // Function to simulate progress (since we don't have real-time progress from the API)
    function simulateProgress(duration) {
        let progress = 0;
        const interval = 50; // Update every 50ms
        const increment = 100 / (duration / interval);
        
        showProgress();
        
        const progressInterval = setInterval(() => {
            progress += increment;
            
            // Cap at 90% until we get the actual response
            if (progress >= 90) {
                progress = 90;
                clearInterval(progressInterval);
            }
            
            updateProgress(Math.round(progress));
        }, interval);
        
        return progressInterval;
    }
    
    // Function to transform the user prompt
    async function transformPrompt() {
        const userPrompt = userPromptInput.value.trim();
        
        if (!userPrompt) {
            showError('Please enter a prompt.');
            return;
        }
        
        if (!API_KEY) {
            promptForApiKey();
            if (!API_KEY) return;
        }
        
        // Show progress bar and start simulation
        const progressInterval = simulateProgress(3000); // Simulate 3 seconds
        
        try {
            // Create the system message for the transformer LLM
            const systemMessage = `You are an expert prompt engineer. Your task is to transform simple user prompts into detailed, domain-specific prompts that follow best practices in prompt engineering. 
            
When transforming prompts:
1. Identify the domain or subject matter of the user's query
2. Apply appropriate role prompting (e.g., "You are an expert in...")
3. Add structured instructions with clear objectives
4. Include constraints or specific requirements where relevant
5. Request specific output formats if appropriate
6. Maintain the original intent of the user's query

Your transformed prompt should be comprehensive but concise, and should significantly improve the quality of responses from an LLM.`;
            
            // Call the Venice.ai API to transform the prompt
            const response = await fetch(`${API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: TRANSFORMER_MODEL_ID,
                    messages: [
                        {
                            role: 'system',
                            content: systemMessage
                        },
                        {
                            role: 'user',
                            content: `Transform this simple prompt into a detailed, domain-specific prompt: "${userPrompt}"`
                        }
                    ],
                    temperature: 0.7
                })
            });
            
            const data = await response.json();
            
            // Clear the progress simulation
            clearInterval(progressInterval);
            
            if (response.ok) {
                // Extract the optimized prompt from the response
                const optimizedPrompt = data.choices[0].message.content;
                optimizedPromptOutput.value = optimizedPrompt;
                
                // Show success message
                showSuccess('Prompt successfully transformed!');
                
                // Hide progress bar
                hideProgress();
            } else {
                // Handle API error
                console.error('API Error:', data);
                hideProgress();
                showError(`Error: ${data.error || 'Failed to transform prompt'}`);
            }
        } catch (error) {
            console.error('Error:', error);
            clearInterval(progressInterval);
            hideProgress();
            showError('An error occurred. Please try again.');
        }
    }
    
    // Function to copy the optimized prompt to clipboard
    function copyToClipboard() {
        optimizedPromptOutput.select();
        document.execCommand('copy');
        
        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'success-message';
        successMessage.textContent = 'Copied to clipboard!';
        
        const container = copyBtn.parentElement;
        container.appendChild(successMessage);
        
        // Show the message
        successMessage.style.display = 'block';
        
        // Hide the message after 2 seconds
        setTimeout(() => {
            successMessage.style.display = 'none';
            container.removeChild(successMessage);
        }, 2000);
    }
    
    // Function to generate an answer using the optimized prompt
    async function generateAnswer() {
        const optimizedPrompt = optimizedPromptOutput.value.trim();
        const selectedModel = modelSelector.value;
        
        if (!optimizedPrompt) {
            showError('Please transform a prompt first or enter your own prompt.');
            return;
        }
        
        if (!API_KEY) {
            promptForApiKey();
            if (!API_KEY) return;
        }
        
        // Show progress bar and start simulation
        const progressInterval = simulateProgress(5000);
        
        try {
            const response = await fetch(`${API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [
                        {
                            role: 'user',
                            content: optimizedPrompt
                        }
                    ],
                    temperature: 0.7
                })
            });
            
            const data = await response.json();
            
            clearInterval(progressInterval);
            
            if (response.ok) {
                const answer = data.choices[0].message.content;
                // Format markdown in the answer
                answerOutput.innerHTML = formatMarkdown(answer);
                
                answerOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
                showSuccess('Answer generated successfully!');
                hideProgress();
            } else {
                console.error('API Error:', data);
                hideProgress();
                showError(`Error: ${data.error || 'Failed to generate answer'}`);
            }
        } catch (error) {
            console.error('Error:', error);
            clearInterval(progressInterval);
            hideProgress();
            showError('An error occurred. Please try again.');
        }
    }
    
    // Function to show success message
    function showSuccess(message) {
        const successMessage = document.createElement('div');
        successMessage.className = 'success-message';
        successMessage.textContent = message;
        
        // Find a good place to show the message
        const container = document.querySelector('.actions');
        container.appendChild(successMessage);
        
        // Show the message
        successMessage.style.display = 'block';
        
        // Hide the message after 3 seconds
        setTimeout(() => {
            successMessage.style.display = 'none';
            container.removeChild(successMessage);
        }, 3000);
    }
    
    // Function to show error message
    function showError(message) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = message;
        
        // Find a good place to show the message
        const container = document.querySelector('.actions');
        container.appendChild(errorMessage);
        
        // Show the message
        errorMessage.style.display = 'block';
        
        // Hide the message after 3 seconds
        setTimeout(() => {
            errorMessage.style.display = 'none';
            container.removeChild(errorMessage);
        }, 3000);
    }
}); 