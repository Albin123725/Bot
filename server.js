const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint - MUST respond quickly
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'minecraft-bot',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Minecraft Dual Bot System',
    status: 'running'
  });
});

// Start server FIRST
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
  console.log('='.repeat(50));
  
  // Start bot AFTER server is confirmed running
  setTimeout(() => {
    console.log('🤖 Starting Minecraft bot system...');
    require('./bot.js');
  }, 1000);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
