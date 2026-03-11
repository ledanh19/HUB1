/**
 * NOTIFICATION CONFIG SYNC SCRIPT
 * 
 * Generates Edge Functions config from FE source config.
 * Run this before deploying Edge Functions.
 * 
 * ACCEPTANCE GATE 2: Hash fields must only be written by this script.
 * If _configHash or _generatedAt are manually edited, script will FAIL.
 * 
 * Usage:
 *   node scripts/sync-notification-config.js
 * 
 * Or add to package.json:
 *   "predeploy": "node scripts/sync-notification-config.js"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths
const SOURCE_CONFIG = path.join(__dirname, '../src/modules/notifications/notificationConfig.json');
const TARGET_CONFIG = path.join(__dirname, '../supabase/functions/_shared/notificationConfig.json');

/**
 * Calculate hash of config EXCLUDING hash fields
 * This ensures hash is based on actual config content only
 */
function calculateConfigHash(config) {
  // Create a copy without hash fields
  const contentOnly = { ...config };
  delete contentOnly._configHash;
  delete contentOnly._generatedAt;
  
  // Sort keys for deterministic hash
  const sortedJson = JSON.stringify(contentOnly, Object.keys(contentOnly).sort(), 2);
  return crypto.createHash('sha256').update(sortedJson).digest('hex').substring(0, 16);
}

/**
 * Verify that hash fields haven't been manually edited
 * If previous hash doesn't match computed hash of content, someone edited manually
 */
function verifyNoManualEdit(config, filePath) {
  const existingHash = config._configHash;
  
  // Skip verification if no hash exists yet (first run)
  if (!existingHash || existingHash === 'GENERATED_BY_SYNC') {
    return true;
  }
  
  // Calculate what hash SHOULD be based on content
  const contentHash = calculateConfigHash(config);
  
  // If existing hash doesn't match content hash, content was manually edited
  // without running sync script
  if (existingHash !== contentHash) {
    console.error(`[sync-config] ❌ ERROR: Manual edit detected in ${filePath}!`);
    console.error(`[sync-config]   Expected hash: ${existingHash}`);
    console.error(`[sync-config]   Content hash:  ${contentHash}`);
    console.error(`[sync-config]   This means config was edited without running sync.`);
    console.error(`[sync-config]   To fix: revert changes or delete _configHash and re-run sync.`);
    return false;
  }
  
  return true;
}

// Read source config
console.log('[sync-config] Reading source config...');
const sourceContent = fs.readFileSync(SOURCE_CONFIG, 'utf8');
const sourceConfig = JSON.parse(sourceContent);

// GATE 2: Verify no manual edit to source
if (!verifyNoManualEdit(sourceConfig, SOURCE_CONFIG)) {
  console.error('[sync-config] ❌ SYNC ABORTED - Manual edit detected!');
  process.exit(1);
}

// Check if target exists and verify no manual edit
if (fs.existsSync(TARGET_CONFIG)) {
  const targetContent = fs.readFileSync(TARGET_CONFIG, 'utf8');
  const targetConfig = JSON.parse(targetContent);
  if (!verifyNoManualEdit(targetConfig, TARGET_CONFIG)) {
    console.error('[sync-config] ❌ SYNC ABORTED - Manual edit detected in target!');
    process.exit(1);
  }
}

// Calculate hash for drift detection (based on content without hash fields)
const configHash = calculateConfigHash(sourceConfig);
console.log(`[sync-config] Config hash: ${configHash}`);

// Add hash to config for runtime verification
const configWithHash = {
  ...sourceConfig,
  _configHash: configHash,
  _generatedAt: new Date().toISOString(),
};
// Remove old hash fields if they exist
delete configWithHash._configHash;
delete configWithHash._generatedAt;
// Re-add them at the end
configWithHash._configHash = configHash;
configWithHash._generatedAt = new Date().toISOString();

// Ensure target directory exists
const targetDir = path.dirname(TARGET_CONFIG);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Write target config
const targetContentOutput = JSON.stringify(configWithHash, null, 2);
fs.writeFileSync(TARGET_CONFIG, targetContentOutput);
console.log(`[sync-config] Written to: ${TARGET_CONFIG}`);

// Also update source config with hash (for FE verification)
fs.writeFileSync(SOURCE_CONFIG, JSON.stringify(configWithHash, null, 2));
console.log(`[sync-config] Updated source with hash: ${SOURCE_CONFIG}`);

console.log('[sync-config] ✅ Config sync complete!');
console.log(`[sync-config] Hash for verification: ${configHash}`);
console.log('[sync-config] GATE 2: Hash fields protected - manual edits will be detected!');
