exports.handler = async function(event, context) {
  // Get the API key from environment variables
  const apiKey = process.env.VENICE_API_KEY;
  
  // Return a script that sets the API key as a global variable
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/javascript'
    },
    body: `var VENICE_API_KEY = "${apiKey || ''}";`
  };
}; 