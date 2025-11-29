const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");

console.log("🎮 Minecraft Dual Bot System with Home Location");
console.log("=".repeat(50));

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

// Global variables
let currentBot = null;
let currentBotName = null;
let mcData = null;
let Item = null;
let botSwitchInterval = null;
let isSwitching = false;

// Home location (will be set when bot spawns)
let homeLocation = null;

// Bot state management
const botStates = {
  CraftMan: {
    isProcessing: false,
    isSleeping: false,
    isGoingHome: false,
    lastActivityTime: Date.now(),
    activityCount: 0,
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false,
    lastPacketTime: Date.now(),
    homeLocation: null,
    hasBed: false
  },
  HeroBrine: {
    isProcessing: false,
    isSleeping: false,
    isGoingHome: false,
    lastActivityTime: Date.now(),
    activityCount: 0,
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    combatMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false,
    currentTarget: null,
    lastPacketTime: Date.now(),
    homeLocation: null,
    hasBed: false
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

// Home location management
function setHomeLocation(position) {
  const state = getCurrentBotState();
  if (state && position) {
    state.homeLocation = position.clone();
    homeLocation = position.clone();
    console.log(`🏠 Home location set to: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
    
    // Set spawnpoint at home location
    try {
      currentBot.chat("/spawnpoint");
      console.log("📍 Spawnpoint set to home location");
    } catch (error) {
      console.log("⚠️  Could not set spawnpoint - may need OP permissions");
    }
  }
}

async function goHome() {
  const state = getCurrentBotState();
  if (!state || !state.homeLocation || state.isGoingHome || state.isSleeping) return;
  
  state.isGoingHome = true;
  state.isProcessing = true;
  
  console.log("🌙 Night is coming - returning home...");
  
  try {
    const home = state.homeLocation;
    const distance = currentBot.entity.position.distanceTo(home);
    
    console.log(`  🏠 Going home (${distance.toFixed(1)} blocks away)...`);
    
    const goal = new goals.GoalNear(home.x, home.y, home.z, 2);
    currentBot.pathfinder.setGoal(goal);
    
    // Wait until arrived or timeout
    await waitForArrival(home.x, home.y, home.z, 3, 20000);
    
    currentBot.pathfinder.setGoal(null);
    console.log("  ✅ Arrived at home location");
    
    // Look around home area
    await lookAround();
    await delay(1000);
    
  } catch (error) {
    console.log("  ⚠️  Error going home:", error.message);
  } finally {
    state.isGoingHome = false;
    state.isProcessing = false;
  }
}

// Bot management functions
function startBotCycle() {
  console.log("🔄 Starting bot cycle management...");
  switchToBot("CraftMan");
  
  botSwitchInterval = setInterval(() => {
    if (currentBot && currentBotName && !isSwitching) {
      console.log(`\n🔄 Scheduled bot switch triggered...`);
      switchBot();
    }
  }, randomDelay(300000, 600000));
}

function switchToBot(botName) {
  if (isSwitching) return;
  isSwitching = true;
  
  if (currentBot) {
    console.log(`🔌 Disconnecting ${currentBotName}...`);
    cleanupBot(currentBotName);
    
    try {
      if (currentBot.end) {
        currentBot.end("Bot switch");
      }
    } catch (error) {
      console.log(`  ⚠️  Error disconnecting: ${error.message}`);
    }
    currentBot = null;
  }
  
  console.log(`\n🎮 Switching to ${botName}...`);
  currentBotName = botName;
  
  setTimeout(() => {
    try {
      currentBot = mineflayer.createBot(botConfigs[botName]);
      setupBotHandlers();
      isSwitching = false;
    } catch (error) {
      console.log(`❌ Failed to create ${botName}: ${error.message}`);
      isSwitching = false;
      setTimeout(() => switchToBot(botName === "CraftMan" ? "HeroBrine" : "CraftMan"), 10000);
    }
  }, 5000);
}

function switchBot() {
  if (isSwitching) return;
  const nextBot = currentBotName === "CraftMan" ? "HeroBrine" : "CraftMan";
  switchToBot(nextBot);
}

function cleanupBot(botName) {
  const state = botStates[botName];
  if (!state) return;
  
  [state.antiAFKInterval, state.gamemodeMonitorInterval, state.combatMonitorInterval, state.keepAliveInterval]
    .forEach(interval => interval && clearInterval(interval));
}

// Enhanced night detection and sleep system
function isNightTime() {
  if (!currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 13000 && timeOfDay < 23000;
}

function isDusk() {
  if (!currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 12000 && timeOfDay < 13000;
}

async function handleNightTime() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping || state.isGoingHome || state.isProcessing) return;
  
  if (isDusk()) {
    console.log("🌅 Dusk is approaching...");
    // Start heading home when dusk begins
    await goHome();
  } else if (isNightTime() && !state.isSleeping) {
    console.log("🌙 Night time - preparing to sleep...");
    await tryToSleep();
  }
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  try {
    state.isSleeping = state.isProcessing = true;
    currentBot.pathfinder.setGoal(null);

    console.log("😴 Attempting to sleep for the night...");

    // Check if already sleeping
    if (currentBot.isSleeping) {
      console.log("  ℹ️  Already sleeping...");
      return;
    }

    const bedNames = [
      "red_bed", "blue_bed", "white_bed", "black_bed",
      "green_bed", "yellow_bed", "purple_bed", "pink_bed"
    ];

    // First, try to find existing bed at home
    let bedBlock = null;
    if (state.homeLocation) {
      bedBlock = currentBot.findBlock({
        matching: (block) => bedNames.includes(block.name),
        maxDistance: 10, // Search around home area
        point: state.homeLocation
      });
    }

    if (bedBlock) {
      console.log(`  ✅ Found bed near home at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
      const distance = currentBot.entity.position.distanceTo(bedBlock.position);
      
      if (distance > 3) {
        console.log(`  🚶 Moving to bed (${distance.toFixed(1)} blocks)...`);
        const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);
        currentBot.pathfinder.setGoal(goal);
        await waitForArrival(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 3, 10000);
        currentBot.pathfinder.setGoal(null);
      }

      console.log("  💤 Getting into bed...");
      try {
        await currentBot.sleep(bedBlock);
        console.log("  ✅ Successfully sleeping through the night...");
        state.hasBed = true;

        currentBot.once("wake", () => {
          console.log("  ☀️  Good morning! Woke up refreshed");
          state.isSleeping = false;
          state.isProcessing = false;
          // Resume activities after waking
          setTimeout(() => startHumanLikeActivity(), 2000);
        });
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep in bed: ${sleepError.message}`);
      }
    }

    // No bed found, try to place one at home
    console.log("  🛏️  No bed found, placing one at home...");
    const bedItem = await ensureBedInInventory();
    
    if (bedItem && state.homeLocation) {
      await currentBot.equip(bedItem, "hand");
      const homePos = state.homeLocation;
      
      // Try to place bed around home location
      const directions = [
        { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, 
        { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
        { dx: 2, dz: 0 }, { dx: -2, dz: 0 },
        { dx: 0, dz: 2 }, { dx: 0, dz: -2 }
      ];

      for (const dir of directions) {
        const refPos = new Vec3(homePos.x + dir.dx, homePos.y - 1, homePos.z + dir.dz);
        const refBlock = currentBot.blockAt(refPos);
        const bedPos = new Vec3(homePos.x + dir.dx, homePos.y, homePos.z + dir.dz);
        const targetBlock = currentBot.blockAt(bedPos);
        
        if (refBlock && refBlock.name !== "air" && targetBlock && targetBlock.name === "air") {
          try {
            await currentBot.placeBlock(refBlock, new Vec3(0, 1, 0));
            await delay(1000);
            
            // Verify bed placement
            bedBlock = currentBot.findBlock({
              matching: (block) => bedNames.includes(block.name),
              maxDistance: 5,
            });
            
            if (bedBlock) {
              console.log(`  ✅ Successfully placed bed at home (${bedPos.x}, ${bedPos.y}, ${bedPos.z})`);
              
              try {
                await currentBot.sleep(bedBlock);
                console.log("  ✅ Sleeping in newly placed bed...");
                state.hasBed = true;
                
                currentBot.once("wake", () => {
                  console.log("  ☀️  Good morning! Woke up in placed bed");
                  state.isSleeping = false;
                  state.isProcessing = false;
                  setTimeout(() => startHumanLikeActivity(), 2000);
                });
                return;
              } catch (err) {
                console.log(`  ⚠️  Could not sleep in new bed: ${err.message}`);
              }
            }
          } catch (err) {
            // Continue to next position
          }
        }
      }
      console.log("  ❌ Could not place bed around home");
    } else {
      console.log("  ❌ No bed available or no home location");
    }
    
  } catch (error) {
    console.log(`  ⚠️  Sleep error: ${error.message}`);
  } finally {
    state.isSleeping = false;
    state.isProcessing = false;
    console.log("  🌅 Continuing activities...");
    setTimeout(() => startHumanLikeActivity(), 5000);
  }
}

// Core bot functions
async function ensureBedInInventory() {
  const bedNames = ["red_bed", "blue_bed", "white_bed", "black_bed"];
  const existingBed = currentBot.inventory.items().find(item => bedNames.includes(item.name));
  if (existingBed) return existingBed;

  if (isCreativeMode()) {
    console.log("  🎨 Getting bed from creative inventory...");
    // Creative mode item acquisition would go here
  }
  return null;
}

function isCreativeMode() {
  return currentBot?.player?.gamemode === 1;
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
      await lookAround();
      await delay(randomDelay(200, 600));
      await lookAround();
    }
  ];
  try {
    await randomChoice(actions)();
  } catch (error) {}
}

// Activity system
async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping || state.isGoingHome || state.inCombat || isSwitching) return;
  
  state.isProcessing = true;

  try {
    state.activityCount++;
    
    // Check time of day first
    if (isDusk() || isNightTime()) {
      console.log("🌙 Daytime ending - handling night routine...");
      state.isProcessing = false;
      await handleNightTime();
      return;
    }

    // Daytime activities
    console.log(`\n🎯 ${currentBotName} Activity #${state.activityCount} (Daytime)`);

    const activity = randomChoice(["explore", "explore", "build", "idle"]);
    console.log(`🎲 Activity: ${activity}`);

    switch (activity) {
      case "explore": 
        await exploreRandomly();
        break;
      case "build": 
        await buildActivity();
        break;
      case "idle": 
        await idleActivity();
        break;
    }

    await delay(randomDelay(2000, 8000));
    state.lastActivityTime = Date.now();
    state.isProcessing = false;

    setImmediate(startHumanLikeActivity);
    
  } catch (error) {
    console.error("⚠️  Activity error:", error.message);
    state.isProcessing = false;
    setTimeout(startHumanLikeActivity, randomDelay(5000, 10000));
  }
}

async function exploreRandomly() {
  const state = getCurrentBotState();
  if (!state.exploreCenter) {
    // Set explore center to home location if available
    state.exploreCenter = state.homeLocation ? state.homeLocation.clone() : currentBot.entity.position.clone();
  }

  const numStops = randomDelay(2, 4);
  console.log(`🚶 Exploring ${numStops} locations from home...`);

  for (let i = 0; i < numStops; i++) {
    if (state.inCombat || isSwitching || isDusk()) {
      console.log("  ⚠️  Stopping exploration (dusk/night approaching)");
      return;
    }

    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, 15); // Stay closer to home
    const targetX = state.exploreCenter.x + Math.cos(angle) * distance;
    const targetZ = state.exploreCenter.z + Math.sin(angle) * distance;

    console.log(`  → Location ${i + 1}/${numStops}`);
    const goal = new goals.GoalNear(targetX, state.exploreCenter.y, targetZ, 2);
    currentBot.pathfinder.setGoal(goal);

    await waitForArrival(targetX, state.exploreCenter.y, targetZ, 3, 10000);
    currentBot.pathfinder.setGoal(null);

    if (shouldDoActivity(0.6)) await lookAround();
    await delay(randomDelay(1000, 3000));
  }
}

async function buildActivity() {
  console.log("🏗️  Building near home...");
  await placeAndBreakBlock();
}

async function idleActivity() {
  const idleTime = randomDelay(3000, 8000);
  console.log(`😴 Idling for ${(idleTime / 1000).toFixed(1)}s near home...`);
  
  const actions = randomDelay(2, 3);
  for (let i = 0; i < actions; i++) {
    await lookAround();
    await delay(randomDelay(1000, 2000));
  }
}

async function placeAndBreakBlock() {
  // Simple block placement near home
  await lookAround();
  await delay(1000);
}

async function waitForArrival(x, y, z, threshold, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkArrival = setInterval(() => {
      if (isSwitching) {
        clearInterval(checkArrival);
        resolve();
        return;
      }
      
      const distance = currentBot.entity.position.distanceTo({ x, y, z });
      const elapsed = Date.now() - startTime;

      if (distance < threshold || elapsed > timeout) {
        clearInterval(checkArrival);
        resolve();
      }
    }, 100);
  });
}

// Event handlers
function setupBotHandlers() {
  currentBot.loadPlugin(pathfinder);

  currentBot.on("spawn", () => {
    console.log(`\n✅ ${currentBotName} spawned!`);
    const pos = currentBot.entity.position;
    console.log(`📍 Position: X=${pos.x.toFixed(1)}, Y=${pos.y.toFixed(1)}, Z=${pos.z.toFixed(1)}`);

    const state = getCurrentBotState();
    
    // Set home location on first spawn
    if (!state.homeLocation) {
      setHomeLocation(pos);
    }
    
    state.exploreCenter = state.homeLocation ? state.homeLocation.clone() : pos.clone();
    state.lastPacketTime = Date.now();

    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    
    const defaultMove = new Movements(currentBot, mcData);
    defaultMove.canDig = false;
    currentBot.pathfinder.setMovements(defaultMove);

    console.log(`🏠 Home system: ${state.homeLocation ? 'ACTIVE' : 'SET'}`);
    
    setTimeout(() => {
      console.log(`🎮 Starting ${currentBotName} with home location system...`);
      startHumanLikeActivity();
    }, 3000);
  });

  currentBot.on("packet", () => {
    const state = getCurrentBotState();
    if (state) state.lastPacketTime = Date.now();
  });

  currentBot.on("end", () => {
    console.log(`🔌 ${currentBotName} disconnected`);
    setTimeout(() => switchBot(), 5000);
  });

  currentBot.on("kicked", (reason) => {
    console.log(`⚠️  ${currentBotName} kicked:`, reason);
    setTimeout(() => switchBot(), 5000);
  });

  currentBot.on("death", () => {
    console.log(`💀 ${currentBotName} died! Respawning at home...`);
    const state = getCurrentBotState();
    if (state) {
      state.inCombat = false;
      state.deaths = (state.deaths || 0) + 1;
    }
  });

  currentBot.on("chat", (username, message) => {
    if (username !== currentBotName) {
      console.log(`💬 <${username}> ${message}`);
    }
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });
}

// Time monitoring for night/day cycles
function startTimeMonitoring() {
  setInterval(() => {
    if (currentBot && currentBot.time) {
      const time = currentBot.time.timeOfDay;
      if (time === 12000) {
        console.log("🌅 Noon reached");
      } else if (time === 13000) {
        console.log("🌆 Dusk began");
      } else if (time === 18000) {
        console.log("🌙 Full night");
      } else if (time === 23000) {
        console.log("🌄 Dawn began"); 
      } else if (time === 0) {
        console.log("☀️  Morning reached");
      }
    }
  }, 30000); // Check every 30 seconds
}

// Initialize system
function initializeSystem() {
  console.log('\n' + '='.repeat(50));
  console.log('🏠 MINECRAFT DUAL BOT - HOME LOCATION SYSTEM');
  console.log('='.repeat(50));
  console.log('✨ Night Behavior:');
  console.log('  • Auto-return home at dusk');
  console.log('  • Automatic bed placement');
  console.log('  • Sleep through night');
  console.log('  • Resume activities at dawn');
  console.log('='.repeat(50));
  
  startBotCycle();
  startTimeMonitoring();
}

// Start the system
initializeSystem();

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down home location system...");
  if (botSwitchInterval) clearInterval(botSwitchInterval);
  for (const botName of ["CraftMan", "HeroBrine"]) cleanupBot(botName);
  if (currentBot && currentBot.end) currentBot.end("System shutdown");
  process.exit(0);
});
