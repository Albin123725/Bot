const express = require('express');
const { exec } = require('child_process');
const path = require('path');

// --- 1. RENDER WEB SERVER SETUP (Health Check) ---
const app = express();
// Use the port provided by Render environment, or 3000 as a fallback
const PORT = process.env.PORT || 3000; 

// Simple endpoint for Render to confirm the service is running
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
    // Execute bot.js as a child process
    const botProcess = exec(`node ${botScriptPath}`);

    botProcess.stdout.on('data', (data) => {
        // Output all bot logs to the console
        console.log(`[BOT-LOG]: ${data.toString().trim()}`);
    });

    botProcess.stderr.on('data', (data) => {
        // Output all bot errors to the console
        console.error(`[BOT-ERROR]: ${data.toString().trim()}`);
    });

    botProcess.on('close', (code) => {
        // This is called if the bot.js process exits for any reason (crash, external kill)
        console.log(`\n\n🚨 BOT PROCESS EXIT: Bot script closed with code ${code}.`);
        console.log('🔄 Attempting to restart the bot script in 10 seconds...');
        // Automatically restart the bot process if it crashes or exits
        setTimeout(startBot, 10000); 
    });
}

// Start the bot logic immediately
startBot();
