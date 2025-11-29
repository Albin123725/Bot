const express = require('express');
const { exec } = require('child_process');
const path = require('path');

// --- 1. RENDER WEB SERVER SETUP (Health Check) ---
const app = express();
const PORT = process.env.PORT || 3000; 

app.get('/', (req, res) => {
    res.status(200).send('Minecraft Dual Bot System is Running!');
});

app.listen(PORT, () => {
    console.log(`✅ Web Server running and bound to port ${PORT} (Required for Render).`);
});

// --- 2. BOT SUPERVISOR SETUP ---
const botScriptPath = path.join(__dirname, 'bot.js');

function startBot() {
    console.log(`\n🤖 Starting the main bot script: ${botScriptPath}`);
    const botProcess = exec(`node ${botScriptPath}`);

    botProcess.stdout.on('data', (data) => {
        console.log(`[BOT-LOG]: ${data.toString().trim()}`);
    });

    botProcess.stderr.on('data', (data) => {
        console.error(`[BOT-ERROR]: ${data.toString().trim()}`);
    });

    botProcess.on('close', (code) => {
        console.log(`\n\n🚨 BOT PROCESS EXIT: Bot script closed with code ${code}.`);
        console.log('🔄 Attempting to restart the bot script in 10 seconds...');
        setTimeout(startBot, 10000); 
    });
}

startBot();
