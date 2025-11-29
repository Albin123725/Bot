const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Minecraft Dual Bot System - Home Location Enabled',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Minecraft Dual Bot System v2.1.0',
    features: [
      'Home location system',
      'Automatic night behavior',
      'Smart bed placement',
      'Auto-spawnpoint setting'
    ]
  });
});

// Start server
console.log('🚀 Starting Minecraft Dual Bot System with Home Location...');
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server started on port:', PORT);
  require('./bot.js');
});
