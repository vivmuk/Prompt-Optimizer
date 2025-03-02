# Prompt Optimizer

A simple web application that transforms basic prompts into detailed, domain-specific prompts using the Venice.ai API.

## Overview

The Prompt Optimizer is a minimal, single-screen web application where users can enter a brief prompt, and an LLM automatically transforms it into a detailed, domain-specific prompt. Users can then copy the advanced prompt or optionally use it immediately for further querying.

## Features

- Simple text input for basic prompts
- Automated transformation of prompts using Venice.ai's LLM
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

### Usage

1. Enter your Venice.ai API key when prompted (it will be stored in your browser's local storage)
2. Type a simple prompt in the input field (e.g., "Explain the benefits of meditation")
3. Click "Transform Prompt" to generate an optimized prompt
4. Copy the optimized prompt using the copy button
5. (Optional) Click "Generate Answer" to get a response based on the optimized prompt

## Technical Details

- The application uses the Venice.ai API with the Llama 3.3 70B model
- No server-side code is required for the core functionality; all API calls are made directly from the browser
- User API keys are stored in the browser's local storage for convenience
- A simple Node.js server is included for those who prefer to run the application locally

## Security Notes

- Your API key is stored in your browser's local storage
- All API requests are made over HTTPS
- No prompt data is stored on any server beyond what Venice.ai may log

## Customization

You can modify the application by:

- Changing the model in `app.js` (MODEL_ID variable)
- Adjusting the system prompt for transformation in the `transformPrompt()` function
- Modifying the styling in `styles.css`

## License

This project is open source and available under the MIT License.

## Acknowledgements

- Powered by [Venice.ai](https://venice.ai)
- Uses the Llama 3.3 70B model for prompt transformation and answer generation 