# Minecraft Dual Bot System v2.2.0 🤖

A sophisticated dual bot system that automatically switches between **CraftMan** and **HeroBrine** to maintain 24/7 presence on your Minecraft server with fixed home location management.

## ✨ Key Features

- **🔄 Automatic Bot Cycling** - Switches between CraftMan and HeroBrine every 5-10 minutes
- **🏠 Fixed Home Location** - Both bots always return to a fixed location (217, 11, -525)
- **🌙 Smart Sleeping System** - Automatically sleeps at night, finds/places beds automatically
- **🎯 Human-Like Activities** - Explores, builds, and idles near home during daytime
- **⚔️ Connection Resilience** - Handles ECONNRESET errors and automatically reconnects
- **🛡️ Null Safety** - Complete protection against disconnection-related crashes
- **💤 Sleep State Management** - Proper cleanup and state reset on disconnects
- **📍 Auto Spawnpoint Setting** - Sets spawn location at home

## 🚀 Quick Start

### Installation

1. Clone or create your project directory:
```bash
git clone <your-repo-url>
cd minecraft-dual-bot
npm install
```

2. Create `.env` file (or use `.env.example` as template):
```bash
cp .env.example .env
```

3. Edit `.env` with your settings:
```env
MINECRAFT_HOST=gameplannet.aternos.me
MINECRAFT_PORT=51270
MINECRAFT_VERSION=1.21.10
MINECRAFT_AUTH=offline
CRAFTMAN_USERNAME=CraftMan
HEROBRINE_USERNAME=HeroBrine
PORT=10000
```

### Running

```bash
npm start
```

Or for development:
```bash
node server.js
```

## 🔧 Configuration

### Home Location
The fixed home location is hardcoded in `bot.js` line 35:
```javascript
const FIXED_HOME_LOCATION = new Vec3(217, 11, -525);
```

To change it, edit these coordinates to your desired location.

### Bot Timing
- **Bot Switch Interval**: 5-10 minutes (randomized) - Line 175 in `bot.js`
- **Night Sleep Check**: Every game cycle checks for night time (13000-23000)
- **Dusk Detection**: Starts around in-game time 12000

### Server Configuration
Edit `server.js` to change:
- **PORT**: Default 10000 (can be overridden with `PORT` env var)
- **Health check endpoint**: `/health`
- **Status endpoint**: `/`

## 📋 File Structure

```
.
├── bot.js              # Main bot system (core logic)
├── server.js           # Express server with health checks
├── package.json        # Dependencies
├── .env.example        # Example environment variables
└── README.md          # This file
```

## 🐛 Fixed Issues (v2.2.0)

- ✅ **ECONNRESET Errors** - Added error handler that catches connection resets
- ✅ **Null Reference Errors** - Added `isBotConnected()` checks everywhere
- ✅ **Sleep Crashes** - All pathfinder calls now protected with null checks
- ✅ **Race Conditions** - Proper state cleanup when bot disconnects
- ✅ **Race Conditions** - Proper state management between bot switches

## 📊 Activity System

### Daytime Activities
1. **Explore** (60% chance) - Bot explores 2-4 random locations around home
2. **Build** (20% chance) - Bot performs building actions
3. **Idle** (20% chance) - Bot idles for 3-8 seconds

### Night Behavior
- Automatically returns home at dusk
- Attempts to find existing bed
- Places new bed if none found
- Sleeps until morning
- Resumes activities when woken

## 🔌 Connection Management

The bot system now includes:
- **Automatic Reconnection** - Handles throttling and ECONNRESET
- **Graceful Degradation** - Operations continue even if pathfinder unavailable
- **State Reset** - Cleans up sleep/processing states on disconnect
- **Error Recovery** - Catches and handles all connection errors

## 📡 Health Check

Check if the bot system is running:
```bash
curl http://localhost:10000/health
```

Response:
```json
{
  "status": "ok",
  "message": "Minecraft Dual Bot System - Connection Stable",
  "port": 10000,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

## 🎮 Bot Behaviors

### CraftMan
- Focus: Exploration and building
- Gamemode: Can be in creative or survival
- Special: Auto-maintains creative mode when available

### HeroBrine
- Focus: Presence and survival
- Can engage in combat
- Defensive capabilities against hostile mobs

Both bots:
- Share the same home location
- Alternate every 5-10 minutes
- Auto-sleep at night
- Perform anti-AFK actions

## ⚙️ Troubleshooting

### Bot keeps disconnecting
- Check Minecraft server is online and accessible
- Verify host/port in `.env`
- Check server auth mode (offline vs online)

### Bot not sleeping
- Ensure bed exists at home location or bot can place one
- Check player has spawn permission for `/spawnpoint` command
- Verify it's actually night time (in-game time 13000+)

### "Cannot read properties of null" errors
- This should be fixed in v2.2.0
- If still occurring, check bot.js line 98 `isBotConnected()` function

### ECONNRESET errors
- Normal on Aternos - bot will auto-reconnect
- Check logs for successful reconnection

## 📝 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| MINECRAFT_HOST | gameplannet.aternos.me | Server hostname/IP |
| MINECRAFT_PORT | 51270 | Server port |
| MINECRAFT_VERSION | 1.21.10 | Minecraft version |
| MINECRAFT_AUTH | offline | Auth mode (offline/online) |
| CRAFTMAN_USERNAME | CraftMan | First bot username |
| HEROBRINE_USERNAME | HeroBrine | Second bot username |
| PORT | 10000 | Express server port |

## 🔐 Security Notes

- Store sensitive credentials in `.env` file
- Never commit `.env` to git (add to `.gitignore`)
- Bot authentication is set to "offline" (works on cracked servers)
- For online mode, modify auth setting in bot.js

## 🆘 Support

For issues:
1. Check logs for error messages
2. Verify `.env` configuration
3. Check bot connection status at `/health` endpoint
4. Ensure Minecraft server is online

## 📦 Dependencies

- **mineflayer** ^4.25.0 - Minecraft bot framework
- **mineflayer-pathfinder** ^2.4.5 - Pathfinding plugin
- **minecraft-data** ^3.100.0 - Game data
- **prismarine-item** ^1.17.0 - Item handling
- **vec3** ^0.1.7 - Vector math
- **express** ^4.21.2 - Web server

## 📄 License

MIT

## 🎯 Version History

### v2.2.0 (Current)
- Fixed ECONNRESET handling
- Added connection checks before all operations
- Fixed null reference errors in sleep system
- Added error event handler
- Improved state cleanup

### v2.1.0
- Initial dual bot system
- Home location management
- Sleep system
- Activity system

---

**Maintain your server presence 24/7!** 🚀
