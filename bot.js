require("dotenv").config();
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");
const fs = require("fs");

let config;
try {
  config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} catch (error) {
  console.error("Error reading config.json:", error.message);
  process.exit(1);
}

// Bot configurations for cracked server
const botConfigs = {
  CraftMan: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: "CraftMan",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: "offline", // Force offline mode for cracked server
    checkTimeoutInterval: 60000,
    keepAlive: true
  },
  HeroBrine: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: "HeroBrine", 
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: "offline", // Force offline mode for cracked server
    checkTimeoutInterval: 60000,
    keepAlive: true
  }
};

console.log("🤖 Starting Dual Bot System for Cracked Server");
console.log(`📍 Server: ${botConfigs.CraftMan.host}:${botConfigs.CraftMan.port}`);
console.log(`🔐 Mode: Cracked/Offline`);
console.log(`👥 Bots: CraftMan & HeroBrine`);
console.log('==============================================');

// [Rest of the bot.js code remains exactly the same as previous version]
// Only the botConfigs object at the top has been modified

// Global variables
let currentBot = null;
let currentBotName = null;
let mcData = null;
let Item = null;
let botSwitchInterval = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

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

function setCurrentBotState(key, value) {
  const state = getCurrentBotState();
  if (state) state[key] = value;
}

// Bot management functions
function startBotCycle() {
  console.log("🔄 Starting bot cycle management...");
  
  // Start with CraftMan first
  switchToBot("CraftMan");
  
  // Set up automatic bot switching every 3-6 minutes
  botSwitchInterval = setInterval(() => {
    if (currentBot && currentBotName) {
      console.log(`\n🔄 Scheduled bot switch triggered...`);
      switchBot();
    }
  }, randomDelay(180000, 360000)); // 3-6 minutes
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
  reconnectAttempts = 0;
}

function switchBot() {
  const nextBot = currentBotName === "CraftMan" ? "HeroBrine" : "CraftMan";
  switchToBot(nextBot);
}

function cleanupBot(botName) {
  const state = botStates[botName];
  if (!state) return;
  
  if (state.antiAFKInterval) {
    clearInterval(state.antiAFKInterval);
    state.antiAFKInterval = null;
  }
  if (state.gamemodeMonitorInterval) {
    clearInterval(state.gamemodeMonitorInterval);
    state.gamemodeMonitorInterval = null;
  }
  if (state.combatMonitorInterval) {
    clearInterval(state.combatMonitorInterval);
    state.combatMonitorInterval = null;
  }
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
    state.keepAliveInterval = null;
  }
}

function attemptReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.log(`❌ Max reconnection attempts reached. Switching bots...`);
    switchBot();
    return;
  }

  reconnectAttempts++;
  console.log(`🔄 Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts} in 5s...`);

  setTimeout(() => {
    cleanupBot(currentBotName);
    currentBot = null;
    switchToBot(currentBotName);
  }, 5000);
}

// ===== CRAFTMAN BOT FUNCTIONS =====
function isCreativeMode() {
  if (!currentBot || !currentBot.player) return false;
  return currentBot.player.gamemode === 1;
}

async function ensureCreativeMode() {
  if (!currentBot || !currentBot.player) return;
  
  const currentGamemode = currentBot.player.gamemode;
  const gameModeNames = ["Survival", "Creative", "Adventure", "Spectator"];
  
  if (currentGamemode !== 1) {
    console.log(`⚠️  Gamemode changed to ${gameModeNames[currentGamemode] || currentGamemode} - switching back to Creative...`);
    try {
      currentBot.chat("/gamemode creative");
      await delay(1000);
      
      let retries = 0;
      while (currentBot.player.gamemode !== 1 && retries < 3) {
        await delay(2000);
        console.log(`  🔄 Gamemode not yet updated, retrying... (${retries + 1}/3)`);
        currentBot.chat("/gamemode creative");
        await delay(1000);
        retries++;
      }
      
      if (currentBot.player.gamemode === 1) {
        console.log("✅ Successfully switched to Creative mode");
      } else {
        console.log("⚠️  Failed to switch to Creative mode - bot may lack permissions");
      }
    } catch (error) {
      console.log(`  ⚠️  Failed to switch gamemode: ${error.message}`);
    }
  }
}

function startGamemodeMonitoring() {
  const state = getCurrentBotState();
  if (state.gamemodeMonitorInterval) {
    clearInterval(state.gamemodeMonitorInterval);
  }
  state.gamemodeMonitorInterval = setInterval(ensureCreativeMode, 5000);
  console.log("🎮 Gamemode monitoring enabled - will auto-maintain Creative mode");
}

function startKeepAliveMonitoring() {
  const state = getCurrentBotState();
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
  }
  state.keepAliveInterval = setInterval(() => {
    const state = getCurrentBotState();
    if (currentBot && currentBot.entity && state) {
      const timeSinceLastPacket = Date.now() - state.lastPacketTime;
      if (timeSinceLastPacket > 30000) {
        currentBot.setControlState("jump", true);
        setTimeout(() => {
          currentBot.setControlState("jump", false);
        }, 100);
        state.lastPacketTime = Date.now();
      }
    }
  }, 15000);
  console.log("💓 Keep-alive monitoring enabled");
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode()) {
    return null;
  }

  if (!Item) {
    console.log(`  ⚠️  [Creative] Item class not initialized yet`);
    return null;
  }

  try {
    console.log(`  🎨 [Creative] Getting ${count}x ${itemName} from creative inventory...`);

    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) {
      console.log(`  ⚠️  Item ${itemName} not found in registry`);
      return null;
    }

    const targetSlot = 36 + Math.floor(Math.random() * 9);
    
    const item = new Item(itemId, count, null);
    await currentBot.creative.setInventorySlot(targetSlot, item);
    await delay(800);

    const slotItem = currentBot.inventory.slots[targetSlot];
    if (slotItem && slotItem.name === itemName) {
      console.log(`  ✅ [Creative] Got ${count}x ${itemName} in slot ${targetSlot}`);
      return slotItem;
    }

    return null;
  } catch (error) {
    console.log(`  ⚠️  [Creative] Failed to get ${itemName}: ${error.message}`);
    return null;
  }
}

async function ensureInventoryItem(itemName, minCount = 1) {
  const existingItem = currentBot.inventory
    .items()
    .find((item) => item.name === itemName);

  if (existingItem && existingItem.count >= minCount) {
    return existingItem;
  }

  if (isCreativeMode()) {
    const neededCount = minCount - (existingItem?.count || 0);
    const creativeItem = await getItemFromCreativeInventory(
      itemName,
      neededCount > 0 ? neededCount : minCount,
    );
    if (creativeItem) {
      return creativeItem;
    }
  }

  return existingItem || null;
}

async function ensureBedInInventory() {
  const bedNames = [
    "red_bed", "blue_bed", "green_bed", "yellow_bed", "white_bed", "black_bed",
    "brown_bed", "cyan_bed", "gray_bed", "light_blue_bed", "light_gray_bed",
    "lime_bed", "magenta_bed", "orange_bed", "pink_bed", "purple_bed",
  ];

  const existingBed = currentBot.inventory
    .items()
    .find((item) => bedNames.some((name) => item.name === name));
  if (existingBed) {
    return existingBed;
  }

  if (isCreativeMode()) {
    return await getItemFromCreativeInventory("red_bed", 1);
  }

  return null;
}

async function lookAround() {
  if (!currentBot || !currentBot.entity) return;

  try {
    const yaw = randomFloat(-Math.PI, Math.PI);
    const pitch = randomFloat(-Math.PI / 6, Math.PI / 6);
    await currentBot.look(yaw, pitch, true);
    await delay(randomDelay(300, 800));
  } catch (error) {
  }
}

async function performRandomAction() {
  if (!currentBot || !currentBot.entity) return;

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
    },
    async () => {
      await delay(randomDelay(1000, 3000));
      await lookAround();
    },
    async () => {
      const items = currentBot.inventory.items();
      if (items.length > 0) {
        const randomItem = randomChoice(items);
        try {
          await currentBot.equip(randomItem, "hand");
          await delay(randomDelay(500, 1200));
        } catch (e) {}
      }
    },
    async () => {
      bot.swingArm();
      await delay(randomDelay(300, 600));
    },
  ];

  try {
    const action = randomChoice(actions);
    await action();
  } catch (error) {
  }
}

async function antiAFK() {
  const state = getCurrentBotState();
  if (!state) return;
  
  const timeSinceLastActivity = Date.now() - state.lastActivityTime;
  const afkThreshold = randomDelay(15000, 45000);

  if (timeSinceLastActivity > afkThreshold && !state.isProcessing && !state.isSleeping) {
    console.log("💭 Performing anti-AFK action...");
    await performRandomAction();
    state.lastActivityTime = Date.now();
  }
}

function startAntiAFKMonitoring() {
  const state = getCurrentBotState();
  if (!state) return;
  
  if (state.antiAFKInterval) {
    clearInterval(state.antiAFKInterval);
  }
  state.antiAFKInterval = setInterval(antiAFK, 8000);
  console.log("🛡️  Enhanced anti-AFK monitoring enabled (8s interval)");
}

// ===== HERO BRINE COMBAT FUNCTIONS =====
function isHostileMob(entity) {
  if (!entity || !entity.name) return false;
  
  const hostileMobs = [
    "zombie", "zombie_villager", "husk", "drowned",
    "skeleton", "stray", "wither_skeleton",
    "creeper", "spider", "cave_spider",
    "enderman", "endermite",
    "witch", "blaze", "ghast",
    "slime", "magma_cube", "silverfish",
    "phantom", "vex", "vindicator", "evoker", "pillager",
    "ravager", "hoglin", "zoglin",
    "zombified_piglin", "piglin", "piglin_brute",
    "guardian", "elder_guardian", "shulker",
    "wither"
  ];
  
  return hostileMobs.includes(entity.name);
}

function getNearbyHostileMobs() {
  if (!currentBot || !currentBot.entities) return [];
  
  const hostileMobs = [];
  const detectionRadius = config.combatSettings?.detectionRadius || 16;
  
  for (const entity of Object.values(currentBot.entities)) {
    if (entity === currentBot.entity) continue;
    
    if (isHostileMob(entity)) {
      const distance = currentBot.entity.position.distanceTo(entity.position);
      if (distance <= detectionRadius) {
        hostileMobs.push({
          entity: entity,
          distance: distance,
          name: entity.name
        });
      }
    }
  }
  
  hostileMobs.sort((a, b) => a.distance - b.distance);
  return hostileMobs;
}

async function equipWeaponFromCreative() {
  const preferredWeapon = config.combatSettings?.preferredWeapon || "diamond_sword";
  const weaponPriority = [preferredWeapon, "diamond_sword", "iron_sword", "stone_sword", "wooden_sword"];
  const uniqueWeapons = [...new Set(weaponPriority)];
  
  for (const weaponName of uniqueWeapons) {
    const weapon = await ensureInventoryItem(weaponName, 1);
    if (weapon) {
      try {
        await currentBot.equip(weapon, "hand");
        console.log(`  ⚔️  Equipped ${weaponName}`);
        return weapon;
      } catch (error) {
        continue;
      }
    }
  }
  
  console.log("  ⚠️  No weapon available");
  return null;
}

async function engageCombat(mobEntity) {
  const maxCombatDuration = 30000;
  const startTime = Date.now();
  
  while (mobEntity && mobEntity.isValid && !mobEntity.metadata[0]) {
    if (Date.now() - startTime > maxCombatDuration) {
      console.log("  ⏱️  Combat timeout");
      break;
    }
    
    const distance = currentBot.entity.position.distanceTo(mobEntity.position);
    
    if (distance > 20) {
      console.log("  🏃 Mob too far, disengaging");
      break;
    }
    
    try {
      await currentBot.lookAt(mobEntity.position.offset(0, mobEntity.height * 0.5, 0));
      
      if (distance > 3.5) {
        const goal = new goals.GoalNear(
          mobEntity.position.x,
          mobEntity.position.y,
          mobEntity.position.z,
          3
        );
        currentBot.pathfinder.setGoal(goal);
        await delay(300);
      } else {
        currentBot.pathfinder.setGoal(null);
        
        try {
          await currentBot.attack(mobEntity);
          console.log(`  💥 Attacked ${mobEntity.name}`);
          await delay(randomDelay(400, 600));
        } catch (error) {
          console.log(`  ⚠️  Attack failed: ${error.message}`);
          break;
        }
      }
      
      await delay(100);
      
    } catch (error) {
      break;
    }
  }
  
  currentBot.pathfinder.setGoal(null);
  
  if (mobEntity && !mobEntity.isValid) {
    console.log(`  ✅ Defeated ${mobEntity.name}!`);
  }
}

async function defendAgainstMobs() {
  if (!config.combatSettings?.enabled) return;
  
  const state = getCurrentBotState();
  if (!state || state.inCombat || state.isProcessing) return;
  
  const nearbyMobs = getNearbyHostileMobs();
  if (nearbyMobs.length === 0) return;
  
  state.inCombat = true;
  const originalProcessingState = state.isProcessing;
  state.isProcessing = true;
  
  try {
    const target = nearbyMobs[0];
    console.log(`\n⚔️  === COMBAT MODE ACTIVATED ===`);
    console.log(`  🎯 Target: ${target.name} (${target.distance.toFixed(1)} blocks away)`);
    console.log(`  👾 Total hostile mobs nearby: ${nearbyMobs.length}`);
    
    const weapon = await equipWeaponFromCreative();
    if (!weapon) {
      console.log("  ⚠️  Cannot fight without weapon");
      state.inCombat = false;
      state.isProcessing = originalProcessingState;
      return;
    }
    
    await engageCombat(target.entity);
    
  } catch (error) {
    console.log(`  ⚠️  Combat error: ${error.message}`);
  } finally {
    state.inCombat = false;
    state.isProcessing = originalProcessingState;
    console.log(`⚔️  === COMBAT MODE ENDED ===\n`);
  }
}

function startCombatMonitoring() {
  const state = getCurrentBotState();
  if (!state) return;
  
  if (state.combatMonitorInterval) {
    clearInterval(state.combatMonitorInterval);
  }
  state.combatMonitorInterval = setInterval(() => {
    defendAgainstMobs().catch(err => {
      console.log(`  ⚠️  Combat monitor error: ${err.message}`);
    });
  }, 2000);
  console.log("⚔️  Combat monitoring enabled - will defend against nearby hostile mobs");
}

// ===== COMMON BOT ACTIVITIES =====
async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping || state.inCombat) return;
  state.isProcessing = true;

  try {
    state.activityCount++;
    console.log(`\n🎯 === ${currentBotName} Activity Session ${state.activityCount} ===`);

    if (config.autoSleep && isNightTime() && !state.isSleeping) {
      state.isProcessing = false;
      await tryToSleep();
      return;
    }

    const activity = randomChoice([
      "explore",
      "explore",
      "explore",
      "build",
      "idle",
      "interact",
    ]);

    console.log(`🎲 Selected activity: ${activity}`);

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
      case "interact":
        await chestActivity();
        break;
    }

    const thinkingTime = randomDelay(2000, 8000);
    console.log(`💭 Taking a ${(thinkingTime / 1000).toFixed(1)}s break...\n`);
    await delay(thinkingTime);

    state.lastActivityTime = Date.now();
    state.isProcessing = false;

    setImmediate(() => startHumanLikeActivity());
  } catch (error) {
    console.error("⚠️  Error in activity:", error.message);
    state.isProcessing = false;
    setTimeout(startHumanLikeActivity, randomDelay(5000, 10000));
  }
}

async function exploreRandomly() {
  const state = getCurrentBotState();
  if (!state) return;
  
  if (!state.exploreCenter) {
    state.exploreCenter = currentBot.entity.position.clone();
  }

  const numStops = randomDelay(2, 6);
  console.log(`🚶 Exploring ${numStops} random locations...`);

  for (let i = 0; i < numStops; i++) {
    if (config.autoSleep && isNightTime() && !state.isSleeping) {
      console.log("🌙 Night detected during exploration");
      return;
    }
    
    if (state.inCombat) {
      console.log("⚔️  Combat detected during exploration");
      return;
    }

    const maxDistance = config.exploreRadius || 20;
    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, maxDistance);

    const targetX = state.exploreCenter.x + Math.cos(angle) * distance;
    const targetZ = state.exploreCenter.z + Math.sin(angle) * distance;
    const targetY = state.exploreCenter.y;

    const jitterX = randomFloat(-1, 1);
    const jitterZ = randomFloat(-1, 1);

    const finalX = targetX + jitterX;
    const finalZ = targetZ + jitterZ;

    console.log(
      `  → Moving to location ${i + 1}/${numStops} (${finalX.toFixed(1)}, ${targetY.toFixed(1)}, ${finalZ.toFixed(1)})`,
    );

    const tolerance = randomFloat(1.5, 3);
    const goal = new goals.GoalNear(finalX, targetY, finalZ, tolerance);
    currentBot.pathfinder.setGoal(goal);

    const walkingActions = setInterval(
      async () => {
        if (shouldDoActivity(0.15)) {
          currentBot.setControlState("jump", true);
          setTimeout(
            () => currentBot.setControlState("jump", false),
            randomDelay(100, 200),
          );
        }
        if (shouldDoActivity(0.1)) {
          lookAround().catch(() => {});
        }
      },
      randomDelay(800, 2000),
    );

    await waitForArrival(
      finalX,
      targetY,
      finalZ,
      tolerance + 2,
      randomDelay(8000, 15000),
    );

    clearInterval(walkingActions);
    currentBot.pathfinder.setGoal(null);
    currentBot.setControlState("jump", false);

    if (shouldDoActivity(0.6)) {
      console.log("  👀 Looking around...");
      await lookAround();
      await delay(randomDelay(500, 2000));
      await lookAround();
    }

    if (shouldDoActivity(0.3)) {
      await performRandomAction();
    }

    await delay(randomDelay(1000, 3000));
  }

  console.log("✅ Exploration complete");
}

async function buildActivity() {
  if (!config.buildingEnabled) {
    console.log("🏗️  Building disabled in config");
    await idleActivity();
    return;
  }

  const numBlocks = randomDelay(1, 3);
  console.log(`🏗️  Placing and breaking ${numBlocks} block(s)...`);

  for (let i = 0; i < numBlocks; i++) {
    await lookAround();
    await delay(randomDelay(300, 800));

    await placeAndBreakBlock();

    if (i < numBlocks - 1) {
      await delay(randomDelay(2000, 5000));
    }
  }
}

async function idleActivity() {
  const idleTime = randomDelay(3000, 10000);
  console.log(`😴 Idle for ${(idleTime / 1000).toFixed(1)}s...`);

  const actions = randomDelay(2, 4);
  for (let i = 0; i < actions; i++) {
    await lookAround();
    await delay(randomDelay(1000, 3000));

    if (shouldDoActivity(0.4)) {
      await performRandomAction();
    }
  }
}

async function chestActivity() {
  if (!config.chestInteraction?.enabled) {
    console.log("🗄️  Chest interaction disabled");
    await idleActivity();
    return;
  }

  console.log("🗄️  Looking for chest...");
  await chestInteraction();
}

async function waitForArrival(x, y, z, threshold, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const state = getCurrentBotState();
    const checkArrival = setInterval(() => {
      if (!state || state.inCombat) {
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

async function placeAndBreakBlock() {
  const blockType = config.blockType || "dirt";
  let placedBlockPosition = null;

  try {
    const item = await ensureInventoryItem(blockType, 1);

    if (!item) {
      console.log(`  ⚠️  No ${blockType} available`);
      return;
    }

    await currentBot.equip(item, "hand");
    await delay(randomDelay(200, 500));

    const pos = currentBot.entity.position.floored();

    const directions = [
      {
        pos: new Vec3(pos.x + 1, pos.y, pos.z),
        ref: new Vec3(pos.x + 1, pos.y - 1, pos.z),
        vec: new Vec3(0, 1, 0),
      },
      {
        pos: new Vec3(pos.x - 1, pos.y, pos.z),
        ref: new Vec3(pos.x - 1, pos.y - 1, pos.z),
        vec: new Vec3(0, 1, 0),
      },
      {
        pos: new Vec3(pos.x, pos.y, pos.z + 1),
        ref: new Vec3(pos.x, pos.y - 1, pos.z + 1),
        vec: new Vec3(0, 1, 0),
      },
      {
        pos: new Vec3(pos.x, pos.y, pos.z - 1),
        ref: new Vec3(pos.x, pos.y - 1, pos.z - 1),
        vec: new Vec3(0, 1, 0),
      },
    ];

    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    let placed = false;
    for (const attempt of directions) {
      const targetBlock = currentBot.blockAt(attempt.pos);
      const referenceBlock = currentBot.blockAt(attempt.ref);

      if (targetBlock?.name === "air" && referenceBlock?.name !== "air") {
        try {
          await currentBot.placeBlock(referenceBlock, attempt.vec);
          await delay(randomDelay(400, 800));

          const verifyBlock = currentBot.blockAt(attempt.pos);
          if (verifyBlock?.name === blockType) {
            console.log(`  ✅ Placed ${blockType} block`);
            placedBlockPosition = attempt.pos;
            placed = true;
            break;
          }
        } catch (err) {
        }
      }
    }

    if (!placed) return;

    await delay(randomDelay(1000, 3000));
    await lookAround();

    const placedBlock = currentBot.blockAt(placedBlockPosition);
    if (
      placedBlock &&
      placedBlock.name !== "air" &&
      currentBot.canDigBlock(placedBlock)
    ) {
      try {
        await currentBot.dig(placedBlock);
        console.log(`  ✅ Broke ${blockType} block`);
      } catch (err) {
        console.log(`  ⚠️  Failed to break: ${err.message}`);
      }
    }
  } catch (error) {
  }
}

async function chestInteraction() {
  if (!config.chestInteraction?.enabled) return;

  try {
    const chestNames = ["chest", "trapped_chest"];
    let chestBlock = currentBot.findBlock({
      matching: (block) => chestNames.includes(block.name),
      maxDistance: 32,
    });

    if (!chestBlock) {
      console.log("  ℹ️  No chest found nearby");
      return;
    }

    console.log(`  ✅ Found chest`);

    const distance = currentBot.entity.position.distanceTo(chestBlock.position);
    if (distance > 3) {
      const goal = new goals.GoalNear(
        chestBlock.position.x,
        chestBlock.position.y,
        chestBlock.position.z,
        2,
      );
      currentBot.pathfinder.setGoal(goal);
      await waitForArrival(
        chestBlock.position.x,
        chestBlock.position.y,
        chestBlock.position.z,
        3,
        10000,
      );
      currentBot.pathfinder.setGoal(null);
    }

    await delay(randomDelay(500, 1000));
    await lookAround();

    const chest = await currentBot.openChest(chestBlock);
    await delay(randomDelay(800, 1500));

    if (config.chestInteraction.depositItems && shouldDoActivity(0.5)) {
      for (const [itemName, count] of Object.entries(
        config.chestInteraction.depositItems,
      )) {
        const items = currentBot.inventory
          .items()
          .filter((item) => item.name.includes(itemName));
        if (items.length > 0) {
          const item = items[0];
          const amount = Math.min(count, item.count);
          await chest.deposit(item.type, null, amount);
          console.log(`  📥 Deposited ${amount}x ${itemName}`);
          await delay(randomDelay(400, 900));
        }
      }
    }

    if (config.chestInteraction.withdrawItems && shouldDoActivity(0.5)) {
      for (const [itemName, count] of Object.entries(
        config.chestInteraction.withdrawItems,
      )) {
        const chestItems = chest
          .containerItems()
          .filter((item) => item.name.includes(itemName));
        if (chestItems.length > 0) {
          const item = chestItems[0];
          const amount = Math.min(count, item.count);
          await chest.withdraw(item.type, null, amount);
          console.log(`  📤 Withdrew ${amount}x ${itemName}`);
          await delay(randomDelay(400, 900));
        }
      }
    }

    await delay(randomDelay(500, 1200));
    chest.close();
    console.log("  🔒 Closed chest");
  } catch (error) {
    console.log(`  ⚠️  Chest error: ${error.message}`);
  }
}

function isNightTime() {
  if (!currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 13000 && timeOfDay < 23000;
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  try {
    state.isSleeping = true;
    state.isProcessing = true;
    currentBot.pathfinder.setGoal(null);

    console.log("🌙 Night time - attempting to sleep...");

    const bedNames = [
      "red_bed", "blue_bed", "green_bed", "yellow_bed", "white_bed", "black_bed",
      "brown_bed", "cyan_bed", "gray_bed", "light_blue_bed", "light_gray_bed",
      "lime_bed", "magenta_bed", "orange_bed", "pink_bed", "purple_bed",
    ];

    const searchRadius = config.bedSearchRadius || 16;
    console.log(`  🔍 Searching for beds within ${searchRadius} blocks...`);
    
    let bedBlock = currentBot.findBlock({
      matching: (block) => bedNames.includes(block.name),
      maxDistance: searchRadius,
    });

    if (bedBlock) {
      const distance = bedBlock.position.distanceTo(currentBot.entity.position);
      console.log(`  ✅ Found bed ${distance.toFixed(1)} blocks away`);
      
      if (distance > 3) {
        const goal = new goals.GoalBlock(
          bedBlock.position.x,
          bedBlock.position.y,
          bedBlock.position.z,
        );
        currentBot.pathfinder.setGoal(goal);
        await waitForArrival(
          bedBlock.position.x,
          bedBlock.position.y,
          bedBlock.position.z,
          3,
          10000,
        );
        currentBot.pathfinder.setGoal(null);
      }

      console.log("  💤 Going to sleep...");

      try {
        await currentBot.sleep(bedBlock);
        console.log("  ✅ Sleeping... will wake at dawn");

        currentBot.once("wake", () => {
          console.log("  ☀️  Good morning!");
          const state = getCurrentBotState();
          if (state) {
            state.isSleeping = false;
            state.isProcessing = false;
          }
          setTimeout(() => startHumanLikeActivity(), randomDelay(1000, 3000));
        });
        return;
      } catch (error) {
        console.log(`  ⚠️  Failed to sleep: ${error.message}`);
      }
    }

    const bedItem = await ensureBedInInventory();

    if (bedItem) {
      console.log("  📦 Placing bed from creative inventory...");
      const pos = currentBot.entity.position.floored();

      const placePositions = [];
      
      for (let dy = 0; dy >= -3; dy--) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (dx === 0 && dz === 0 && dy === 0) continue;
            placePositions.push({
              ref: new Vec3(pos.x + dx, pos.y + dy - 1, pos.z + dz),
              vec: new Vec3(0, 1, 0)
            });
          }
        }
      }

      try {
        await currentBot.equip(bedItem, "hand");
        await delay(randomDelay(300, 600));

        for (const attempt of placePositions) {
          const refBlock = currentBot.blockAt(attempt.ref);
          const targetPos = attempt.ref.offset(0, 1, 0);
          const targetBlock = currentBot.blockAt(targetPos);

          if (refBlock && refBlock.name !== "air" && targetBlock && targetBlock.name === "air") {
            try {
              await currentBot.placeBlock(refBlock, attempt.vec);
              await delay(randomDelay(400, 800));
              
              bedBlock = currentBot.findBlock({
                matching: (block) => bedNames.includes(block.name),
                maxDistance: 5,
              });
              
              if (bedBlock) {
                console.log(`  ✅ Successfully placed bed`);
                
                try {
                  await currentBot.sleep(bedBlock);
                  console.log("  ✅ Sleeping on new bed... will wake at dawn");
                  
                  currentBot.once("wake", () => {
                    console.log("  ☀️  Good morning!");
                    const state = getCurrentBotState();
                    if (state) {
                      state.isSleeping = false;
                      state.isProcessing = false;
                    }
                    setTimeout(() => startHumanLikeActivity(), randomDelay(1000, 3000));
                  });
                  return;
                } catch (err) {
                  console.log(`  ⚠️  Failed to sleep on new bed: ${err.message}`);
                }
              }
            } catch (err) {
              continue;
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️  Bed placement error: ${error.message}`);
      }
    }
    
    console.log("  ⚠️  No bed available");
    state.isSleeping = false;
    state.isProcessing = false;
    setTimeout(startHumanLikeActivity, randomDelay(2000, 5000));
  } catch (error) {
    console.log(`  ⚠️  Sleep error: ${error.message}`);
    const state = getCurrentBotState();
    if (state) {
      state.isSleeping = false;
      state.isProcessing = false;
    }
    setTimeout(startHumanLikeActivity, randomDelay(2000, 5000));
  }
}

// ===== BOT EVENT HANDLERS =====
function setupBotHandlers() {
  currentBot.loadPlugin(pathfinder);

  currentBot.on("spawn", () => {
    console.log(`✅ ${currentBotName} spawned successfully!`);
    if (!currentBot.entity || !currentBot.entity.position) {
      console.log("⚠️  Bot entity not ready yet, waiting...");
      return;
    }
    const spawnPos = currentBot.entity.position;
    console.log(`📍 Position: X=${spawnPos.x.toFixed(1)}, Y=${spawnPos.y.toFixed(1)}, Z=${spawnPos.z.toFixed(1)}`);

    const gameMode = currentBot.player.gamemode;
    const gameModeNames = ["Survival", "Creative", "Adventure", "Spectator"];
    console.log(`🎮 Game Mode: ${gameModeNames[gameMode] || gameMode}`);

    const state = getCurrentBotState();
    if (state) {
      state.exploreCenter = spawnPos.clone();
      state.lastPacketTime = Date.now();
    }

    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    const defaultMove = new Movements(currentBot, mcData);
    defaultMove.canDig = config.canDig !== undefined ? config.canDig : false;
    defaultMove.allow1by1towers = false;
    defaultMove.scafoldingBlocks = [];
    currentBot.pathfinder.setMovements(defaultMove);

    setTimeout(
      () => {
        console.log(`🎮 Starting ${currentBotName} gameplay simulation...\n`);
        
        // Start common features
        startAntiAFKMonitoring();
        startKeepAliveMonitoring();
        
        // Start bot-specific features
        if (currentBotName === "CraftMan") {
          startGamemodeMonitoring();
        } else if (currentBotName === "HeroBrine") {
          startCombatMonitoring();
        }
        
        startHumanLikeActivity();
      },
      randomDelay(2000, 5000),
    );
  });

  currentBot.on("packet", () => {
    const state = getCurrentBotState();
    if (state) state.lastPacketTime = Date.now();
  });

  currentBot.on("error", (err) => {
    console.error(`❌ ${currentBotName} error:`, err.message);
  });

  currentBot.on("kicked", (reason) => {
    console.log(`⚠️  ${currentBotName} was kicked:`, reason);
    console.log("🔄 Switching to other bot...");
    setTimeout(switchBot, 5000);
  });

  currentBot.on("end", () => {
    console.log(`🔌 ${currentBotName} disconnected`);
    console.log("🔄 Switching to other bot...");
    setTimeout(switchBot, 5000);
  });

  currentBot.on("death", () => {
    console.log(`💀 ${currentBotName} died! Respawning...`);
    const state = getCurrentBotState();
    if (state) {
      state.exploreCenter = null;
      state.inCombat = false;
    }
  });

  currentBot.on("chat", (username, message) => {
    console.log(`💬 <${username}> ${message}`);
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });

  currentBot.on("physicsTick", () => {
    const state = getCurrentBotState();
    if (state && !state.isProcessing && shouldDoActivity(0.002)) {
      lookAround().catch(() => {});
    }
  });
}

// ===== INITIALIZATION =====
startBotCycle();

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down dual bot system...");
  if (botSwitchInterval) {
    clearInterval(botSwitchInterval);
  }
  
  // Cleanup all bots
  for (const botName of ["CraftMan", "HeroBrine"]) {
    cleanupBot(botName);
  }
  
  if (currentBot) currentBot.quit();
  process.exit(0);
});

console.log("🚀 Dual Bot System initialized and ready!\n");
