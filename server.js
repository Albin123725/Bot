const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Minecraft Dual Bot System',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Minecraft Dual Bot System is running!',
    endpoints: {
      health: '/health'
    }
  });
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Health server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log('==============================================');
  console.log('🤖 Starting Minecraft bots...');
  
  // Import and start the bot system after server is running
  require('./bot.js');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
