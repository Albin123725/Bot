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
  state.gamemodeMonitorInterval = setInterval(ensureCreativeMode, 10000);
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
    if (!itemId) {
      console.log(`  ⚠️  Item ${itemName} not found`);
      return null;
    }

    const item = new Item(itemId, count, null);
    await currentBot.creative.setInventorySlot(36, item);
    await delay(500);
    
    const slotItem = currentBot.inventory.slots[36];
    if (slotItem?.name === itemName) {
      console.log(`  ✅ Got ${count}x ${itemName}`);
      return slotItem;
    }
    return null;
  } catch (error) {
    console.log(`  ⚠️  Failed to get ${itemName}: ${error.message}`);
    return null;
  }
}

async function ensureInventoryItem(itemName, minCount = 1) {
  const existingItem = currentBot.inventory.items().find(item => item.name === itemName);
  if (existingItem?.count >= minCount) {
    return existingItem;
  }

  if (isCreativeMode()) {
    const creativeItem = await getItemFromCreativeInventory(itemName, minCount);
    if (creativeItem) return creativeItem;
  }

  return existingItem || null;
}

async function ensureBedInInventory() {
  const bedNames = ["red_bed", "blue_bed", "white_bed", "black_bed"];
  
  // Check if we already have a bed
  const existingBed = currentBot.inventory.items().find(item => bedNames.includes(item.name));
  if (existingBed) {
    return existingBed;
  }

  // Get a bed from creative inventory
  console.log("  🛏️  Getting bed from creative inventory...");
  return await getItemFromCreativeInventory("red_bed", 1);
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

// Combat functions for HeroBrine
function isHostileMob(entity) {
  if (!entity?.name) return false;
  const hostileMobs = ["zombie", "skeleton", "creeper", "spider", "enderman"];
  return hostileMobs.includes(entity.name);
}

function getNearbyHostileMobs() {
  if (!currentBot?.entities) return [];
  
  return Object.values(currentBot.entities)
    .filter(entity => entity !== currentBot.entity && isHostileMob(entity))
    .map(entity => ({
      entity: entity,
      distance: currentBot.entity.position.distanceTo(entity.position),
      name: entity.name
    }))
    .filter(mob => mob.distance <= 16)
    .sort((a, b) => a.distance - b.distance);
}

async function defendAgainstMobs() {
  const state = getCurrentBotState();
  if (!state || state.inCombat || state.isProcessing) return;
  
  const nearbyMobs = getNearbyHostileMobs();
  if (nearbyMobs.length === 0) return;
  
  state.inCombat = true;
  state.isProcessing = true;
  
  try {
    const target = nearbyMobs[0];
    console.log(`\n⚔️  COMBAT: ${target.name} (${target.distance.toFixed(1)} blocks)`);
    
    const weapon = await ensureInventoryItem("diamond_sword", 1);
    if (weapon) await currentBot.equip(weapon, "hand");
    
    await currentBot.lookAt(target.entity.position.offset(0, target.entity.height * 0.5, 0));
    
    if (target.distance > 3.5) {
      const goal = new goals.GoalNear(target.entity.position.x, target.entity.position.y, target.entity.position.z, 3);
      currentBot.pathfinder.setGoal(goal);
      await delay(1000);
    }
    
    if (target.distance <= 4) {
      await currentBot.attack(target.entity);
      console.log(`  💥 Attacked ${target.name}`);
    }
    
  } catch (error) {
    console.log("  ⚠️  Combat error");
  } finally {
    state.inCombat = false;
    state.isProcessing = false;
    currentBot.pathfinder.setGoal(null);
  }
}

function startCombatMonitoring() {
  const state = getCurrentBotState();
  if (state.combatMonitorInterval) clearInterval(state.combatMonitorInterval);
  state.combatMonitorInterval = setInterval(defendAgainstMobs, 2000);
  console.log("⚔️  Combat monitoring enabled");
}

// Activity system
async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping || state.inCombat) return;
  state.isProcessing = true;

  try {
    state.activityCount++;
    console.log(`\n🎯 ${currentBotName} Activity ${state.activityCount}`);

    if (isNightTime() && !state.isSleeping) {
      state.isProcessing = false;
      await tryToSleep();
      return;
    }

    const activity = randomChoice(["explore", "explore", "build", "idle"]);
    console.log(`🎲 Activity: ${activity}`);

    switch (activity) {
      case "explore": await exploreRandomly(); break;
      case "build": await buildActivity(); break;
      case "idle": await idleActivity(); break;
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
  if (!state.exploreCenter) state.exploreCenter = currentBot.entity.position.clone();

  const numStops = randomDelay(2, 4);
  console.log(`🚶 Exploring ${numStops} locations...`);

  for (let i = 0; i < numStops; i++) {
    if (state.inCombat) return;

    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, 20);
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
  const numBlocks = randomDelay(1, 3);
  console.log(`🏗️  Building ${numBlocks} blocks...`);

  for (let i = 0; i < numBlocks; i++) {
    await placeAndBreakBlock();
    if (i < numBlocks - 1) await delay(randomDelay(2000, 5000));
  }
}

async function idleActivity() {
  const idleTime = randomDelay(3000, 8000);
  console.log(`😴 Idle for ${(idleTime / 1000).toFixed(1)}s...`);
  
  const actions = randomDelay(2, 3);
  for (let i = 0; i < actions; i++) {
    await lookAround();
    await delay(randomDelay(1000, 2000));
  }
}

async function placeAndBreakBlock() {
  const blockType = "dirt";
  const item = await ensureInventoryItem(blockType, 1);
  if (!item) {
    console.log(`  ⚠️  No ${blockType} available`);
    return;
  }

  await currentBot.equip(item, "hand");
  const pos = currentBot.entity.position.floored();

  const directions = [
    { pos: new Vec3(pos.x + 1, pos.y, pos.z), ref: new Vec3(pos.x + 1, pos.y - 1, pos.z), vec: new Vec3(0, 1, 0) },
    { pos: new Vec3(pos.x - 1, pos.y, pos.z), ref: new Vec3(pos.x - 1, pos.y - 1, pos.z), vec: new Vec3(0, 1, 0) },
    { pos: new Vec3(pos.x, pos.y, pos.z + 1), ref: new Vec3(pos.x, pos.y - 1, pos.z + 1), vec: new Vec3(0, 1, 0) },
    { pos: new Vec3(pos.x, pos.y, pos.z - 1), ref: new Vec3(pos.x, pos.y - 1, pos.z - 1), vec: new Vec3(0, 1, 0) },
  ].sort(() => Math.random() - 0.5);

  let placed = false;
  for (const attempt of directions) {
    const targetBlock = currentBot.blockAt(attempt.pos);
    const referenceBlock = currentBot.blockAt(attempt.ref);

    if (targetBlock?.name === "air" && referenceBlock?.name !== "air") {
      try {
        await currentBot.placeBlock(referenceBlock, attempt.vec);
        await delay(1000);
        
        const placedBlock = currentBot.blockAt(attempt.pos);
        if (placedBlock?.name === blockType && currentBot.canDigBlock(placedBlock)) {
          await currentBot.dig(placedBlock);
          console.log("  ✅ Placed and broke block");
          placed = true;
        }
        break;
      } catch (err) {
        // Continue to next direction
      }
    }
  }
  
  if (!placed) {
    console.log("  ⚠️  Could not place block");
  }
}

async function waitForArrival(x, y, z, threshold, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkArrival = setInterval(() => {
      const distance = currentBot.entity.position.distanceTo({ x, y, z });
      const elapsed = Date.now() - startTime;

      if (distance < threshold || elapsed > timeout) {
        clearInterval(checkArrival);
        resolve();
      }
    }, 100);
  });
}

function isNightTime() {
  return currentBot.time?.timeOfDay >= 13000 && currentBot.time?.timeOfDay < 23000;
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  try {
    state.isSleeping = state.isProcessing = true;
    currentBot.pathfinder.setGoal(null);

    console.log("🌙 Night time - attempting to sleep...");

    const bedNames = ["red_bed", "blue_bed", "white_bed", "black_bed"];
    
    // First try to find existing bed
    let bedBlock = currentBot.findBlock({
      matching: (block) => bedNames.includes(block.name),
      maxDistance: 16,
    });

    if (bedBlock) {
      console.log(`  ✅ Found existing bed`);
      const distance = bedBlock.position.distanceTo(currentBot.entity.position);
      if (distance > 3) {
        console.log(`  🚶 Walking to bed (${distance.toFixed(1)} blocks)...`);
        const goal = new goals.GoalBlock(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z);
        currentBot.pathfinder.setGoal(goal);
        await waitForArrival(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 3, 10000);
        currentBot.pathfinder.setGoal(null);
      }
    } else {
      // No bed found, place one
      console.log("  🛏️  No bed found, placing one...");
      const bedItem = await ensureBedInInventory();
      
      if (bedItem) {
        await currentBot.equip(bedItem, "hand");
        const pos = currentBot.entity.position.floored();
        
        // Try to place bed in different directions
        const directions = [
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }
        ];
        
        for (const dir of directions) {
          const refPos = new Vec3(pos.x + dir.dx, pos.y - 1, pos.z + dir.dz);
          const refBlock = currentBot.blockAt(refPos);
          const bedPos = new Vec3(pos.x + dir.dx, pos.y, pos.z + dir.dz);
          const targetBlock = currentBot.blockAt(bedPos);
          
          if (refBlock && refBlock.name !== "air" && targetBlock && targetBlock.name === "air") {
            try {
              await currentBot.placeBlock(refBlock, new Vec3(0, 1, 0));
              await delay(1000);
              
              // Check if bed was placed
              bedBlock = currentBot.findBlock({
                matching: (block) => bedNames.includes(block.name),
                maxDistance: 5,
              });
              
              if (bedBlock) {
                console.log(`  ✅ Bed placed successfully at (${bedPos.x}, ${bedPos.y}, ${bedPos.z})`);
                break;
              }
            } catch (err) {
              console.log(`  ⚠️  Could not place bed at (${bedPos.x}, ${bedPos.y}, ${bedPos.z})`);
            }
          }
        }
      } else {
        console.log("  ⚠️  No bed available in inventory");
      }
    }

    if (bedBlock) {
      console.log("  💤 Attempting to sleep...");
      try {
        await currentBot.sleep(bedBlock);
        console.log("  ✅ Sleeping peacefully...");

        currentBot.once("wake", () => {
          console.log("  ☀️  Good morning!");
          state.isSleeping = state.isProcessing = false;
          setTimeout(startHumanLikeActivity, 2000);
        });
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep: ${sleepError.message}`);
      }
    } else {
      console.log("  ⚠️  No bed available for sleeping");
    }
    
  } catch (error) {
    console.log(`  ⚠️  Sleep setup error: ${error.message}`);
  } finally {
    state.isSleeping = state.isProcessing = false;
    setTimeout(startHumanLikeActivity, 5000);
  }
}

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
if (require.main === module) {
  startBotCycle();
}

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  if (botSwitchInterval) clearInterval(botSwitchInterval);
  for (const botName of ["CraftMan", "HeroBrine"]) cleanupBot(botName);
  if (currentBot) currentBot.quit();
  process.exit(0);
});
