const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");

// Initialize OpenAI only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  const OpenAI = require("openai");
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("✨ AI Features: ENABLED");
} else {
  console.log("ℹ️  AI Features: DISABLED (no API key provided)");
}

console.log("🎮 Minecraft Dual Bot System with Fixed Home Location");
console.log("=".repeat(50));

// Bot configurations
const botConfigs = {
  CraftMan: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 34286,
    username: process.env.CRAFTMAN_USERNAME || "CraftMan",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: process.env.MINECRAFT_AUTH || "offline"
  },
  HeroBrine: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 34286,
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

// FIXED HOME LOCATION - Will be set when bot first spawns
let FIXED_HOME_LOCATION = new Vec3(217, 111, -525);

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

function isBotConnected() {
  return currentBot !== null && !currentBot._isEnding;
}

// AI Functions for intelligent bot behavior (gracefully disable if no API key)
async function getAIActivityDecision() {
  if (!openai) {
    return randomChoice(['explore', 'build', 'idle']);
  }
  
  try {
    const state = getCurrentBotState();
    const position = isBotConnected() ? currentBot.entity.position : null;
    const timeOfDay = isBotConnected() ? currentBot.time?.timeOfDay : 0;
    
    const prompt = `You are a Minecraft bot. Based on this context, decide ONE activity to do next. 
Bot: ${currentBotName}
Position: ${position ? `(${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)})` : 'Unknown'}
Time of day: ${timeOfDay} (13000=night, 0=day, 6000=noon)
Activity count: ${state?.activityCount || 0}

Choose exactly ONE activity from this list: explore, build, idle
Respond with ONLY the activity name, nothing else.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 50
    });

    const activity = response.choices[0].message.content.trim().toLowerCase();
    if (['explore', 'build', 'idle'].includes(activity)) {
      return activity;
    }
  } catch (error) {
    // Silently fall back to random
  }
  
  return randomChoice(['explore', 'build', 'idle']);
}

async function getAIChatResponse(username, message) {
  if (!openai) {
    return `Hello ${username}! I'm ${currentBotName}.`;
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are ${currentBotName}, a friendly Minecraft bot. Keep responses SHORT (under 20 words). Be helpful and engaging.`
        },
        { role: "user", content: `${username} says: ${message}` }
      ],
      max_completion_tokens: 100
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    return `Hello ${username}! I'm ${currentBotName}.`;
  }
}

// Home location management
function setHomeLocation() {
  const state = getCurrentBotState();
  if (state && isBotConnected()) {
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
  if (!state || state.isGoingHome || state.isSleeping || !isBotConnected()) return;
  
  state.isGoingHome = true;
  state.isProcessing = true;
  
  console.log("🏠 Returning to home location...");
  
  try {
    if (!isBotConnected()) throw new Error("Bot disconnected");
    
    const home = FIXED_HOME_LOCATION;
    const currentPos = currentBot.entity.position;
    const distance = currentPos.distanceTo(home);
    
    console.log(`  📍 Current position: (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)})`);
    console.log(`  🎯 Home position: (${home.x}, ${home.y}, ${home.z})`);
    console.log(`  📏 Distance: ${distance.toFixed(1)} blocks`);
    
    if (currentBot.pathfinder) {
      const goal = new goals.GoalNear(home.x, home.y, home.z, 2);
      currentBot.pathfinder.setGoal(goal);
      
      // Wait until arrived or timeout
      await waitForArrival(home.x, home.y, home.z, 3, 30000);
      
      if (isBotConnected() && currentBot.pathfinder) {
        currentBot.pathfinder.setGoal(null);
      }
    }
    
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
    if (currentBot && currentBotName && !isSwitching && isBotConnected()) {
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
  
  // Reset sleep/processing state
  state.isSleeping = false;
  state.isProcessing = false;
  state.isGoingHome = false;
}

// Enhanced night detection and sleep system
function isNightTime() {
  if (!isBotConnected() || !currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 13000 && timeOfDay < 23000;
}

function isDusk() {
  if (!isBotConnected() || !currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 12000 && timeOfDay < 13000;
}

async function handleNightTime() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping || state.isGoingHome || state.isProcessing || !isBotConnected()) return;
  
  if (isDusk() || isNightTime()) {
    console.log("🌙 Night/Dusk detected - going home to sleep...");
    await goHome();
    await delay(2000);
    await tryToSleep();
  }
}

// Cleanup function - destroy ALL UNUSED beds in the area
async function cleanupExtraBeds() {
  if (!isBotConnected()) return;
  
  const bedNames = [
    "red_bed", "blue_bed", "white_bed", "black_bed",
    "green_bed", "yellow_bed", "purple_bed", "pink_bed"
  ];

  // Find ALL bed blocks in 20 block radius of home
  const allBedBlocks = [];
  const homeArea = FIXED_HOME_LOCATION;
  
  for (let dx = -20; dx <= 20; dx++) {
    for (let dy = -5; dy <= 5; dy++) {
      for (let dz = -20; dz <= 20; dz++) {
        const checkPos = new Vec3(homeArea.x + dx, homeArea.y + dy, homeArea.z + dz);
        const block = currentBot.blockAt(checkPos);
        
        if (block && bedNames.includes(block.name)) {
          allBedBlocks.push({ pos: checkPos, block: block });
        }
      }
    }
  }

  const totalBedBlocks = allBedBlocks.length;
  if (totalBedBlocks === 0) {
    return; // No beds to clean up
  }

  console.log(`  🧹 Bed cleanup: Found ${totalBedBlocks} bed blocks - destroying all unused beds...`);
  
  // Destroy ALL bed blocks - we'll place a fresh new one
  let destroyedCount = 0;
  for (const bedBlock of allBedBlocks) {
    if (!isBotConnected()) break;
    
    try {
      await currentBot.dig(bedBlock.block);
      console.log(`  🔨 Destroyed bed block at (${bedBlock.pos.x}, ${bedBlock.pos.y}, ${bedBlock.pos.z})`);
      destroyedCount++;
      await delay(150);
    } catch (err) {
      // Continue to next bed
    }
  }
  
  console.log(`  ✅ Cleanup complete - destroyed ${destroyedCount} bed blocks`);
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping || !isBotConnected()) return;

  state.isSleeping = state.isProcessing = true;

  try {
    if (isBotConnected() && currentBot.pathfinder) {
      currentBot.pathfinder.setGoal(null);
    }

    console.log("😴 Attempting to sleep...");
    const botPos = currentBot.entity.position;
    console.log(`  📍 Bot current position: (${botPos.x.toFixed(1)}, ${botPos.y.toFixed(1)}, ${botPos.z.toFixed(1)})`);
    console.log(`  🏠 Home location: (${FIXED_HOME_LOCATION.x}, ${FIXED_HOME_LOCATION.y}, ${FIXED_HOME_LOCATION.z})`);

    // Check if already sleeping
    if (isBotConnected() && currentBot.isSleeping) {
      console.log("  ℹ️  Already sleeping...");
      state.isSleeping = false;
      return;
    }

    const bedNames = [
      "red_bed", "blue_bed", "white_bed", "black_bed",
      "green_bed", "yellow_bed", "purple_bed", "pink_bed"
    ];

    // First cleanup - destroy all extra beds, keep only ONE
    if (!isBotConnected()) throw new Error("Bot disconnected");
    await cleanupExtraBeds();
    await delay(1000);

    // Search for existing beds within 20 blocks from bot's current position
    if (!isBotConnected()) throw new Error("Bot disconnected");
    
    // Find ALL COMPLETE beds in the area (beds have 2 parts - head and foot)
    const allBeds = [];
    const homeArea = FIXED_HOME_LOCATION;
    
    // Scan all blocks in home area to find COMPLETE beds only
    for (let dx = -20; dx <= 20; dx++) {
      for (let dy = -5; dy <= 5; dy++) {
        for (let dz = -20; dz <= 20; dz++) {
          const checkPos = new Vec3(homeArea.x + dx, homeArea.y + dy, homeArea.z + dz);
          const block = currentBot.blockAt(checkPos);
          if (block && bedNames.includes(block.name)) {
            // Check if this is a complete bed (has both head and foot parts)
            const adjacentPositions = [
              new Vec3(checkPos.x + 1, checkPos.y, checkPos.z),
              new Vec3(checkPos.x - 1, checkPos.y, checkPos.z),
              new Vec3(checkPos.x, checkPos.y, checkPos.z + 1),
              new Vec3(checkPos.x, checkPos.y, checkPos.z - 1)
            ];
            
            let hasOtherPart = false;
            for (const adjPos of adjacentPositions) {
              const adjBlock = currentBot.blockAt(adjPos);
              if (adjBlock && adjBlock.name === block.name) {
                hasOtherPart = true;
                break;
              }
            }
            
            // Only add if complete bed found
            if (hasOtherPart) {
              const dist = botPos.distanceTo(checkPos);
              if (dist <= 20) {
                allBeds.push({ pos: checkPos, distance: dist, block: block });
              }
            }
          }
        }
      }
    }

    // If a bed exists (should be only 1 now) - use it
    if (allBeds.length >= 1) {
      allBeds.sort((a, b) => a.distance - b.distance);
      const bedToUse = allBeds[0];
      const bedPos = bedToUse.pos;
      console.log(`  ✅ Using bed at (${bedPos.x}, ${bedPos.y}, ${bedPos.z})`);
      
      try {
        await currentBot.sleep(bedToUse.block);
        console.log("  ✅ Successfully sleeping in bed!");
        state.hasBed = true;

        if (isBotConnected()) {
          currentBot.once("wake", async () => {
            if (isBotConnected()) {
              console.log("  ☀️  Good morning! Woke up refreshed");
              state.isSleeping = false;
              state.isProcessing = false;
              await delay(2000);
              startHumanLikeActivity();
            }
          });
        }
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep: ${sleepError.message}`);
      }
    }
    
    // Single bed found - use it
    let bedBlock = currentBot.findBlock({
      matching: (block) => bedNames.includes(block.name),
      maxDistance: 20
    });

    if (bedBlock) {
      const distToBed = botPos.distanceTo(bedBlock.position);
      console.log(`  ✅ Found bed at distance ${distToBed.toFixed(1)} blocks`);
      console.log(`     Bed position: (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
      
      try {
        await currentBot.sleep(bedBlock);
        console.log("  ✅ Successfully sleeping in found bed!");
        state.hasBed = true;

        if (isBotConnected()) {
          currentBot.once("wake", async () => {
            if (isBotConnected()) {
              console.log("  ☀️  Good morning! Woke up refreshed");
              state.isSleeping = false;
              state.isProcessing = false;
              await delay(2000);
              startHumanLikeActivity();
            }
          });
        }
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep in bed: ${sleepError.message}`);
      }
    }

    // No bed found within 20 blocks - try to place one
    if (!isBotConnected()) throw new Error("Bot disconnected");
    
    console.log("  🛏️  No bed within 20 blocks - attempting to place one at home...");
    
    // Check inventory for bed
    if (!isBotConnected()) throw new Error("Bot disconnected");
    const bedInInventory = currentBot.inventory.items().find(item => bedNames.includes(item.name));
    
    if (bedInInventory) {
      console.log(`  📦 Found ${bedInInventory.name} in inventory`);
      
      // Equip the bed
      await currentBot.equip(bedInInventory, "hand");
      await delay(500);

      // Try to place bed around home area - many attempts
      const directions = [
        // Immediate vicinity
        { dx: 0, dz: 0 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
        { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
        { dx: 1, dz: 1 }, { dx: 1, dz: -1 },
        { dx: -1, dz: 1 }, { dx: -1, dz: -1 },
        // Extended search
        { dx: 2, dz: 0 }, { dx: -2, dz: 0 },
        { dx: 0, dz: 2 }, { dx: 0, dz: -2 }
      ];

      let bedPlaced = false;
      for (const dir of directions) {
        if (!isBotConnected() || bedPlaced) break;
        
        // Try different heights
        for (let dy = -1; dy <= 1; dy++) {
          if (!isBotConnected() || bedPlaced) break;
          
          const placeFromPos = new Vec3(
            Math.round(botPos.x) + dir.dx, 
            Math.round(botPos.y) + dy - 1, 
            Math.round(botPos.z) + dir.dz
          );
          
          const refBlock = currentBot.blockAt(placeFromPos);
          
          // Must be solid block
          if (refBlock && refBlock.name !== "air" && refBlock.name !== "water" && refBlock.name !== "lava") {
            try {
              console.log(`  🔨 Placing bed attempt: height=${dy}...`);
              await currentBot.placeBlock(refBlock, new Vec3(0, 1, 0));
              await delay(500);
              
              if (!isBotConnected()) break;
              
              // Verify bed was placed
              bedBlock = currentBot.findBlock({
                matching: (block) => bedNames.includes(block.name),
                maxDistance: 3,
              });
              
              if (bedBlock) {
                console.log(`  ✅ Bed successfully placed at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
                await delay(200);
                bedPlaced = true;
                
                try {
                  await currentBot.sleep(bedBlock);
                  console.log("  ✅ Successfully sleeping in newly placed bed!");
                  state.hasBed = true;
                  
                  if (isBotConnected()) {
                    currentBot.once("wake", async () => {
                      if (isBotConnected()) {
                        console.log("  ☀️  Good morning! Woke up refreshed");
                        state.isSleeping = false;
                        state.isProcessing = false;
                        await delay(2000);
                        startHumanLikeActivity();
                      }
                    });
                  }
                  return;
                } catch (err) {
                  console.log(`  ⚠️  Sleep failed: ${err.message}`);
                  bedPlaced = true; // Still consider it placed
                }
              }
            } catch (err) {
              // Continue trying
            }
          }
        }
      }
      
      if (bedPlaced) {
        console.log("  ℹ️  Bed was placed but sleeping failed - will retry next time");
      } else {
        console.log("  ❌ Could not place bed - no solid blocks found nearby");
      }
    } else {
      console.log("  ❌ No bed in inventory - cannot place bed");
    }
    
  } catch (error) {
    console.log(`  ⚠️  Sleep error: ${error.message}`);
  } finally {
    state.isSleeping = false;
    state.isProcessing = false;
    console.log("  🌅 Waiting before next attempt...");
    await delay(5000);
    if (isBotConnected()) {
      startHumanLikeActivity();
    }
  }
}

// Core bot functions
function isCreativeMode() {
  return isBotConnected() && currentBot?.player?.gamemode === 1;
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode() || !Item) return null;

  try {
    if (!isBotConnected()) return null;
    
    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) {
      console.log(`  ⚠️  Item '${itemName}' not found`);
      return null;
    }

    const targetSlot = 36;
    const item = new Item(itemId, count, null);
    
    await currentBot.creative.setInventorySlot(targetSlot, item);
    await delay(800);

    if (!isBotConnected()) return null;
    
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
  if (!isBotConnected()) return null;
  
  const bedNames = ["red_bed", "blue_bed", "white_bed", "black_bed"];
  const existingBed = currentBot.inventory.items().find(item => bedNames.includes(item.name));
  if (existingBed) {
    console.log("  ✅ Bed found in inventory");
    return existingBed;
  }
  return null;
}

async function lookAround() {
  if (!isBotConnected() || !currentBot?.entity) return;
  try {
    const yaw = randomFloat(-Math.PI, Math.PI);
    const pitch = randomFloat(-Math.PI / 6, Math.PI / 6);
    await currentBot.look(yaw, pitch, true);
    await delay(randomDelay(300, 800));
  } catch (error) {}
}

async function performRandomAction() {
  if (!isBotConnected() || !currentBot?.entity) return;
  const actions = [
    async () => {
      if (isBotConnected()) {
        currentBot.setControlState("jump", true);
        await delay(randomDelay(100, 300));
        if (isBotConnected()) currentBot.setControlState("jump", false);
      }
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
  if (!state || state.isSleeping || !isBotConnected()) return;

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
  if (!state || state.isProcessing || state.isSleeping || state.isGoingHome || state.inCombat || isSwitching || !isBotConnected()) return;
  
  // Check if it's night time FIRST - if so, sleep immediately
  if (isNightTime() || isDusk()) {
    console.log("🌙 Night time detected - sleeping immediately...");
    await sleepImmediately();
    return;
  }
  
  state.isProcessing = true;

  try {
    state.activityCount++;

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
  if (!state || !isBotConnected()) return;
  
  if (!state.exploreCenter) {
    state.exploreCenter = FIXED_HOME_LOCATION.clone();
  }

  const numStops = randomDelay(2, 4);
  console.log(`🚶 Exploring ${numStops} locations from home...`);

  for (let i = 0; i < numStops; i++) {
    if (state.inCombat || isSwitching || isDusk() || isNightTime() || !isBotConnected()) {
      console.log("  ⚠️  Stopping exploration (night approaching or bot disconnected)");
      return;
    }

    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, 15);
    const targetX = state.exploreCenter.x + Math.cos(angle) * distance;
    const targetZ = state.exploreCenter.z + Math.sin(angle) * distance;

    console.log(`  → Location ${i + 1}/${numStops}`);
    
    if (isBotConnected() && currentBot.pathfinder) {
      const goal = new goals.GoalNear(targetX, state.exploreCenter.y, targetZ, 2);
      currentBot.pathfinder.setGoal(goal);

      await waitForArrival(targetX, state.exploreCenter.y, targetZ, 3, 10000);
      
      if (isBotConnected() && currentBot.pathfinder) {
        currentBot.pathfinder.setGoal(null);
      }
    }

    if (shouldDoActivity(0.6)) await lookAround();
    await delay(randomDelay(1000, 3000));
  }
}

async function buildActivity() {
  if (!isBotConnected()) return;
  console.log("🏗️  Building near home...");
  await lookAround();
  await delay(1000);
}

async function idleActivity() {
  if (!isBotConnected()) return;
  const idleTime = randomDelay(3000, 8000);
  console.log(`😴 Idling for ${(idleTime / 1000).toFixed(1)}s near home...`);
  
  const actions = randomDelay(2, 3);
  for (let i = 0; i < actions; i++) {
    if (!isBotConnected()) return;
    await lookAround();
    await delay(randomDelay(1000, 2000));
  }
}

async function waitForArrival(x, y, z, threshold, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkArrival = setInterval(() => {
      if (isSwitching || !isBotConnected()) {
        clearInterval(checkArrival);
        resolve();
        return;
      }
      
      try {
        const distance = currentBot.entity.position.distanceTo({ x, y, z });
        const elapsed = Date.now() - startTime;

        if (distance < threshold || elapsed > timeout) {
          clearInterval(checkArrival);
          resolve();
        }
      } catch (error) {
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
    console.log(`📍 Bot Spawn Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
    
    // Auto-detect home location Y coordinate from bot's spawn position (ground level)
    FIXED_HOME_LOCATION = new Vec3(217, Math.round(pos.y), -525);
    console.log(`📍 Home Location (auto-detected Y): (${FIXED_HOME_LOCATION.x}, ${FIXED_HOME_LOCATION.y}, ${FIXED_HOME_LOCATION.z})`);

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
    
    setImmediate(() => {
      console.log(`🎮 Starting ${currentBotName}...`);
      
      // CHECK IF IT'S NIGHT TIME - SLEEP IMMEDIATELY IF SO
      if (isNightTime() || isDusk()) {
        console.log("🌙 Current time: NIGHT - Sleeping immediately...");
        sleepImmediately();
      } else {
        console.log("☀️  Current time: DAY - Starting activities...");
        startHumanLikeActivity();
      }
    });
  });

  currentBot.on("packet", () => {
    const state = getCurrentBotState();
    if (state) state.lastPacketTime = Date.now();
  });

  currentBot.on("end", () => {
    console.log(`🔌 ${currentBotName} disconnected - INSTANT SWITCH`);
    switchBot();
  });

  currentBot.on("error", (error) => {
    if (error.code === "ECONNRESET") {
      console.log(`⚠️  ${currentBotName} connection reset - INSTANT SWITCH`);
      switchBot();
    } else {
      console.log(`⚠️  ${currentBotName} error: ${error.message}`);
    }
  });

  currentBot.on("kicked", (reason) => {
    console.log(`⚠️  ${currentBotName} kicked:`, reason);
    switchBot();
  });

  currentBot.on("death", () => {
    console.log(`💀 ${currentBotName} died! Respawning at home...`);
    const state = getCurrentBotState();
    if (state) state.inCombat = false;
  });

  currentBot.on("chat", async (username, message) => {
    if (username !== currentBotName) {
      console.log(`💬 <${username}> ${message}`);
      
      // Get AI response to chat (if enabled)
      if (openai) {
        try {
          const aiResponse = await getAIChatResponse(username, message);
          await delay(500);
          if (isBotConnected()) {
            currentBot.chat(aiResponse);
            console.log(`🤖 <${currentBotName}> ${aiResponse}`);
          }
        } catch (err) {
          // Silent fail
        }
      }
    }
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });
}

// Continuous night time monitoring
function startNightMonitoring() {
  setInterval(() => {
    if (!isBotConnected()) return;
    
    const state = getCurrentBotState();
    if (!state || state.isSleeping || state.isProcessing) return;
    
    const time = currentBot.time?.timeOfDay;
    if (time) {
      // Check for dusk/night
      if ((isDusk() || isNightTime()) && !state.isSleeping) {
        console.log(`🌙 Night detected (time: ${time}) - initiating sleep...`);
        sleepImmediately();
      }
    }
  }, 5000); // Check every 5 seconds
}

// Time monitoring
function startTimeMonitoring() {
  setInterval(() => {
    if (isBotConnected() && currentBot.time) {
      const time = currentBot.time.timeOfDay;
      if (time === 12000) console.log("🌅 Noon");
      else if (time === 13000) console.log("🌆 Dusk began - going home to sleep");
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
  startNightMonitoring(); // Continuous night check
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
