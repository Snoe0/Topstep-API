const TopstepXClient = require('./src/api/topstepx-client');
require('dotenv').config();

async function testLiveData() {
  // Initialize the client
  const client = new TopstepXClient();

  console.log('=== TopstepX Live Data Test ===\n');

  try {
    // Authenticate first - Process API response and verify success (errorCode 0)
    console.log('Step 1: Authenticating...');
    const token = await client.authenticate();
    console.log('✓ Authentication successful (errorCode: 0)');
    console.log('Session Token stored:', token ? 'Yes (secured in memory)' : 'No');
    console.log('Token length:', token?.length || 0, 'characters');
    console.log('Authorization header set:', client.isAuthenticated ? 'Yes' : 'No');
    console.log('Auto-validation: Every 23 hours (token expires in 24h)');
    console.log('Ready to access Gateway API\n');

    // Get list of active accounts (required before placing orders)
    console.log('Step 2: Fetching active accounts...');
    const accountsResponse = await client.getAccounts(true);

    console.log(`\n📊 Active Accounts (${accountsResponse.accountCount}):`);
    console.log('─'.repeat(80));

    if (accountsResponse.accounts && accountsResponse.accounts.length > 0) {
      accountsResponse.accounts.forEach((acc, index) => {
        console.log(`\nAccount ${index + 1}:`);
        console.log(`  ID:           ${acc.id}`);
        console.log(`  Name:         ${acc.name}`);
        console.log(`  Balance:      ${acc.balance !== undefined ? '$' + acc.balance.toLocaleString() : 'N/A'}`);
        console.log(`  Tradable:      ${acc.canTrade ? '✅' : '❌'}`);
        console.log(`  Visible:       ${acc.isVisible ? '✅' : '❌'}`);
        console.log(`  Simulated:     ${acc.simulated ? '✅' : '❌'}`);
      });
      console.log('\n' + '─'.repeat(80));
      console.log('Account IDs:', accountsResponse.accounts.map(acc => acc.id).join(', '));
    } else {
      console.log('No active accounts found.');
    }
    console.log('\n');

    // Get current futures contracts (required to get contract IDs for placing orders)
    console.log('Step 3: Fetching current futures contracts...');
    const contracts = await client.getCurrentFuturesContracts(['MNQ', 'NQ', 'MES', 'ES', 'MGC', 'GC']);
    console.log('Current Futures Contracts (Z2025):');
    // console.log(JSON.stringify(contracts, null, 2));
    console.log('\n');

    // Display contract IDs for easy reference
    if (Object.keys(contracts).length > 0) {
      console.log('Contract IDs for placing orders:');
      for (const [symbol, contract] of Object.entries(contracts)) {
        console.log(`  ${symbol}: ${contract.id}`);
      }
      console.log('\n');
    }

    // Get MNQ contract ID for historical data
    console.log('Step 4: Fetching MNQ historical and live data...');
    const mnqContract = contracts['MNQ'];

    if (!mnqContract || !mnqContract.id) {
      console.error('❌ MNQ contract not found. Cannot fetch historical data.');
    } else {
      console.log(`Using MNQ contract: ${mnqContract.id}\n`);

      // Fetch last 5 completed 1-minute candles
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000); // 6 minutes to ensure 5 complete bars

      console.log('Fetching last 5 completed 1-minute candles...');
      const historicalData = await client.getHistoricalData(
        mnqContract.id,
        fiveMinutesAgo.toISOString(),
        now.toISOString(),
        2, // unit: 2 = Minute
        1, // unitNumber: 1 minute
        5, // limit: 5 bars
        false // includePartialBar: false (completed bars only)
      );

      console.log('\n📊 Last 5 Completed 1-Minute Candles (MNQ):');
      console.log('─'.repeat(100));
      if (historicalData && historicalData.length > 0) {
        historicalData.forEach((bar, index) => {
          const time = new Date(bar.t).toLocaleString();
          console.log(`${index + 1}. ${time} | O: ${bar.o} | H: ${bar.h} | L: ${bar.l} | C: ${bar.c} | V: ${bar.v}`);
        });
      } else {
        console.log('No historical data available');
      }
      console.log('─'.repeat(100));

      // Poll for current unfinished candle every 15 seconds
      console.log('\n📈 Polling current unfinished candle every 15 seconds...');
      console.log('Press Ctrl+C to exit\n');

      const pollCurrentCandle = async () => {
        try {
          const currentTime = new Date();
          const oneMinuteAgo = new Date(currentTime.getTime() - 60 * 1000);

          const liveData = await client.getHistoricalData(
            mnqContract.id,
            oneMinuteAgo.toISOString(),
            currentTime.toISOString(),
            2, // unit: 2 = Minute
            1, // unitNumber: 1 minute
            1, // limit: 1 bar
            true // includePartialBar: true (get current unfinished candle)
          );

          if (liveData && liveData.length > 0) {
            const currentBar = liveData[liveData.length - 1];
            const time = new Date(currentBar.t).toLocaleString();
            console.log(`[${new Date().toLocaleTimeString()}] MNQ Current: ${currentBar.c} | O: ${currentBar.o} | H: ${currentBar.h} | L: ${currentBar.l} | V: ${currentBar.v} | Time: ${time}`);
          }
        } catch (error) {
          console.error('Error fetching current candle:', error.message);
        }
      };

      // Initial poll
      await pollCurrentCandle();

      // Set up 15-second interval
      const pollInterval = setInterval(pollCurrentCandle, 15000);

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n\nStopping...');
        clearInterval(pollInterval);
        client.disconnect();
        process.exit(0);
      });
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nDisconnecting...');
      client.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testLiveData();