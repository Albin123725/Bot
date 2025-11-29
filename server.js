const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  res.status(200).json({ 
    status: 'healthy', 
    service: 'Minecraft Dual Bot System',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    memory: {
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
    },
    endpoints: {
      health: '/health',
      status: '/status',
      switch: '/switch-bot'
    }
  });
});

// Status endpoint with bot information
app.get('/status', (req, res) => {
  res.json({
    service: 'Minecraft Dual Bot System',
    status: 'operational',
    features: [
      'Auto bot switching',
      'Creative mode management',
      'Combat system',
      'Anti-AFK protection',
      'Smart sleeping',
      '24/7 server presence'
    ],
    bots: {
      CraftMan: 'Creative building & exploration',
      HeroBrine: 'Combat & survival activities'
    },
    server: {
      host: process.env.MINECRAFT_HOST || 'gameplannet.aternos.me',
      port: process.env.MINECRAFT_PORT || 51270
    }
  });
});

// Manual bot switching endpoint
app.get('/switch-bot', (req, res) => {
  res.json({
    message: 'Bot switch endpoint - use bot internal switching',
    note: 'Bots auto-switch every 5-10 minutes'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎮 Minecraft Dual Bot System v2.0.0',
    description: 'Advanced dual bot system maintaining 24/7 presence on your Minecraft server',
    endpoints: {
      health: '/health - System health check',
      status: '/status - Bot system status',
      docs: 'https://github.com/your-repo/docs'
    },
    bots: [
      {
        name: 'CraftMan',
        role: 'Creative Specialist',
        features: ['Auto creative mode', 'Building', 'Exploration', 'Item management']
      },
      {
        name: 'HeroBrine', 
        role: 'Combat Specialist',
        features: ['Mob combat', 'Weapon management', 'Survival activities', 'Defense']
      }
    ]
  });
});

// Start server with enhanced error handling
console.log('🚀 Initializing Minecraft Dual Bot System v2.0.0...');
console.log('📡 Starting HTTP server...');

const server = app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
  
  console.log('='.repeat(60));
  console.log('✅ SERVER SUCCESSFULLY STARTED');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🔍 Health: http://0.0.0.0:${PORT}/health`);
  console.log(`📊 Status: http://0.0.0.0:${PORT}/status`);
  console.log('='.repeat(60));
  console.log('🤖 Starting dual bot system...');
  
  // Import and start bot system after server confirmation
  try {
    require('./bot.js');
    console.log('🎯 Bot system initialized successfully');
  } catch (error) {
    console.error('❌ Failed to start bot system:', error.message);
    process.exit(1);
  }
});

// Enhanced server error handling
server.on('error', (error) => {
  console.error('💥 Server error:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Graceful shutdown handling
const shutdown = (signal) => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🛑 ${signal} received - Initiating graceful shutdown`);
  console.log('='.repeat(50));
  
  server.close(() => {
    console.log('✅ HTTP server closed gracefully');
    console.log('👋 Shutdown complete');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('⏰ Force shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Server keep-alive and monitoring
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  console.log('💓 Server heartbeat -', {
    port: PORT,
    memory: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    uptime: `${Math.floor(process.uptime() / 60)} minutes`
  });
}, 30000);

console.log('🔧 Server setup complete - Ready for bot initialization');
