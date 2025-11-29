const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Health server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log('==============================================');
  console.log('🤖 Bot system will start automatically...');
});
