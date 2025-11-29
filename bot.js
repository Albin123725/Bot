const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");

// Bot configurations
const botConfigs = {
  CraftMan: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: process.env.CRAFTMAN_USERNAME || "CraftMan",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: process.env.MINECRAFT_AUTH || "offline"
  },
  HeroBrine: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: process.env.HEROBRINE_USERNAME || "HeroBrine",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: process.env.MINECRAFT_AUTH || "offline"
  }
};

console.log("🤖 Starting Minecraft Dual Bot System");
console.log(`📍 Server: ${botConfigs.CraftMan.host}:${botConfigs.CraftMan.port}`);
console.log(`👥 Bots: ${botConfigs.CraftMan.username} & ${botConfigs.HeroBrine.username}`);
console.log('==============================================');

// Global variables
let currentBot = null;
let currentBotName = null;
let mcData = null;
let Item = null;
let botSwitchInterval = null;
let lastGamemodeSwitch = 0;

// Bot state management
const botStates = {
  CraftMan: {
    isProcessing: false,
    isSleeping: false,
    lastActivityTime: Date.now(),
    activityCount: 0,
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false,
    lastPacketTime: Date.now()
  },
  HeroBrine: {
    isProcessing: false,
    isSleeping: false,
    lastActivityTime: Date.now(),
    activityCount: 0,
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    combatMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false,
    currentTarget: null,
    lastPacketTime: Date.now()
  }
};

// Utility functions
function randomDelay(min = 500, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shouldDoActivity(probability = 0.3) {
  return Math.random() < probability;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentBotState() {
  return currentBotName ? botStates[currentBotName] : null;
}

// Bot management functions
function startBotCycle() {
  console.log("🔄 Starting bot cycle management...");
  switchToBot("CraftMan");
  
  botSwitchInterval = setInterval(() => {
    if (currentBot && currentBotName) {
      console.log(`\n🔄 Scheduled bot switch triggered...`);
      switchBot();
    }
  }, randomDelay(180000, 360000));
}

function switchToBot(botName) {
  if (currentBot) {
    console.log(`🔌 Disconnecting ${currentBotName}...`);
    cleanupBot(currentBotName);
    currentBot.quit();
    currentBot = null;
  }
  
  console.log(`\n🎮 ===== SWITCHING TO ${botName} =====`);
  currentBotName = botName;
  currentBot = mineflayer.createBot(botConfigs[botName]);
  setupBotHandlers();
}

function switchBot() {
  const nextBot = currentBotName === "CraftMan" ? "HeroBrine" : "CraftMan";
  switchToBot(nextBot);
}

function cleanupBot(botName) {
  const state = botStates[botName];
  if (!state) return;
  
  [state.antiAFKInterval, state.gamemodeMonitorInterval, state.combatMonitorInterval, state.keepAliveInterval]
    .forEach(interval => interval && clearInterval(interval));
}

// Core bot functions
function isCreativeMode() {
  return currentBot?.player?.gamemode === 1;
}

async function ensureCreativeMode() {
  if (!currentBot?.player) return;
  
  // Prevent spam - only switch every 30 seconds
  const now = Date.now();
  if (now - lastGamemodeSwitch < 30000) return;
  
  if (currentBot.player.gamemode !== 1) {
    console.log("⚠️  Switching to Creative mode...");
    try {
      currentBot.chat("/gamemode creative");
      lastGamemodeSwitch = now;
      await delay(2000);
    } catch (error) {
      console.log("  ⚠️  Failed to switch gamemode - may need OP permissions");
    }
  }
}

function startGamemodeMonitoring() {
  const state = getCurrentBotState();
  if (state.gamemodeMonitorInterval) clearInterval(state.gamemodeMonitorInterval);
  state.gamemodeMonitorInterval = setInterval(ensureCreativeMode, 10000); // Check every 10 seconds
  console.log("🎮 Gamemode monitoring enabled");
}

function startKeepAliveMonitoring() {
  const state = getCurrentBotState();
  if (state.keepAliveInterval) clearInterval(state.keepAliveInterval);
  state.keepAliveInterval = setInterval(() => {
    if (currentBot?.entity) {
      currentBot.setControlState("jump", true);
      setTimeout(() => currentBot.setControlState("jump", false), 100);
    }
  }, 15000);
  console.log("💓 Keep-alive monitoring enabled");
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode() || !Item) return null;

  try {
    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) return null;

    const item = new Item(itemId, count, null);
    await currentBot.creative.setInventorySlot(36, item);
    await delay(500);
    
    const slotItem = currentBot.inventory.slots[36];
    return slotItem?.name === itemName ? slotItem : null;
  } catch (error) {
    return null;
  }
}

async function ensureInventoryItem(itemName, minCount = 1) {
  const existingItem = currentBot.inventory.items().find(item => item.name === itemName);
  if (existingItem?.count >= minCount) return existingItem;

  if (isCreativeMode()) {
    const creativeItem = await getItemFromCreativeInventory(itemName, minCount);
    if (creativeItem) return creativeItem;
  }

  return existingItem || null;
}

async function lookAround() {
  if (!currentBot?.entity) return;
  try {
    const yaw = randomFloat(-Math.PI, Math.PI);
    const pitch = randomFloat(-Math.PI / 6, Math.PI / 6);
    await currentBot.look(yaw, pitch, true);
    await delay(randomDelay(300, 800));
  } catch (error) {}
}

async function performRandomAction() {
  if (!currentBot?.entity) return;

  const actions = [
    async () => {
      currentBot.setControlState("jump", true);
      await delay(randomDelay(100, 300));
      currentBot.setControlState("jump", false);
    },
    async () => {
      currentBot.setControlState("sneak", true);
      await delay(randomDelay(500, 1500));
      currentBot.setControlState("sneak", false);
    },
    async () => {
      await lookAround();
      await delay(randomDelay(200, 600));
      await lookAround();
    }
  ];

  try {
    await randomChoice(actions)();
  } catch (error) {}
}

async function antiAFK() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping) return;
  
  const timeSinceLastActivity = Date.now() - state.lastActivityTime;
  if (timeSinceLastActivity > randomDelay(15000, 45000)) {
    console.log("💭 Performing anti-AFK action...");
    await performRandomAction();
    state.lastActivityTime = Date.now();
  }
}

function startAntiAFKMonitoring() {
  const state = getCurrentBotState();
  if (state.antiAFKInterval) clearInterval(state.antiAFKInterval);
  state.antiAFKInterval = setInterval(antiAFK, 8000);
  console.log("🛡️  Anti-AFK monitoring enabled");
}

// Activity system (rest of the bot.js remains the same as previous version)
// ... [Include all the activity functions from the previous bot.js version]

// Event handlers
function setupBotHandlers() {
  currentBot.loadPlugin(pathfinder);

  currentBot.on("spawn", () => {
    console.log(`✅ ${currentBotName} spawned!`);
    const pos = currentBot.entity.position;
    console.log(`📍 Position: X=${pos.x.toFixed(1)}, Y=${pos.y.toFixed(1)}, Z=${pos.z.toFixed(1)}`);

    const state = getCurrentBotState();
    state.exploreCenter = pos.clone();
    state.lastPacketTime = Date.now();

    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    
    const defaultMove = new Movements(currentBot, mcData);
    defaultMove.canDig = false;
    currentBot.pathfinder.setMovements(defaultMove);

    setTimeout(() => {
      console.log(`🎮 Starting ${currentBotName}...\n`);
      startAntiAFKMonitoring();
      startKeepAliveMonitoring();
      
      if (currentBotName === "CraftMan") startGamemodeMonitoring();
      else if (currentBotName === "HeroBrine") startCombatMonitoring();
      
      startHumanLikeActivity();
    }, 3000);
  });

  currentBot.on("packet", () => {
    const state = getCurrentBotState();
    if (state) state.lastPacketTime = Date.now();
  });

  currentBot.on("end", () => {
    console.log(`🔌 ${currentBotName} disconnected`);
    setTimeout(switchBot, 5000);
  });

  currentBot.on("kicked", (reason) => {
    console.log(`⚠️  ${currentBotName} kicked:`, reason);
    setTimeout(switchBot, 5000);
  });

  currentBot.on("death", () => {
    console.log(`💀 ${currentBotName} died!`);
    const state = getCurrentBotState();
    if (state) state.exploreCenter = null;
  });

  currentBot.on("chat", (username, message) => {
    console.log(`💬 <${username}> ${message}`);
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });

  currentBot.on("physicsTick", () => {
    if (shouldDoActivity(0.002)) lookAround().catch(() => {});
  });
}

// Initialize
startBotCycle();

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  if (botSwitchInterval) clearInterval(botSwitchInterval);
  for (const botName of ["CraftMan", "HeroBrine"]) cleanupBot(botName);
  if (currentBot) currentBot.quit();
  process.exit(0);
});
