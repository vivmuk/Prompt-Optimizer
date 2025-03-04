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
    const modelSelector = document.getElementById('model-selector');
    
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
    function initializeUI() {
        // Set the default model in the selector
        modelSelector.value = TRANSFORMER_MODEL_ID;
        
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
        const progressInterval = simulateProgress(5000); // Simulate 5 seconds for answer generation
        
        try {
            // Call the Venice.ai API to generate an answer
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
            
            // Clear the progress simulation
            clearInterval(progressInterval);
            
            if (response.ok) {
                // Extract the answer from the response
                const answer = data.choices[0].message.content;
                answerOutput.textContent = answer;
                
                // Scroll to the answer
                answerOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // Show success message
                showSuccess('Answer generated successfully!');
                
                // Hide progress bar
                hideProgress();
            } else {
                // Handle API error
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