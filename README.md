# Prompt Optimizer

A modern web application that transforms basic prompts into detailed, domain-specific prompts using the Venice.ai API.

## Overview

The Prompt Optimizer is a sleek, single-screen web application where users can enter a brief prompt, and an LLM automatically transforms it into a detailed, domain-specific prompt. Users can then copy the advanced prompt or generate answers using their choice of AI model.

## Features

- Clean, modern UI with Moroccan-inspired design elements
- Simple text input for basic prompts
- Automated transformation of prompts using Venice.ai's LLM
- Model selection for answer generation
- Display of optimized prompts for copying
- Option to generate answers using the optimized prompt
- Responsive design for desktop and mobile use

## Getting Started

### Prerequisites

- A Venice.ai API key (sign up at [Venice.ai](https://venice.ai))
- A modern web browser
- (Optional) Node.js for running the local server

### Installation

#### Method 1: Direct File Opening
1. Clone this repository or download the files
2. Open `index.html` in your web browser

#### Method 2: Using the Node.js Server
1. Clone this repository or download the files
2. Make sure you have Node.js installed
3. Open a terminal/command prompt in the project directory
4. Run `node server.js`
5. Open your browser and navigate to `http://localhost:3000`

#### Method 3: Deploy to Netlify
1. Sign up for a Netlify account at [netlify.com](https://netlify.com)
2. Click "Add new site" > "Deploy manually" and upload your project files
3. Set up your Venice.ai API key in Netlify's environment variables:
   - Go to Site settings > Environment variables
   - Add a variable named `VENICE_API_KEY` with your API key as the value
4. Trigger a new deployment

### Usage

1. Enter your Venice.ai API key when prompted (it will be stored in your browser's local storage)
2. Type a simple prompt in the input field (e.g., "Explain the benefits of meditation")
3. Click "Transform Prompt" to generate an optimized prompt
4. Copy the optimized prompt using the copy button
5. (Optional) Select an AI model from the dropdown menu
6. Click "Generate Answer" to get a response based on the optimized prompt

## Technical Details

- The application uses the Venice.ai API with multiple model options
- No server-side code is required for the core functionality; all API calls are made directly from the browser
- User API keys are stored in the browser's local storage for convenience
- A simple Node.js server is included for those who prefer to run the application locally
- Netlify Functions are used to inject environment variables when deployed to Netlify

## UI Features

- Modern, clean design with rounded corners and subtle animations
- Moroccan-inspired pattern overlay for visual interest
- Atkinson Hyperlegible font for improved readability
- Responsive layout that works well on all device sizes
- Intuitive model selection dropdown for answer generation
- Success and error notifications for better user feedback

## Security Notes

- Your API key is stored in your browser's local storage
- All API requests are made over HTTPS
- No prompt data is stored on any server beyond what Venice.ai may log
- When deployed to Netlify, your API key can be stored as an environment variable

## Customization

You can modify the application by:

- Changing the transformer model in `app.js` (TRANSFORMER_MODEL_ID variable)
- Adding or removing models from the model selector in `index.html`
- Adjusting the system prompt for transformation in the `transformPrompt()` function
- Modifying the styling in `styles.css`

## License

This project is open source and available under the MIT License.

## Acknowledgements

- Powered by [Venice.ai](https://venice.ai)
- Uses various Venice.ai models for prompt transformation and answer generation 