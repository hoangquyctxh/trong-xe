
const FeeCalculator = require('./fee_calculator.js');

// Mock Config & Location
const mockLocationConfig = {
    id: 1,
    fee_policy_type: 'hourly',
    fee_collection_policy: 'post_paid',
    fee_hourly_day: 20000,   // NEW PRICE (Number)
    fee_hourly_night: 30000, // NEW PRICE (Number)
    fee_per_entry: 0,
    fee_daily: 0
};

// Mock Config but with STRING values (Simulating "dirty" data from Admin input)
const mockLocationConfigString = {
    id: 1,
    fee_policy_type: 'hourly',
    fee_collection_policy: 'post_paid',
    fee_hourly_day: "20000",   // STRING
    fee_hourly_night: "30000", // STRING
    fee_per_entry: "0",
    fee_daily: "0"
};

// Mock Transaction with NO Snapshot (Should use Location Config)
const txNoSnapshot = {
    entry_time: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // 65 mins ago
    is_vip: false,
    fee_policy_snapshot: null
};

// Mock Transaction with INVALID Snapshot
const txInvalidSnapshot = {
    entry_time: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    is_vip: false,
    fee_policy_snapshot: "invalid_json_string"
};

console.log("--- TEST CASE 1: Normal Config (Numbers) ---");
const fee1 = FeeCalculator.calculate(txNoSnapshot, new Date(), mockLocationConfig);
console.log(`Expected > 0. Result: ${fee1}`);

console.log("\n--- TEST CASE 2: String Config (Potential Bug Source) ---");
const fee2 = FeeCalculator.calculate(txNoSnapshot, new Date(), mockLocationConfigString);
console.log(`Expected > 0 (Should handle strings). Result: ${fee2}`);

console.log("\n--- TEST CASE 3: Invalid Snapshot (Should Fallback) ---");
const fee3 = FeeCalculator.calculate(txInvalidSnapshot, new Date(), mockLocationConfig);
console.log(`Expected > 0 (Fallback to location). Result: ${fee3}`);

console.log("\n--- TEST CASE 4: Verification of 1st Hour Logic (Hybrid) ---");
// 65 mins = 1 hour + 5 mins.
// Logic: First 60 mins = 2 blocks of 30 mins (50% rate).
// Price = 20000/hr.
// Block 1 (0-30): 10000.
// Block 2 (30-60): 10000.
// Block 3 (60-65): 1 block of 60 mins (100% rate) = 20000? Or depends on implementation.
// Let's check the code:
// if (minutesCovered < 60) { blockSize = 30; feeRatio = 0.5; } else { blockSize = 60; feeRatio = 1.0; }
// 0-30: 20000 * 0.5 = 10000.
// 30-60: 20000 * 0.5 = 10000.
// 60-120: 20000 * 1.0 = 20000.
// Total expected for 65 mins = 10000 + 10000 + 20000 = 40000.
const tx65Mins = {
    entry_time: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    is_vip: false,
    fee_policy_snapshot: null
};
const fee4 = FeeCalculator.calculate(tx65Mins, new Date(), mockLocationConfig);
console.log(`Duration: 65 mins. Rate: 20000/h. Expected: 40000. Result: ${fee4}`);
