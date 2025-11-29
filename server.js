const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint - MUST be at root level
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'minecraft-dual-bot',
    timestamp: new Date().toISOString(),
    port: PORT,
    message: 'Port binding confirmed'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Minecraft Dual Bot System - ONLINE',
    status: 'operational',
    endpoints: {
      health: '/health',
      status: '/'
    }
  });
});

// Start server with explicit binding
console.log('🚀 STARTING SERVER WITH EXPLICIT PORT BINDING...');
console.log(`📍 Binding to PORT: ${PORT}`);
console.log(`📍 Binding to HOST: 0.0.0.0`);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('✅ SERVER SUCCESSFULLY BOUND TO PORT!');
  console.log('='.repeat(60));
  console.log(`📍 PORT: ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`🔍 Health: http://0.0.0.0:${PORT}/health`);
  console.log('='.repeat(60));
  
  // Start bot system AFTER port confirmation
  console.log('🤖 Initializing Minecraft bot system...');
  try {
    require('./bot.js');
  } catch (error) {
    console.error('❌ Failed to load bot system:', error);
  }
});

// Server error handling
server.on('error', (error) => {
  console.error('💥 SERVER ERROR:', error.message);
  console.error('Error code:', error.code);
  process.exit(1);
});

// Keep server alive with regular logs
setInterval(() => {
  console.log(`💓 Server heartbeat - Port ${PORT} actively listening`);
}, 15000);

console.log('🔧 Server initialization complete');
