const TopstepXClient = require('./src/api/topstepx-client');
require('dotenv').config();

async function testOrders() {
  const client = new TopstepXClient();

  console.log('=== TopstepX Order Testing ===\n');

  try {
    // Step 1: Authenticate
    console.log('Step 1: Authenticating...');
    await client.authenticate();
    console.log('✓ Authentication successful\n');

    // Step 2: Get active accounts
    console.log('Step 2: Fetching active accounts...');
    const accountsResponse = await client.getAccounts(true);

    if (!accountsResponse.accounts || accountsResponse.accounts.length === 0) {
      console.error('❌ No active accounts found. Cannot test orders.');
      process.exit(1);
    }

    const tradableAccounts = accountsResponse.accounts.filter(acc => acc.canTrade);
    if (tradableAccounts.length === 0) {
      console.error('❌ No tradable accounts found.');
      process.exit(1);
    }

    // Find practice account (should have "PRAC" in the name)
    const practiceAccount = tradableAccounts.find(acc =>
      acc.name && acc.name.includes('PRAC')
    );
    if (!practiceAccount) {
      console.error('❌ No practice account found (looking for "PRAC" in account name).');
      console.log('Available accounts:', tradableAccounts.map(a => `${a.name} (ID: ${a.id})`).join(', '));
      process.exit(1);
    }

    const testAccount = practiceAccount;
    console.log(`✓ Using PRACTICE account: ${testAccount.name} (ID: ${testAccount.id})`);
    console.log(`  Balance: $${testAccount.balance?.toLocaleString() || 'N/A'}`);
    console.log(`  Simulated: ${testAccount.simulated ? 'Yes ✓' : 'No'}\n`);

    // Step 3: Get current contracts
    console.log('Step 3: Fetching MNQ and MES contracts...');
    const contracts = await client.getCurrentFuturesContracts(['MNQ', 'MES']);

    if (!contracts['MNQ']) {
      console.error('❌ MNQ contract not found. Cannot test orders.');
      process.exit(1);
    }

    if (!contracts['MES']) {
      console.error('❌ MES contract not found. Cannot test orders.');
      process.exit(1);
    }

    const mnqContract = contracts['MNQ'];
    const mesContract = contracts['MES'];
    console.log(`✓ MNQ Contract: ${mnqContract.id}`);
    console.log(`  Tick Size: ${mnqContract.tickSize}`);
    console.log(`  Tick Value: $${mnqContract.tickValue}`);
    console.log(`✓ MES Contract: ${mesContract.id}`);
    console.log(`  Tick Size: ${mesContract.tickSize}`);
    console.log(`  Tick Value: $${mesContract.tickValue}\n`);

    // Step 4: Get current prices
    console.log('Step 4: Fetching current prices...');
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    const mnqData = await client.getHistoricalData(
      mnqContract.id,
      oneMinuteAgo.toISOString(),
      now.toISOString(),
      2, // Minute
      1, // 1 minute
      1, // 1 bar
      true // Include partial bar
    );

    const mesData = await client.getHistoricalData(
      mesContract.id,
      oneMinuteAgo.toISOString(),
      now.toISOString(),
      2, // Minute
      1, // 1 minute
      1, // 1 bar
      true // Include partial bar
    );

    if (!mnqData || mnqData.length === 0) {
      console.error('❌ Could not fetch current MNQ price data.');
      process.exit(1);
    }

    if (!mesData || mesData.length === 0) {
      console.error('❌ Could not fetch current MES price data.');
      process.exit(1);
    }

    const mnqPrice = mnqData[0].c;
    const mesPrice = mesData[0].c;
    console.log(`✓ Current MNQ Price: ${mnqPrice}`);
    console.log(`✓ Current MES Price: ${mesPrice}\n`);

    // ============================================
    // ORDER 1: MNQ LONG with 50 Tick SL and 25 Tick TP (0.5 RR)
    // ============================================
    console.log('=' .repeat(80));
    console.log('ORDER 1: MNQ LONG (Market Buy)');
    console.log('=' .repeat(80));

    const mnqStopLossTicks = -50; // Negative for long positions (price goes down)
    const mnqTakeProfitTicks = 25; // Positive for long positions (price goes up)

    const mnqLongOrder = {
      accountId: testAccount.id,
      contractId: mnqContract.id,
      type: 2, // 2 = Market order
      side: 0, // 0 = Bid (buy), 1 = Ask (sell)
      size: 1,
      stopLossBracket: {
        ticks: mnqStopLossTicks,
        type: 4 // 4 = Stop (for stop loss on long positions)
      },
      takeProfitBracket: {
        ticks: mnqTakeProfitTicks,
        type: 1 // 1 = Limit (for take profit)
      }
    };

    console.log('\nOrder Details:');
    console.log('─'.repeat(80));
    console.log(`  Account: ${testAccount.name} (Practice)`);
    console.log(`  Contract: ${mnqContract.id}`);
    console.log(`  Type: Market Buy (type: 2, side: 0)`);
    console.log(`  Size: 1 contract`);
    console.log(`  Current Price: ${mnqPrice}`);
    console.log(`\n  Stop Loss Bracket:`);
    console.log(`    - ${mnqStopLossTicks} ticks from entry (Stop order)`);
    console.log(`    - Risk: $${(Math.abs(mnqStopLossTicks) * mnqContract.tickValue).toFixed(2)}`);
    console.log(`\n  Take Profit Bracket:`);
    console.log(`    - ${mnqTakeProfitTicks} ticks from entry (Limit order)`);
    console.log(`    - Reward: $${(mnqTakeProfitTicks * mnqContract.tickValue).toFixed(2)}`);
    console.log(`\n  Risk/Reward Ratio: 1:${(mnqTakeProfitTicks / Math.abs(mnqStopLossTicks)).toFixed(2)}`);
    console.log('─'.repeat(80));

    console.log('\nOrder Structure:');
    console.log(JSON.stringify(mnqLongOrder, null, 2));

    console.log('\nPlacing MNQ LONG order...');
    const mnqOrderResult = await client.placeOrder(mnqLongOrder);
    console.log('\n✓ MNQ Order Response:');
    console.log(JSON.stringify(mnqOrderResult, null, 2));

    // ============================================
    // ORDER 2: MES SHORT with 50 Tick SL and 25 Tick TP (0.5 RR)
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('ORDER 2: MES SHORT (Market Sell)');
    console.log('='.repeat(80));

    const mesStopLossTicks = 50; // Positive for short positions (price goes up)
    const mesTakeProfitTicks = -25; // Negative for short positions (price goes down)

    const mesShortOrder = {
      accountId: testAccount.id,
      contractId: mesContract.id,
      type: 2, // 2 = Market order
      side: 1, // 0 = Bid (buy), 1 = Ask (sell)
      size: 1,
      stopLossBracket: {
        ticks: mesStopLossTicks,
        type: 4 // 4 = Stop (for stop loss on short positions)
      },
      takeProfitBracket: {
        ticks: mesTakeProfitTicks,
        type: 1 // 1 = Limit (for take profit)
      }
    };

    console.log('\nOrder Details:');
    console.log('─'.repeat(80));
    console.log(`  Account: ${testAccount.name} (Practice)`);
    console.log(`  Contract: ${mesContract.id}`);
    console.log(`  Type: Market Sell (type: 2, side: 1)`);
    console.log(`  Size: 1 contract`);
    console.log(`  Current Price: ${mesPrice}`);
    console.log(`\n  Stop Loss Bracket:`);
    console.log(`    - ${mesStopLossTicks} ticks from entry (Stop order)`);
    console.log(`    - Risk: $${(Math.abs(mesStopLossTicks) * mesContract.tickValue).toFixed(2)}`);
    console.log(`\n  Take Profit Bracket:`);
    console.log(`    - ${mesTakeProfitTicks} ticks from entry (Limit order)`);
    console.log(`    - Reward: $${(Math.abs(mesTakeProfitTicks) * mesContract.tickValue).toFixed(2)}`);
    console.log(`\n  Risk/Reward Ratio: 1:${(Math.abs(mesTakeProfitTicks) / Math.abs(mesStopLossTicks)).toFixed(2)}`);
    console.log('─'.repeat(80));

    console.log('\nOrder Structure:');
    console.log(JSON.stringify(mesShortOrder, null, 2));

    console.log('\nPlacing MES SHORT order...');
    const mesOrderResult = await client.placeOrder(mesShortOrder);
    console.log('\n✓ MES Order Response:');
    console.log(JSON.stringify(mesOrderResult, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE - BOTH ORDERS PLACED');
    console.log('='.repeat(80));
    console.log('\n✓ MNQ LONG order placed successfully');
    console.log('✓ MES SHORT order placed successfully');
    console.log('\nCheck your TopstepX platform to verify the order status\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    client.disconnect();
  }
}

// Run the test
testOrders();
