const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");

console.log("🎮 Minecraft Dual Bot System with Fixed Home Location");
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

// FIXED HOME LOCATION
const FIXED_HOME_LOCATION = new Vec3(217, 11, -525);

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
    homeLocation: FIXED_HOME_LOCATION,
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
    homeLocation: FIXED_HOME_LOCATION,
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
function setHomeLocation() {
  const state = getCurrentBotState();
  if (state) {
    state.homeLocation = FIXED_HOME_LOCATION.clone();
    console.log(`🏠 HOME LOCATION SET TO: (217, 11, -525)`);
    
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
  if (!state || state.isGoingHome || state.isSleeping) return;
  
  state.isGoingHome = true;
  state.isProcessing = true;
  
  console.log("🏠 Returning to home location...");
  
  try {
    const home = FIXED_HOME_LOCATION;
    const currentPos = currentBot.entity.position;
    const distance = currentPos.distanceTo(home);
    
    console.log(`  📍 Current position: (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)})`);
    console.log(`  🎯 Home position: (${home.x}, ${home.y}, ${home.z})`);
    console.log(`  📏 Distance: ${distance.toFixed(1)} blocks`);
    
    const goal = new goals.GoalNear(home.x, home.y, home.z, 2);
    currentBot.pathfinder.setGoal(goal);
    
    // Wait until arrived or timeout
    await waitForArrival(home.x, home.y, home.z, 3, 30000);
    
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
  
  if (isDusk() || isNightTime()) {
    console.log("🌙 Night/Dusk detected - going home to sleep...");
    await goHome();
    await delay(2000);
    await tryToSleep();
  }
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  try {
    state.isSleeping = state.isProcessing = true;
    currentBot.pathfinder.setGoal(null);

    console.log("😴 Attempting to sleep...");

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
    let bedBlock = currentBot.findBlock({
      matching: (block) => bedNames.includes(block.name),
      maxDistance: 10,
      point: FIXED_HOME_LOCATION
    });

    if (bedBlock) {
      console.log(`  ✅ Found bed at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
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
        console.log("  ✅ Successfully sleeping...");
        state.hasBed = true;

        currentBot.once("wake", () => {
          console.log("  ☀️  Good morning! Woke up refreshed");
          state.isSleeping = false;
          state.isProcessing = false;
          setTimeout(() => startHumanLikeActivity(), 2000);
        });
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep in bed: ${sleepError.message}`);
      }
    }

    // No bed found, try to place one at home
    console.log("  🛏️  No bed found, placing one at home...");
    
    // Get creative mode bed
    if (isCreativeMode()) {
      try {
        // Force creative mode first
        currentBot.chat("/gamemode creative");
        await delay(2000);
        
        // Get bed from creative inventory
        await getItemFromCreativeInventory("red_bed", 1);
        await delay(1000);
      } catch (error) {
        console.log("  ⚠️  Could not get creative mode bed");
      }
    }

    const bedItem = await ensureBedInInventory();
    
    if (bedItem) {
      await currentBot.equip(bedItem, "hand");
      
      // Try to place bed at home location
      const directions = [
        { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, 
        { dx: 0, dz: 1 }, { dx: 0, dz: -1 }
      ];

      for (const dir of directions) {
        const refPos = new Vec3(FIXED_HOME_LOCATION.x + dir.dx, FIXED_HOME_LOCATION.y - 1, FIXED_HOME_LOCATION.z + dir.dz);
        const refBlock = currentBot.blockAt(refPos);
        const bedPos = new Vec3(FIXED_HOME_LOCATION.x + dir.dx, FIXED_HOME_LOCATION.y, FIXED_HOME_LOCATION.z + dir.dz);
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
              console.log(`  ✅ Successfully placed bed at (${bedPos.x}, ${bedPos.y}, ${bedPos.z})`);
              
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
      console.log("  ❌ No bed available in inventory");
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
function isCreativeMode() {
  return currentBot?.player?.gamemode === 1;
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode() || !Item) return null;

  try {
    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) {
      console.log(`  ⚠️  Item '${itemName}' not found`);
      return null;
    }

    const targetSlot = 36;
    const item = new Item(itemId, count, null);
    
    await currentBot.creative.setInventorySlot(targetSlot, item);
    await delay(800);

    const slotItem = currentBot.inventory.slots[targetSlot];
    if (slotItem && slotItem.name === itemName) {
      console.log(`  ✅ [Creative] Got ${count}x ${itemName}`);
      return slotItem;
    }
    
    return null;
  } catch (error) {
    console.log(`  ⚠️  Failed to get ${itemName}: ${error.message}`);
    return null;
  }
}

async function ensureBedInInventory() {
  const bedNames = ["red_bed", "blue_bed", "white_bed", "black_bed"];
  const existingBed = currentBot.inventory.items().find(item => bedNames.includes(item.name));
  if (existingBed) {
    console.log("  ✅ Bed found in inventory");
    return existingBed;
  }
  return null;
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

// IMMEDIATE SLEEP FUNCTION
async function sleepImmediately() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  console.log("🌙 IMMEDIATE SLEEP COMMAND - Going home to sleep...");
  
  // Go home first
  await goHome();
  await delay(2000);
  
  // Then sleep
  await tryToSleep();
}

// Activity system
async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping || state.isGoingHome || state.inCombat || isSwitching) return;
  
  state.isProcessing = true;

  try {
    state.activityCount++;
    
    // Check if it's night time - if so, sleep immediately
    if (isNightTime() || isDusk()) {
      console.log("🌙 Night time detected - sleeping immediately...");
      state.isProcessing = false;
      await sleepImmediately();
      return;
    }

    // Daytime activities
    console.log(`\n🎯 ${currentBotName} Activity #${state.activityCount}`);

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
    state.exploreCenter = FIXED_HOME_LOCATION.clone();
  }

  const numStops = randomDelay(2, 4);
  console.log(`🚶 Exploring ${numStops} locations from home...`);

  for (let i = 0; i < numStops; i++) {
    if (state.inCombat || isSwitching || isDusk() || isNightTime()) {
      console.log("  ⚠️  Stopping exploration (night approaching)");
      return;
    }

    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, 15);
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
  await lookAround();
  await delay(1000);
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
    console.log(`📍 Current position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);

    const state = getCurrentBotState();
    
    // Set fixed home location
    setHomeLocation();
    
    state.exploreCenter = FIXED_HOME_LOCATION.clone();
    state.lastPacketTime = Date.now();

    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    
    const defaultMove = new Movements(currentBot, mcData);
    defaultMove.canDig = false;
    currentBot.pathfinder.setMovements(defaultMove);

    console.log(`🏠 Home system: ACTIVE at (217, 11, -525)`);
    
    setTimeout(() => {
      console.log(`🎮 Starting ${currentBotName}...`);
      
      // CHECK IF IT'S NIGHT TIME - SLEEP IMMEDIATELY IF SO
      if (isNightTime() || isDusk()) {
        console.log("🌙 Current time: NIGHT - Sleeping immediately...");
        sleepImmediately();
      } else {
        console.log("☀️  Current time: DAY - Starting activities...");
        startHumanLikeActivity();
      }
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
    if (state) state.inCombat = false;
  });

  currentBot.on("chat", (username, message) => {
    if (username !== currentBotName) {
      console.log(`💬 <${username}> ${message}`);
    }
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });
}

// Time monitoring
function startTimeMonitoring() {
  setInterval(() => {
    if (currentBot && currentBot.time) {
      const time = currentBot.time.timeOfDay;
      if (time === 12000) console.log("🌅 Noon");
      else if (time === 13000) console.log("🌆 Dusk began - going home");
      else if (time === 18000) console.log("🌙 Full night");
      else if (time === 23000) console.log("🌄 Dawn began"); 
      else if (time === 0) console.log("☀️  Morning");
    }
  }, 30000);
}

// Initialize system
function initializeSystem() {
  console.log('\n' + '='.repeat(50));
  console.log('🏠 FIXED HOME LOCATION SYSTEM');
  console.log('='.repeat(50));
  console.log('📍 Home: (217, 11, -525)');
  console.log('🌙 Behavior: Immediate sleep at night');
  console.log('🎯 Bots will always return to this location');
  console.log('='.repeat(50));
  
  startBotCycle();
  startTimeMonitoring();
}

// Start the system
initializeSystem();

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  if (botSwitchInterval) clearInterval(botSwitchInterval);
  for (const botName of ["CraftMan", "HeroBrine"]) cleanupBot(botName);
  if (currentBot && currentBot.end) currentBot.end("System shutdown");
  process.exit(0);
});
