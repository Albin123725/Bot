const express = require('express');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

let botProcess = null;
let botStatus = 'starting';
let currentBotName = 'CraftMan';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Minecraft Dual Bot System',
    currentBot: currentBotName,
    botStatus: botStatus,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Minecraft Dual Bot System is running!',
    endpoints: {
      health: '/health',
      status: '/health'
    }
  });
});

// Bot management
function startBot() {
  console.log('🤖 Starting Minecraft Dual Bot...');
  botStatus = 'starting';
  
  botProcess = spawn('node', ['bot.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      RENDER: 'true' // Signal to bot that it's running on Render
    }
  });
  
  botProcess.on('spawn', () => {
    console.log('✅ Bot process started successfully');
    botStatus = 'running';
  });
  
  botProcess.on('error', (error) => {
    console.error('❌ Bot process error:', error);
    botStatus = 'error';
  });
  
  botProcess.on('exit', (code, signal) => {
    console.log(`🔌 Bot process exited with code ${code}`);
    botStatus = 'stopped';
    
    // Auto-restart bot after 10 seconds
    console.log('🔄 Restarting bot in 10 seconds...');
    setTimeout(startBot, 10000);
  });
}

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Health server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log('==============================================');
  
  // Start the bot after server is running
  startBot();
});
