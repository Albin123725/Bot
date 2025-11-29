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

// Bot configurations - Uses environment variables for shared server details
const getBotConfig = (botName) => ({
  host: process.env.MINECRAFT_HOST || "localhost",
  port: parseInt(process.env.MINECRAFT_PORT, 10) || 25565,
  username: botName, // Use the unique bot name as the profile name
  version: process.env.MINECRAFT_VERSION || "1.21.10",
  auth: process.env.MINECRAFT_AUTH || "microsoft",
  profilesFolder: "./auth-cache",
  checkTimeoutInterval: 60000,
  keepAlive: true,
  onMsaCode: (data) => {
    console.log("\n🔐 ===== MICROSOFT AUTHENTICATION REQUIRED =====");
    console.log(`Bot: ${botName}`);
    console.log(`Please open this URL in your browser: ${data.verification_uri}`);
    console.log(`Enter this code: ${data.user_code}`);
    console.log("==============================================\n");
  },
});

console.log("🤖 Starting Dual Bot System: CraftMan & HeroBrine");

// Global variables
let currentBot = null;
let currentBotName = null;
let mcData = null;
let Item = null;
let botActivityInterval = null;

// Bot state management
const botStates = {
  CraftMan: {
    isProcessing: false,
    isSleeping: false,
    lastActivityTime: Date.now(),
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false
  },
  HeroBrine: {
    isProcessing: false,
    isSleeping: false,
    lastActivityTime: Date.now(),
    exploreCenter: null,
    antiAFKInterval: null,
    gamemodeMonitorInterval: null,
    combatMonitorInterval: null,
    keepAliveInterval: null,
    inCombat: false,
    currentTarget: null
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
  return botStates[currentBotName];
}
function isNightTime() {
  if (!currentBot || currentBot.time.skyLight === undefined) return false;
  // Sky light level of 4 or less usually indicates night time
  return currentBot.time.skyLight <= 4;
}

// Bot management functions
function startBotCycle() {
  console.log("🔄 Starting bot cycle management...");
  // Start with CraftMan first
  switchToBot("CraftMan");
}

function switchToBot(botName) {
  if (currentBot) {
    console.log(`🔌 Disconnecting ${currentBotName}...`);
    cleanupBot(currentBotName);
    currentBot.quit(); // Explicitly quit the old bot
    currentBot = null;
  }
  
  console.log(`\n🎮 ===== SWITCHING TO ${botName} =====`);
  currentBotName = botName;
  currentBot = mineflayer.createBot(getBotConfig(botName));
  setupBotHandlers();
}

function switchBot() {
  const nextBot = currentBotName === "CraftMan" ? "HeroBrine" : "CraftMan";
  switchToBot(nextBot);
}

function cleanupBot(botName) {
  const state = botStates[botName];
  if (!state) return;
  
  // Clear all intervals and state trackers
  if (state.antiAFKInterval) clearInterval(state.antiAFKInterval);
  if (state.gamemodeMonitorInterval) clearInterval(state.gamemodeMonitorInterval);
  if (state.combatMonitorInterval) clearInterval(state.combatMonitorInterval);
  if (state.keepAliveInterval) clearInterval(state.keepAliveInterval);
  
  if (botActivityInterval) {
    clearInterval(botActivityInterval);
    botActivityInterval = null;
  }
  
  state.antiAFKInterval = null;
  state.gamemodeMonitorInterval = null;
  state.combatMonitorInterval = null;
  state.keepAliveInterval = null;
  state.isProcessing = false;
  state.inCombat = false;
  state.isSleeping = false;
}

// ===== CORE BOT FEATURES (CraftMan & HeroBrine) =====

// Anti-AFK Logic
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
      currentBot.swingArm();
      await delay(randomDelay(200, 500));
    }
  ];

  try {
    await randomChoice(actions)();
  } catch (error) {
    // Ignore minor errors during AFK actions
  }
}

async function antiAFK() {
  const state = getCurrentBotState();
  const timeSinceLastActivity = Date.now() - state.lastActivityTime;
  const afkThreshold = currentBotName === 'CraftMan' ? randomDelay(15000, 45000) : randomDelay(30000, 120000); 

  if (timeSinceLastActivity > afkThreshold && !state.isProcessing && !state.isSleeping && !state.inCombat) {
    console.log("💭 Performing anti-AFK action...");
    await performRandomAction();
    state.lastActivityTime = Date.now();
  }
}

function startAntiAFKMonitoring() {
  const state = getCurrentBotState();
  if (state.antiAFKInterval) clearInterval(state.antiAFKInterval);
  const interval = currentBotName === 'CraftMan' ? 8000 : 15000; 
  state.antiAFKInterval = setInterval(antiAFK, interval);
  console.log(`🛡️  Anti-AFK monitoring enabled (${interval / 1000}s check)`);
}

function startKeepAliveMonitoring() {
  const state = getCurrentBotState();
  if (state.keepAliveInterval) clearInterval(state.keepAliveInterval);
  state.keepAliveInterval = setInterval(() => {
    if (currentBot && currentBot.entity && !state.isProcessing && !state.isSleeping) {
      currentBot.setControlState("jump", true);
      setTimeout(() => {
        currentBot.setControlState("jump", false);
      }, 100);
    }
  }, 20000); // Pulse every 20 seconds
  console.log("💓 Enhanced keep-alive monitoring enabled");
}

// Creative Mode & Inventory Logic (Mainly CraftMan)
function isCreativeMode() {
  if (!currentBot || !currentBot.player) return false;
  return currentBot.player.gamemode === 1;
}

async function ensureCreativeMode() {
  if (currentBotName !== 'CraftMan') return;
  if (!currentBot || !currentBot.player) return;
  
  if (currentBot.player.gamemode !== 1) {
    console.log(`⚠️  Gamemode changed - switching back to Creative...`);
    try {
      currentBot.chat("/gamemode creative");
      await delay(1000);
      if (currentBot.player.gamemode === 1) {
        console.log("✅ Successfully switched to Creative mode");
      } else {
        console.log("⚠️  Failed to switch to Creative mode - bot may lack OP permissions");
      }
    } catch (error) {
      console.log(`  ⚠️  Failed to switch gamemode: ${error.message}`);
    }
  }
}

function startGamemodeMonitoring() {
  if (currentBotName !== 'CraftMan') return;
  const state = getCurrentBotState();
  if (state.gamemodeMonitorInterval) clearInterval(state.gamemodeMonitorInterval);
  state.gamemodeMonitorInterval = setInterval(ensureCreativeMode, 2000);
  console.log("🎮 Gamemode monitoring enabled (CraftMan)");
}

async function getItemFromCreativeInventory(itemName, count = 1) {
  if (!isCreativeMode() || !Item) return null;

  try {
    const itemId = mcData.itemsByName[itemName]?.id;
    if (!itemId) {
      return null;
    }
    const targetSlot = 36 + Math.floor(Math.random() * 9); 
    const item = new Item(itemId, count, null);
    await currentBot.creative.setInventorySlot(targetSlot, item);
    await delay(500);

    const slotItem = currentBot.inventory.slots[targetSlot];
    if (slotItem && slotItem.name === itemName) {
      return slotItem;
    }
    return null;
  } catch (error) {
    // This function must be robust against the protocol errors that were previously crashing the bot
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

  if (currentBotName === 'CraftMan' && isCreativeMode()) {
    const neededCount = minCount - (existingItem?.count || 0);
    return await getItemFromCreativeInventory(
      itemName,
      neededCount > 0 ? neededCount : minCount,
    );
  }

  return existingItem || null;
}

// ===== HERO BRINE COMBAT FUNCTIONS =====

function isHostileMob(entity) {
  if (!entity || !entity.name) return false;
  const hostileMobs = [
    "zombie", "skeleton", "creeper", "spider", "enderman", "witch", "blaze", "ghast",
    "husk", "drowned", "stray", "wither_skeleton", "phantom", "ravager", "hoglin", 
    "zoglin", "zombified_piglin", "guardian", "elder_guardian", "shulker"
  ];
  return hostileMobs.includes(entity.name);
}

function getNearbyHostileMobs() {
  if (!currentBot || !currentBot.entities) return [];
  
  const hostileMobs = [];
  const detectionRadius = config.combatSettings?.detectionRadius || 16;
  
  for (const entity of Object.values(currentBot.entities)) {
    if (entity === currentBot.entity || entity.type !== 'mob') continue;
    
    if (isHostileMob(entity)) {
      const distance = currentBot.entity.position.distanceTo(entity.position);
      if (distance <= detectionRadius) {
        hostileMobs.push({ entity: entity, distance: distance });
      }
    }
  }
  hostileMobs.sort((a, b) => a.distance - b.distance);
  return hostileMobs.map(m => m.entity);
}

async function equipWeapon() {
  const preferredWeapon = config.combatSettings?.preferredWeapon || "diamond_sword";
  const weapon = await ensureInventoryItem(preferredWeapon, 1);
  if (weapon) {
    try {
      await currentBot.equip(weapon, "hand");
      console.log(`  ⚔️  Equipped ${weapon.name}`);
      return weapon;
    } catch (error) {
      console.log(`  ⚠️  Failed to equip weapon: ${error.message}`);
      return null;
    }
  }
  console.log("  ⚠️  No weapon available");
  return null;
}

async function engageCombat(mobEntity) {
  const state = getCurrentBotState();
  const maxCombatDuration = 30000;
  const startTime = Date.now();
  
  while (mobEntity && mobEntity.isValid && mobEntity.health > 0 && Date.now() - startTime < maxCombatDuration) {
    const distance = currentBot.entity.position.distanceTo(mobEntity.position);
    
    try {
      await currentBot.lookAt(mobEntity.position.offset(0, mobEntity.height * 0.5, 0));
      
      if (distance > 3) {
        const goal = new goals.GoalNear(mobEntity.position.x, mobEntity.position.y, mobEntity.position.z, 2);
        currentBot.pathfinder.setGoal(goal);
        await delay(300);
      } else {
        currentBot.pathfinder.setGoal(null);
        await currentBot.attack(mobEntity);
        console.log(`  💥 Attacked ${mobEntity.name}`);
        await delay(currentBot.getAttackCooldown() + 50);
      }
      
    } catch (error) {
      break; 
    }
  }
  
  currentBot.pathfinder.setGoal(null);
  if (mobEntity && !mobEntity.isValid) {
    console.log(`  ✅ Defeated ${mobEntity.name}!`);
  }
  state.inCombat = false;
}

async function defendAgainstMobs() {
  if (currentBotName !== 'HeroBrine' || !config.combatSettings?.enabled) return;
  
  const state = getCurrentBotState();
  if (state.inCombat || state.isProcessing) return;
  
  const nearbyMobs = getNearbyHostileMobs();
  if (nearbyMobs.length === 0) return;
  
  state.inCombat = true;
  state.isProcessing = true;
  
  try {
    const target = nearbyMobs[0];
    console.log(`\n⚔️  === COMBAT MODE ACTIVATED (HeroBrine) ===`);
    
    if (!(await equipWeapon())) {
      return;
    }
    
    await engageCombat(target);
    
  } catch (error) {
    console.log(`  ⚠️  Combat error: ${error.message}`);
  } finally {
    state.inCombat = false;
    state.isProcessing = false;
    console.log(`⚔️  === COMBAT MODE ENDED ===\n`);
  }
}

function startCombatMonitoring() {
  if (currentBotName !== 'HeroBrine') return;
  const state = getCurrentBotState();
  if (state.combatMonitorInterval) clearInterval(state.combatMonitorInterval);
  state.combatMonitorInterval = setInterval(() => {
    defendAgainstMobs().catch(err => {
      if (err.message !== 'Too many pathfinding attempts') {
        console.log(`  ⚠️  Combat monitor error: ${err.message}`);
      }
    });
  }, 1000);
  console.log("⚔️  Combat monitoring enabled (HeroBrine)\n");
}


// ===== COMMON BOT ACTIVITIES & SLEEP FIX =====

async function lookAround() {
  if (!currentBot || !currentBot.entity) return;
  try {
    const yaw = randomFloat(-Math.PI, Math.PI);
    const pitch = randomFloat(-Math.PI / 6, Math.PI / 6);
    await currentBot.look(yaw, pitch, true);
    await delay(randomDelay(300, 800));
  } catch (error) {}
}

async function tryToSleep() {
  const state = getCurrentBotState();
  if (state.isSleeping || !config.autoSleep) return;
  
  // Set processing state while attempting sleep
  state.isProcessing = true;
  let placedBed = false;

  try {
    console.log("\n🌙 Night time - attempting to sleep...");
    
    const bedNames = mcData.itemsArray.filter(i => i.name.endsWith('_bed')).map(i => i.name);
    let bedItem = currentBot.inventory.items().find(i => bedNames.includes(i.name));

    if (!bedItem && currentBotName === 'CraftMan') {
      bedItem = await getItemFromCreativeInventory("red_bed", 1);
    }
    if (!bedItem) {
      console.log("  ⚠️  Could not get a bed. Cannot sleep.");
      return;
    }
    
    let bedBlock = currentBot.findBlock({ matching: (block) => bedNames.includes(block.name), maxDistance: 16 });

    if (!bedBlock) {
      // Logic to place the bed (simplified for brevity)
      const pos = currentBot.entity.position.floored().offset(0, -1, 0);
      const targetBlockPos = pos.offset(0, 1, 0);
      const refBlock = currentBot.blockAt(pos);

      if (refBlock && refBlock.name !== "air" && currentBot.blockAt(targetBlockPos)?.name === "air") {
         await currentBot.equip(bedItem, "hand");
         await currentBot.placeBlock(refBlock, new Vec3(0, 1, 0));
         await delay(500);

         const verifyBed = currentBot.blockAt(targetBlockPos);
         if (verifyBed && bedNames.includes(verifyBed.name)) {
            bedBlock = verifyBed;
            placedBed = true;
            console.log("  ✅ Placed new bed.");
         }
      }
    }

    if (!bedBlock) {
      console.log("  ⚠️  No suitable place to sleep found.");
      return;
    }
    
    // Move to the bed if necessary
    const distance = currentBot.entity.position.distanceTo(bedBlock.position);
    if (distance > 3) {
      const goal = new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2);
      currentBot.pathfinder.setGoal(goal);
      await new Promise(resolve => currentBot.once('goal_reached', resolve)).catch(() => {});
      currentBot.pathfinder.setGoal(null);
    }
    
    // Wait for the wake event to resolve
    let wakePromise = new Promise(resolve => currentBot.once('wake', resolve));
    
    // Attempt sleep (this triggers the 'sleep' event which updates state.isSleeping)
    await currentBot.sleep(bedBlock)
        .then(() => wakePromise)
        .then(() => {
          console.log("☀️ Morning time! Waking up.");
        });

  } catch (error) {
    if (error.message.includes('already sleeping') || error.message.includes('not night')) {
        console.log(`  ⚠️  Could not sleep: ${error.message}. Continuing...`);
    } else {
        console.error(`  ⚠️  Sleeping failed with error: ${error.message}`);
    }
  } finally {
    // CRITICAL FIX: Ensure state is reset regardless of success/failure
    state.isSleeping = false;
    state.isProcessing = false;
    currentBot.pathfinder.setGoal(null); // Clear any pathfinding goal

    // Clean up the placed bed
    if (placedBed && bedBlock && currentBot.canDigBlock(bedBlock)) {
      try {
        await currentBot.dig(bedBlock);
        console.log("  🔨 Bed broken and removed.");
      } catch(err) {
        console.log("  ⚠️  Failed to break bed.");
      }
    }
  }
}

async function startHumanLikeActivity() {
  const state = getCurrentBotState();
  if (state.isProcessing || state.isSleeping || state.inCombat) return;
  state.isProcessing = true;

  try {
    if (config.autoSleep && isNightTime()) {
      state.isProcessing = false;
      await tryToSleep();
      return;
    }

    const activity = randomChoice(["explore", "explore", "build", "idle"]);
    
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
    
  } catch (error) {
    console.error("⚠️  Error in activity:", error.message);
  } finally {
    state.isProcessing = false;
  }
}

async function exploreRandomly() {
  const state = getCurrentBotState();
  if (!state.exploreCenter) state.exploreCenter = currentBot.entity.position.clone();

  const numStops = randomDelay(2, 4);
  
  for (let i = 0; i < numStops; i++) {
    if (state.isSleeping || state.inCombat || (config.autoSleep && isNightTime())) return;

    const maxDistance = config.exploreRadius || 20;
    const angle = randomFloat(0, Math.PI * 2);
    const distance = randomFloat(5, maxDistance);

    const targetX = state.exploreCenter.x + Math.cos(angle) * distance;
    const targetZ = state.exploreCenter.z + Math.sin(angle) * distance;

    const tolerance = randomFloat(1.5, 3);
    const goal = new goals.GoalNear(targetX, currentBot.entity.position.y, targetZ, tolerance);
    currentBot.pathfinder.setGoal(goal);

    // Wait for arrival or timeout
    await new Promise(resolve => currentBot.once('goal_reached', resolve)).catch(() => {});
    currentBot.pathfinder.setGoal(null);

    await lookAround();
    await delay(randomDelay(1000, 3000));
  }
}

async function buildActivity() {
  if (!config.buildingEnabled) return;
  const numBlocks = randomDelay(1, 3);
  
  for (let i = 0; i < numBlocks; i++) {
    if (currentBotName === 'HeroBrine' && !isCreativeMode()) {
        return; 
    }
    await placeAndBreakBlock();
    if (i < numBlocks - 1) await delay(randomDelay(1000, 3000));
  }
}

async function idleActivity() {
  await delay(randomDelay(3000, 10000));
}

async function placeAndBreakBlock() {
  const blockType = config.blockType || "dirt";
  let placedBlockPosition = null;

  try {
    const item = await ensureInventoryItem(blockType, 1);
    if (!item) return;

    await currentBot.equip(item, "hand");
    const pos = currentBot.entity.position.floored().offset(0, -1, 0); 

    const refBlock = currentBot.blockAt(pos);
    const targetBlockPos = pos.offset(0, 1, 0);

    if (refBlock && refBlock.name !== "air" && currentBot.blockAt(targetBlockPos)?.name === "air") {
      await currentBot.placeBlock(refBlock, new Vec3(0, 1, 0));
      await delay(randomDelay(400, 800));

      const verifyBlock = currentBot.blockAt(targetBlockPos);
      if (verifyBlock?.name === blockType) {
        placedBlockPosition = targetBlockPos;
        
        await delay(randomDelay(1000, 3000));
        
        if (currentBot.canDigBlock(verifyBlock)) {
          await currentBot.dig(verifyBlock);
        }
      }
    }
  } catch (error) {
  }
}


// ===== BOT HANDLERS & INITIALIZATION =====

function setupBotHandlers() {
  currentBot.once("spawn", () => {
    mcData = require("minecraft-data")(currentBot.version);
    Item = require("prismarine-item")(currentBot.version);
    
    currentBot.loadPlugin(pathfinder);
    const defaultMove = new Movements(currentBot, mcData);
    currentBot.pathfinder.setMovements(defaultMove);
    
    console.log(`\n🎉 ${currentBotName} has spawned!`);

    if (currentBotName === "CraftMan") {
      startGamemodeMonitoring();
    } else if (currentBotName === "HeroBrine") {
      startCombatMonitoring();
    }
    
    startAntiAFKMonitoring();
    startKeepAliveMonitoring();
    getCurrentBotState().exploreCenter = currentBot.entity.position.clone();
    
    botActivityInterval = setInterval(startHumanLikeActivity, 3000);
  });
  
  // CRITICAL: Handle disconnect/kicked events to switch bots
  currentBot.on("kicked", (reason) => {
    console.error(`\n🛑 ${currentBotName} was kicked! Reason: ${reason}`);
    switchBot(); 
  });

  currentBot.on("error", (err) => {
    console.error(`\n❌ ${currentBotName} encountered an error: ${err.message}`);
    // Protocol errors are fatal, switch immediately
    if (err.message.includes('PartialReadError') || err.message.includes('ProtocolError')) {
      console.error('CRITICAL PROTOCOL ERROR DETECTED. SWITCHING BOTS IMMEDIATELY.');
      setTimeout(switchBot, 5000); 
    }
  });

  currentBot.on("end", (reason) => {
    console.log(`\n🔌 ${currentBotName} disconnected. Reason: ${reason}`);
    // Only switch if the disconnect was not manual (i.e., not from currentBot.quit())
    if (reason !== "bot.quit") { 
      switchBot(); 
    }
  });
  
  currentBot.on('death', () => {
    console.log(`💀 ${currentBotName} died! Attempting to switch...`);
    setTimeout(switchBot, 1000); 
  });
  
  // Use events to reliably update the isSleeping state
  currentBot.on('sleep', () => {
      getCurrentBotState().isSleeping = true;
  });
  
  currentBot.on('wake', () => {
      getCurrentBotState().isSleeping = false;
  });
}

// Start the whole system
startBotCycle();
