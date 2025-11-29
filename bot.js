const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3");

// Bot configurations with enhanced settings
const botConfigs = {
  CraftMan: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: process.env.CRAFTMAN_USERNAME || "CraftMan",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: process.env.MINECRAFT_AUTH || "offline",
    checkTimeoutInterval: 60000,
    keepAlive: true
  },
  HeroBrine: {
    host: process.env.MINECRAFT_HOST || "gameplannet.aternos.me",
    port: parseInt(process.env.MINECRAFT_PORT, 10) || 51270,
    username: process.env.HEROBRINE_USERNAME || "HeroBrine",
    version: process.env.MINECRAFT_VERSION || "1.21.10",
    auth: process.env.MINECRAFT_AUTH || "offline",
    checkTimeoutInterval: 60000,
    keepAlive: true
  }
};

console.log("🎮 Minecraft Dual Bot System v2.0.0");
console.log("=".repeat(50));
console.log(`📍 Server: ${botConfigs.CraftMan.host}:${botConfigs.CraftMan.port}`);
console.log(`🔐 Auth: ${botConfigs.CraftMan.auth}`);
console.log(`👥 Bots: ${botConfigs.CraftMan.username} & ${botConfigs.HeroBrine.username}`);
console.log("=".repeat(50));

// Global variables
let currentBot = null;
let currentBotName = null;
let mcData = null;
let Item = null;
let botSwitchInterval = null;
let lastGamemodeSwitch = 0;
let isSwitching = false;
let systemStartTime = Date.now();

// Enhanced bot state management
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
    lastPacketTime: Date.now(),
    connected: false,
    deaths: 0,
    itemsCollected: 0
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
    lastPacketTime: Date.now(),
    connected: false,
    deaths: 0,
    mobsKilled: 0
  }
};

// Enhanced utility functions
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

function getSystemUptime() {
  const uptime = Date.now() - systemStartTime;
  const hours = Math.floor(uptime / 3600000);
  const minutes = Math.floor((uptime % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

// Bot management functions
function startBotCycle() {
  console.log("🔄 Starting advanced bot cycle management...");
  console.log("⏰ Auto-switch interval: 5-10 minutes");
  switchToBot("CraftMan");
  
  botSwitchInterval = setInterval(() => {
    if (currentBot && currentBotName && !isSwitching) {
      console.log(`\n🔄 Scheduled bot switch triggered...`);
      switchBot();
    }
  }, randomDelay(300000, 600000)); // 5-10 minutes
}

function switchToBot(botName) {
  if (isSwitching) {
    console.log("⚠️  Switch already in progress, skipping...");
    return;
  }
  
  isSwitching = true;
  console.log(`\n🎮 ${'='.repeat(20)} SWITCHING TO ${botName} ${'='.repeat(20)}`);
  
  if (currentBot) {
    console.log(`🔌 Disconnecting ${currentBotName}...`);
    cleanupBot(currentBotName);
    
    try {
      if (currentBot.end) {
        currentBot.end("Bot switch cycle");
        console.log(`✅ ${currentBotName} disconnected successfully`);
      }
    } catch (error) {
      console.log(`⚠️  Error during disconnect: ${error.message}`);
    }
    currentBot = null;
  }
  
  // Prevent duplicate login with delay
  setTimeout(() => {
    try {
      currentBotName = botName;
      currentBot = mineflayer.createBot(botConfigs[botName]);
      setupBotHandlers();
      isSwitching = false;
      
      const state = getCurrentBotState();
      if (state) state.connected = true;
      
    } catch (error) {
      console.log(`❌ Failed to create ${botName}: ${error.message}`);
      isSwitching = false;
      // Retry with different bot
      setTimeout(() => switchToBot(botName === "CraftMan" ? "HeroBrine" : "CraftMan"), 10000);
    }
  }, 5000);
}

function switchBot() {
  if (isSwitching) {
    console.log("⚠️  Switch in progress, skipping...");
    return;
  }
  const nextBot = currentBotName === "CraftMan" ? "HeroBrine" : "CraftMan";
  console.log(`🔄 Switching from ${currentBotName} to ${nextBot}`);
  switchToBot(nextBot);
}

function cleanupBot(botName) {
  const state = botStates[botName];
  if (!state) return;
  
  const intervals = [
    state.antiAFKInterval,
    state.gamemodeMonitorInterval, 
    state.combatMonitorInterval,
    state.keepAliveInterval
  ];
  
  intervals.forEach(interval => {
    if (interval) {
      clearInterval(interval);
    }
  });
  
  state.connected = false;
  console.log(`🧹 Cleaned up ${botName} state`);
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
    console.log("⚠️  Gamemode changed - switching back to Creative...");
    try {
      currentBot.chat("/gamemode creative");
      lastGamemodeSwitch = now;
      await delay(2000);
      
      // Verify switch
      if (currentBot.player.gamemode === 1) {
        console.log("✅ Successfully switched to Creative mode");
      } else {
        console.log("❌ Failed to switch to Creative - may need OP permissions");
      }
    } catch (error) {
      console.log("⚠️  Gamemode switch error:", error.message);
    }
  }
}

function startGamemodeMonitoring() {
  const state = getCurrentBotState();
  if (!state) return;
  
  if (state.gamemodeMonitorInterval) {
    clearInterval(state.gamemodeMonitorInterval);
  }
  
  state.gamemodeMonitorInterval = setInterval(() => {
    ensureCreativeMode().catch(console.error);
  }, 10000);
  
  console.log("🎮 Creative mode monitoring enabled");
}

function startKeepAliveMonitoring() {
  const state = getCurrentBotState();
  if (!state) return;
  
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
  }
  
  state.keepAliveInterval = setInterval(() => {
    if (currentBot?.entity) {
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
  
  console.log("💓 Enhanced keep-alive monitoring enabled");
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode() || !Item) return null;

  try {
    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) {
      console.log(`  ⚠️  Item '${itemName}' not found in registry`);
      return null;
    }

    const targetSlot = 36; // Hotbar slot
    const item = new Item(itemId, count, null);
    
    await currentBot.creative.setInventorySlot(targetSlot, item);
    await delay(800);

    const slotItem = currentBot.inventory.slots[targetSlot];
    if (slotItem && slotItem.name === itemName) {
      console.log(`  ✅ [Creative] Obtained ${count}x ${itemName}`);
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
  if (existingItem && existingItem.count >= minCount) {
    return existingItem;
  }

  if (isCreativeMode()) {
    const neededCount = minCount - (existingItem?.count || 0);
    const creativeItem = await getItemFromCreativeInventory(
      itemName, 
      neededCount > 0 ? neededCount : minCount
    );
    if (creativeItem) return creativeItem;
  }

  return existingItem || null;
}

async function ensureBedInInventory() {
  const bedNames = [
    "red_bed", "blue_bed", "white_bed", "black_bed",
    "green_bed", "yellow_bed", "purple_bed", "pink_bed"
  ];

  const existingBed = currentBot.inventory.items().find(item => 
    bedNames.includes(item.name)
  );
  if (existingBed) {
    return existingBed;
  }

  console.log("  🛏️  Acquiring bed from creative inventory...");
  return await getItemFromCreativeInventory("red_bed", 1);
}

async function lookAround() {
  if (!currentBot?.entity) return;

  try {
    const yaw = randomFloat(-Math.PI, Math.PI);
    const pitch = randomFloat(-Math.PI / 6, Math.PI / 6);
    await currentBot.look(yaw, pitch, true);
    await delay(randomDelay(300, 800));
  } catch (error) {
    // Silent fail for look operations
  }
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
        } catch (e) {
          // Ignore equip errors
        }
      }
    },
    async () => {
      currentBot.swingArm();
      await delay(randomDelay(300, 600));
    }
  ];

  try {
    const action = randomChoice(actions);
    await action();
  } catch (error) {
    // Silent fail for random actions
  }
}

async function antiAFK() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping) return;
  
  const timeSinceLastActivity = Date.now() - state.lastActivityTime;
  const afkThreshold = randomDelay(15000, 45000); // 15-45 seconds

  if (timeSinceLastActivity > afkThreshold) {
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
  console.log("🛡️  Enhanced anti-AFK monitoring enabled (8s checks)");
}

// Enhanced combat functions for HeroBrine
function isHostileMob(entity) {
  if (!entity?.name) return false;
  
  const hostileMobs = [
    "zombie", "skeleton", "creeper", "spider", "enderman",
    "witch", "blaze", "ghast", "slime", "phantom",
    "pillager", "vindicator", "evoker", "ravager"
  ];
  
  return hostileMobs.includes(entity.name);
}

function getNearbyHostileMobs() {
  if (!currentBot?.entities) return [];
  
  const hostileMobs = [];
  const detectionRadius = 16;
  
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
  const weaponPriority = [
    "diamond_sword", "iron_sword", "stone_sword", "wooden_sword"
  ];
  
  for (const weaponName of weaponPriority) {
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
  
  console.log("  ⚠️  No weapons available");
  return null;
}

async function engageCombat(mobEntity) {
  const maxCombatDuration = 30000; // 30 seconds max
  const startTime = Date.now();
  
  while (mobEntity && mobEntity.isValid && !mobEntity.metadata[0]) {
    if (Date.now() - startTime > maxCombatDuration) {
      console.log("  ⏱️  Combat timeout - disengaging");
      break;
    }
    
    const distance = currentBot.entity.position.distanceTo(mobEntity.position);
    
    if (distance > 20) {
      console.log("  🏃 Mob too far - disengaging");
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
    const state = getCurrentBotState();
    if (state) state.mobsKilled++;
  }
}

async function defendAgainstMobs() {
  const state = getCurrentBotState();
  if (!state || state.inCombat || state.isProcessing) return;
  
  const nearbyMobs = getNearbyHostileMobs();
  if (nearbyMobs.length === 0) return;
  
  state.inCombat = true;
  const originalProcessingState = state.isProcessing;
  state.isProcessing = true;
  
  try {
    const target = nearbyMobs[0];
    console.log(`\n⚔️  ${'='.repeat(10)} COMBAT ENGAGED ${'='.repeat(10)}`);
    console.log(`  🎯 Target: ${target.name}`);
    console.log(`  📏 Distance: ${target.distance.toFixed(1)} blocks`);
    console.log(`  👾 Nearby enemies: ${nearbyMobs.length}`);
    console.log('  ' + '='.repeat(30));
    
    const weapon = await equipWeaponFromCreative();
    if (!weapon) {
      console.log("  ⚠️  Cannot engage without weapon");
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
    console.log(`⚔️  ${'='.repeat(10)} COMBAT ENDED ${'='.repeat(10)}\n`);
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
  
  console.log("⚔️  Advanced combat monitoring enabled");
}

// Enhanced activity system
async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (!state || state.isProcessing || state.isSleeping || state.inCombat || isSwitching) return;
  
  state.isProcessing = true;

  try {
    state.activityCount++;
    console.log(`\n🎯 ${currentBotName} Activity Session #${state.activityCount}`);
    console.log('  ' + '─'.repeat(40));

    // Check for night time and sleep
    if (isNightTime() && !state.isSleeping) {
      state.isProcessing = false;
      await tryToSleep();
      return;
    }

    // Weighted activity selection
    const activities = [
      { type: "explore", weight: 3 },
      { type: "explore", weight: 3 },
      { type: "build", weight: 2 },
      { type: "idle", weight: 1 },
      { type: "interact", weight: 1 }
    ];

    const totalWeight = activities.reduce((sum, activity) => sum + activity.weight, 0);
    let random = Math.random() * totalWeight;
    
    let selectedActivity = "explore"; // Default
    for (const activity of activities) {
      random -= activity.weight;
      if (random <= 0) {
        selectedActivity = activity.type;
        break;
      }
    }

    console.log(`🎲 Selected activity: ${selectedActivity}`);

    switch (selectedActivity) {
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

    // Continue activity cycle
    setImmediate(startHumanLikeActivity);
    
  } catch (error) {
    console.error("⚠️  Activity error:", error.message);
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
    if (state.inCombat || isSwitching) {
      console.log("  ⚠️  Interrupted - stopping exploration");
      return;
    }

    const maxDistance = 25;
    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, maxDistance);

    const targetX = state.exploreCenter.x + Math.cos(angle) * distance;
    const targetZ = state.exploreCenter.z + Math.sin(angle) * distance;
    const targetY = state.exploreCenter.y;

    const jitterX = randomFloat(-2, 2);
    const jitterZ = randomFloat(-2, 2);

    const finalX = targetX + jitterX;
    const finalZ = targetZ + jitterZ;

    console.log(
      `  → Location ${i + 1}/${numStops} (${finalX.toFixed(1)}, ${targetY.toFixed(1)}, ${finalZ.toFixed(1)})`
    );

    const tolerance = randomFloat(1.5, 3);
    const goal = new goals.GoalNear(finalX, targetY, finalZ, tolerance);
    currentBot.pathfinder.setGoal(goal);

    const walkingActions = setInterval(() => {
      if (shouldDoActivity(0.15)) {
        currentBot.setControlState("jump", true);
        setTimeout(() => currentBot.setControlState("jump", false), randomDelay(100, 200));
      }
      if (shouldDoActivity(0.1)) {
        lookAround().catch(() => {});
      }
    }, randomDelay(800, 2000));

    await waitForArrival(finalX, targetY, finalZ, tolerance + 2, randomDelay(8000, 15000));
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
  console.log("🏗️  Starting building activity...");

  const numBlocks = randomDelay(1, 4);
  console.log(`  📦 Placing and breaking ${numBlocks} blocks...`);

  for (let i = 0; i < numBlocks; i++) {
    if (isSwitching) return;
    
    await lookAround();
    await delay(randomDelay(300, 800));
    await placeAndBreakBlock();

    if (i < numBlocks - 1) {
      await delay(randomDelay(2000, 5000));
    }
  }
}

async function idleActivity() {
  const idleTime = randomDelay(5000, 12000);
  console.log(`😴 Idling for ${(idleTime / 1000).toFixed(1)} seconds...`);

  const actions = randomDelay(2, 5);
  for (let i = 0; i < actions; i++) {
    if (isSwitching) return;
    
    await lookAround();
    await delay(randomDelay(1000, 3000));

    if (shouldDoActivity(0.4)) {
      await performRandomAction();
    }
  }
}

async function chestActivity() {
  console.log("🗄️  Looking for chests to interact with...");
  
  try {
    const chestNames = ["chest", "trapped_chest"];
    const chestBlock = currentBot.findBlock({
      matching: (block) => chestNames.includes(block.name),
      maxDistance: 32,
    });

    if (!chestBlock) {
      console.log("  ℹ️  No chests found nearby");
      await idleActivity();
      return;
    }

    console.log(`  ✅ Found chest at (${chestBlock.position.x}, ${chestBlock.position.y}, ${chestBlock.position.z})`);
    
    const distance = currentBot.entity.position.distanceTo(chestBlock.position);
    if (distance > 3) {
      const goal = new goals.GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2);
      currentBot.pathfinder.setGoal(goal);
      await waitForArrival(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 3, 10000);
      currentBot.pathfinder.setGoal(null);
    }

    await delay(randomDelay(500, 1000));
    await lookAround();

    const chest = await currentBot.openChest(chestBlock);
    await delay(randomDelay(800, 1500));

    // Simple chest interaction
    if (shouldDoActivity(0.5)) {
      console.log("  📦 Interacting with chest...");
      await delay(randomDelay(1000, 2000));
    }

    chest.close();
    console.log("  🔒 Closed chest");
    
  } catch (error) {
    console.log(`  ⚠️  Chest interaction failed: ${error.message}`);
  }
}

async function placeAndBreakBlock() {
  const blockType = "dirt";
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
          await delay(randomDelay(400, 800));

          const verifyBlock = currentBot.blockAt(attempt.pos);
          if (verifyBlock?.name === blockType) {
            console.log(`  ✅ Placed ${blockType} block`);
            placedBlockPosition = attempt.pos;
            placed = true;
            break;
          }
        } catch (err) {
          // Continue to next direction
        }
      }
    }

    if (!placed) return;

    await delay(randomDelay(1000, 3000));
    await lookAround();

    const placedBlock = currentBot.blockAt(placedBlockPosition);
    if (placedBlock && placedBlock.name !== "air" && currentBot.canDigBlock(placedBlock)) {
      try {
        await currentBot.dig(placedBlock);
        console.log(`  ✅ Broke ${blockType} block`);
      } catch (err) {
        console.log(`  ⚠️  Failed to break block: ${err.message}`);
      }
    }
  } catch (error) {
    console.log(`  ⚠️  Building error: ${error.message}`);
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

function isNightTime() {
  if (!currentBot.time || currentBot.time.timeOfDay === undefined) return false;
  const timeOfDay = currentBot.time.timeOfDay;
  return timeOfDay >= 13000 && timeOfDay < 23000;
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (!state || state.isSleeping) return;

  try {
    state.isSleeping = state.isProcessing = true;
    currentBot.pathfinder.setGoal(null);

    console.log("🌙 Night detected - attempting to sleep...");

    // Check if already sleeping
    if (currentBot.isSleeping) {
      console.log("  ℹ️  Already sleeping, continuing...");
      return;
    }

    const bedNames = [
      "red_bed", "blue_bed", "white_bed", "black_bed",
      "green_bed", "yellow_bed", "purple_bed", "pink_bed"
    ];

    // First, try to find existing bed
    let bedBlock = currentBot.findBlock({
      matching: (block) => bedNames.includes(block.name),
      maxDistance: 16,
    });

    if (bedBlock) {
      console.log(`  ✅ Found existing bed at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
      const distance = bedBlock.position.distanceTo(currentBot.entity.position);
      
      if (distance > 3) {
        console.log(`  🚶 Moving to bed (${distance.toFixed(1)} blocks away)...`);
        const goal = new goals.GoalBlock(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z);
        currentBot.pathfinder.setGoal(goal);
        await waitForArrival(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 3, 10000);
        currentBot.pathfinder.setGoal(null);
      }

      console.log("  💤 Attempting to sleep...");
      try {
        await currentBot.sleep(bedBlock);
        console.log("  ✅ Successfully sleeping... will wake at dawn");

        currentBot.once("wake", () => {
          console.log("  ☀️  Good morning! Woke up naturally");
          const state = getCurrentBotState();
          if (state) {
            state.isSleeping = false;
            state.isProcessing = false;
          }
          setTimeout(() => startHumanLikeActivity(), randomDelay(1000, 3000));
        });
        return;
      } catch (sleepError) {
        console.log(`  ⚠️  Could not sleep in existing bed: ${sleepError.message}`);
      }
    }

    // No bed found, try to place one
    console.log("  🛏️  No bed found, attempting to place one...");
    const bedItem = await ensureBedInInventory();
    
    if (bedItem) {
      await currentBot.equip(bedItem, "hand");
      const pos = currentBot.entity.position.floored();

      // Try different placement positions
      const directions = [
        { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, 
        { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
        { dx: 1, dz: 1 }, { dx: 1, dz: -1 },
        { dx: -1, dz: 1 }, { dx: -1, dz: -1 }
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
                
                currentBot.once("wake", () => {
                  console.log("  ☀️  Good morning! Woke up from placed bed");
                  const state = getCurrentBotState();
                  if (state) {
                    state.isSleeping = false;
                    state.isProcessing = false;
                  }
                  setTimeout(() => startHumanLikeActivity(), randomDelay(1000, 3000));
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
      console.log("  ❌ Could not place bed in any position");
    } else {
      console.log("  ❌ No bed available in inventory");
    }
    
  } catch (error) {
    console.log(`  ⚠️  Sleep setup error: ${error.message}`);
  } finally {
    state.isSleeping = state.isProcessing = false;
    console.log("  🌅 Continuing with normal activities...");
    setTimeout(startHumanLikeActivity, 5000);
  }
}

// Enhanced event handlers
function setupBotHandlers() {
  currentBot.loadPlugin(pathfinder);

  currentBot.on("spawn", () => {
    console.log(`\n✅ ${currentBotName} successfully spawned!`);
    const pos = currentBot.entity.position;
    console.log(`📍 Position: X=${pos.x.toFixed(1)}, Y=${pos.y.toFixed(1)}, Z=${pos.z.toFixed(1)}`);

    const gameMode = currentBot.player.gamemode;
    const gameModeNames = ["Survival", "Creative", "Adventure", "Spectator"];
    console.log(`🎮 Game Mode: ${gameModeNames[gameMode] || gameMode}`);

    const state = getCurrentBotState();
    if (state) {
      state.exploreCenter = pos.clone();
      state.lastPacketTime = Date.now();
      state.connected = true;
    }

    // Initialize Minecraft data
    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    
    const defaultMove = new Movements(currentBot, mcData);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    defaultMove.scafoldingBlocks = [];
    currentBot.pathfinder.setMovements(defaultMove);

    console.log(`🔧 ${currentBotName} initialization complete`);
    
    setTimeout(() => {
      console.log(`\n🎮 ${'='.repeat(15)} STARTING ${currentBotName} ${'='.repeat(15)}`);
      
      // Start monitoring systems
      startAntiAFKMonitoring();
      startKeepAliveMonitoring();
      
      // Start bot-specific systems
      if (currentBotName === "CraftMan") {
        startGamemodeMonitoring();
        console.log("🎯 CraftMan: Creative building & exploration specialist");
      } else if (currentBotName === "HeroBrine") {
        startCombatMonitoring();
        console.log("🎯 HeroBrine: Combat & survival specialist");
      }
      
      console.log('  ' + '='.repeat(40));
      
      // Start activity system
      startHumanLikeActivity();
    }, randomDelay(2000, 5000));
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
    if (!isSwitching) {
      console.log("🔄 Scheduling bot switch due to kick...");
      setTimeout(() => switchBot(), 5000);
    }
  });

  currentBot.on("end", () => {
    console.log(`🔌 ${currentBotName} disconnected`);
    if (!isSwitching) {
      console.log("🔄 Scheduling bot switch due to disconnect...");
      setTimeout(() => switchBot(), 5000);
    }
  });

  currentBot.on("death", () => {
    console.log(`💀 ${currentBotName} died! Respawning...`);
    const state = getCurrentBotState();
    if (state) {
      state.exploreCenter = null;
      state.inCombat = false;
      state.deaths++;
    }
  });

  currentBot.on("chat", (username, message) => {
    if (username !== currentBotName) {
      console.log(`💬 <${username}> ${message}`);
    }
    const state = getCurrentBotState();
    if (state) state.lastActivityTime = Date.now();
  });

  currentBot.on("physicsTick", () => {
    const state = getCurrentBotState();
    if (state && !state.isProcessing && shouldDoActivity(0.002)) {
      lookAround().catch(() => {});
    }
  });

  currentBot.on("sleep", () => {
    console.log("  😴 Bot started sleeping");
  });

  currentBot.on("wake", () => {
    console.log("  ☀️  Bot woke up");
  });
}

// System initialization
function initializeSystem() {
  console.log('\n' + '='.repeat(60));
  console.log('🎮 MINECRAFT DUAL BOT SYSTEM v2.0.0 INITIALIZED');
  console.log('='.repeat(60));
  console.log('✨ Features:');
  console.log('  • Auto bot switching (5-10 minute intervals)');
  console.log('  • Creative mode management (CraftMan)');
  console.log('  • Combat system (HeroBrine)');
  console.log('  • Enhanced anti-AFK protection');
  console.log('  • Smart sleeping system');
  console.log('  • Human-like activities');
  console.log('  • 24/7 server presence');
  console.log('='.repeat(60));
  
  startBotCycle();
}

// Start the system
initializeSystem();

// Enhanced shutdown handling
process.on("SIGINT", () => {
  console.log("\n" + '='.repeat(50));
  console.log("🛑 SYSTEM SHUTDOWN INITIATED");
  console.log('='.repeat(50));
  console.log(`⏰ System uptime: ${getSystemUptime()}`);
  
  if (botSwitchInterval) {
    clearInterval(botSwitchInterval);
    console.log("✅ Bot switch interval cleared");
  }
  
  // Cleanup all bots
  for (const botName of ["CraftMan", "HeroBrine"]) {
    cleanupBot(botName);
    console.log(`✅ ${botName} state cleaned up`);
  }
  
  if (currentBot && currentBot.end) {
    currentBot.end("System shutdown");
    console.log("✅ Current bot disconnected");
  }
  
  console.log("👋 Shutdown complete - Goodbye!");
  console.log('='.repeat(50));
  process.exit(0);
});

// System status monitoring
setInterval(() => {
  const state = getCurrentBotState();
  if (state) {
    console.log(`📊 System Status - ${currentBotName}: ${state.activityCount} activities, Uptime: ${getSystemUptime()}`);
  }
}, 60000); // Every minute
