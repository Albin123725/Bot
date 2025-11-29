const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Minecraft Dual Bot System - Connection Stable',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Minecraft Dual Bot System v2.2.0',
    version: '2.2.0',
    features: [
      'Dual bot cycling (CraftMan & HeroBrine)',
      'Fixed home location system',
      'Automatic night sleeping',
      'Smart bed placement and detection',
      'Auto-spawnpoint setting',
      'Connection reset recovery',
      'Enhanced error handling',
      'Null reference protection'
    ],
    status: 'running'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
console.log('🚀 Starting Minecraft Dual Bot System v2.2.0...');
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server started on port:', PORT);
  console.log('📍 Running bot system...\n');
  require('./bot.js');
});
