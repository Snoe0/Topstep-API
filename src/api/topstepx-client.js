const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

class TopstepXClient {
  constructor(apiKey, userName, baseURL = 'https://api.topstepx.com/api') {
    this.apiKey = apiKey || process.env.TOPSTEP_API_KEY;
    this.userName = userName || process.env.TOPSTEP_USERNAME;
    this.baseURL = baseURL;
    this.ws = null;
    this.isConnected = false;
    this.token = null;
    this.isAuthenticated = false;
    this.tokenExpiry = null;
    this.tokenRefreshInterval = null;

    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'accept': 'text/plain',
        'Content-Type': 'application/json'
      }
    });
  }

  async authenticate() {
    try {
      if (!this.apiKey || !this.userName) {
        throw new Error('Both userName and apiKey are required for authentication');
      }

      console.log('Authenticating with TopstepX API using loginKey...');

      const authData = {
        "userName": this.userName,  // userName parameter
        "apiKey": this.apiKey       // apiKey parameter
      };
      // console.log(authData);

      const response = await this.httpClient.post('/Auth/loginKey', authData);

      // Check if authentication was successful
      if (response.data && response.data.success === true && response.data.errorCode === 0) {
        this.token = response.data.token;
        this.isAuthenticated = true;

        // Token lasts 24 hours, set expiry time
        this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

        // Set the session token for future requests
        this.httpClient.defaults.headers['Authorization'] = `Bearer ${this.token}`;

        // Setup automatic token validation every 23 hours
        this.setupTokenRefresh();

        console.log('✅ Authentication successful! Session token received.');
        console.log('Token valid until:', new Date(this.tokenExpiry).toISOString());
        return this.token;
      } else {
        const errorMessage = response.data?.errorMessage || 'Authentication failed';
        const errorCode = response.data?.errorCode || 'Unknown';
        throw new Error(`Authentication failed: ${errorMessage} (Code: ${errorCode})`);
      }

    } catch (error) {
      this.isAuthenticated = false;
      if (error.response) {
        console.error('Authentication error - Status:', error.response.status);
        console.error('Authentication error - Data:', error.response.data);
      }
      console.error('Authentication error:', error.message);
      throw error;
    }
  }

  async validateToken() {
    try {
      console.log('Validating session token...');

      const response = await this.httpClient.post('/Auth/validate');

      if (response.data && response.data.success === true && response.data.errorCode === 0) {
        console.log('✅ Token validation successful. Token is still valid.');
        return true;
      } else {
        console.log('❌ Token validation failed. Re-authenticating...');
        this.isAuthenticated = false;
        await this.authenticate();
        return true;
      }
    } catch (error) {
      console.error('Token validation error:', error.message);
      console.log('Re-authenticating...');
      this.isAuthenticated = false;
      await this.authenticate();
      return true;
    }
  }

  setupTokenRefresh() {
    // Clear any existing interval
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }

    // Validate token every 23 hours (before 24-hour expiry)
    const twentyThreeHours = 23 * 60 * 60 * 1000;
    this.tokenRefreshInterval = setInterval(async () => {
      console.log('\n=== Auto Token Validation (23 hours elapsed) ===');
      await this.validateToken();
    }, twentyThreeHours);

    console.log('Token auto-refresh scheduled for every 23 hours');
  }

  async ensureAuthenticated() {
    if (!this.isAuthenticated || !this.token) {
      await this.authenticate();
    } else if (this.tokenExpiry && Date.now() >= this.tokenExpiry - (60 * 60 * 1000)) {
      // If token expires in less than 1 hour, validate/refresh it
      console.log('Token expiring soon, validating...');
      await this.validateToken();
    }
  }

  async getHistoricalData(contractId, startTime, endTime, unit = 2, unitNumber = 1, limit = 1000, includePartialBar = false) {
    try {
      // Ensure we're authenticated before making the request
      await this.ensureAuthenticated();

      const requestData = {
        contractId: contractId, // e.g., "CON.F.US.MNQ.Z25"
        live: false, // Use simulated data subscription
        startTime: startTime, // e.g., "2024-12-01T00:00:00Z"
        endTime: endTime, // e.g., "2024-12-31T21:00:00Z"
        unit: unit, // 1 = Second, 2 = Minute, 3 = Hour, 4 = Day, 5 = Week, 6 = Month
        unitNumber: unitNumber, // number of units (e.g., 1 for 1-minute bars)
        limit: limit,
        includePartialBar: includePartialBar // true = include current unfinished candle
      };

      // console.log('Requesting historical data with:', requestData);

      const response = await this.httpClient.post('/History/retrieveBars', requestData);

      // TopstepX returns data in format: { bars: [{t, o, h, l, c, v}, ...], success, errorCode }
      if (response.data && response.data.success === true && response.data.errorCode === 0) {
        // Data is already in the correct format (t, o, h, l, c, v)
        return response.data.bars || [];
      } else {
        const errorMessage = response.data?.errorMessage || 'Failed to fetch historical data';
        const errorCode = response.data?.errorCode || 'Unknown';
        throw new Error(`Historical data failed: ${errorMessage} (Code: ${errorCode})`);
      }
    } catch (error) {
      console.error('Historical data error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  
  async getLiveData(symbol, callback) {
    try {
      const wsUrl = `${this.baseURL.replace('http', 'ws')}/live/${symbol}`;
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': this.httpClient.defaults.headers['Authorization']
        }
      });

      this.ws.on('open', () => {
        console.log(`✅ Connected to live data feed for ${symbol}`);
        this.isConnected = true;
      });

      this.ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data);
          callback(parsedData);
        } catch (error) {
          console.error('Error parsing live data:', error.message);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        this.isConnected = false;
      });

      this.ws.on('close', () => {
        console.log('Live data connection closed');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('Live data connection error:', error.message);
      throw error;
    }
  }

  async getAccounts(onlyActiveAccounts = true) {
    try {
      await this.ensureAuthenticated();

      const requestData = {
        onlyActiveAccounts: onlyActiveAccounts
      };

      console.log('Fetching accounts with:', requestData);

      const response = await this.httpClient.post('/Account/search', requestData);

      if (response.data && response.data.success === true && response.data.errorCode === 0) {
        const accountCount = response.data.accounts?.length || 0;
        console.log(`✅ Found ${accountCount} account(s)`);

        // Clean up and organize account information
        const organizedAccounts = response.data.accounts?.map(acc => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance,
          canTrade: acc.canTrade,
          isVisible: acc.isVisible,
          simulated: acc.simulated
        })) || [];

        return {
          success: response.data.success,
          errorCode: response.data.errorCode,
          accountCount: accountCount,
          accounts: organizedAccounts,
          rawAccounts: response.data.accounts // Keep raw data for reference
        };
      } else {
        const errorMessage = response.data?.errorMessage || 'Failed to fetch accounts';
        const errorCode = response.data?.errorCode || 'Unknown';
        throw new Error(`Account search failed: ${errorMessage} (Code: ${errorCode})`);
      }
    } catch (error) {
      console.error('Account search error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  async getAvailableContracts(live = true, searchText = '') {
    try {
      await this.ensureAuthenticated();

      const requestData = {
        live: false
      };

      // Add searchText if provided
      if (searchText) {
        requestData.searchText = searchText;
      }

      console.log('Fetching available contracts with:', requestData);

      const response = await this.httpClient.post('/Contract/search', requestData);

      // Log the full response to debug
      // console.log('Full response:', JSON.stringify(response.data, null, 2));

      if (response.data) {
        // Check if it's the expected response structure
        if (response.data.success === true && response.data.errorCode === 0) {
          const contractCount = response.data.contracts?.length || 0;
          console.log(`✅ Found ${contractCount} contract(s)`);
          return response.data;
        } else if (Array.isArray(response.data)) {
          // Sometimes the API might return just an array
          console.log(`✅ Found ${response.data.length} contract(s)`);
          return { contracts: response.data, success: true, errorCode: 0 };
        } else {
          const errorMessage = response.data?.errorMessage || 'Failed to fetch contracts';
          const errorCode = response.data?.errorCode || 'Unknown';
          throw new Error(`Contract search failed: ${errorMessage} (Code: ${errorCode})`);
        }
      } else {
        throw new Error('No response data received');
      }
    } catch (error) {
      console.error('Contract search error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  async getCurrentFuturesContracts(symbols = ['MNQ', 'NQ', 'MES', 'ES', 'MGC', 'GC']) {
    try {
      // Filter out unwanted contracts (NQG, NQM, etc.)
      const excludePatterns = ['NQG', 'NQM', 'ESG', 'ESM', 'GCG', 'GCM'];
      const currentContracts = {};

      for (const symbol of symbols) {
        // Use searchText to fetch contracts for this specific symbol
        const contractsResponse = await this.getAvailableContracts(true, symbol);

        if (!contractsResponse.contracts || contractsResponse.contracts.length === 0) {
          console.log(`No contracts found for ${symbol}`);
          continue;
        }

        // Filter contracts - exact match only and exclude unwanted patterns
        const matchingContracts = contractsResponse.contracts.filter(contract => {
          const contractSymbol = contract.symbol || contract.name || '';

          // Only include active contracts
          if (contract.activeContract !== true) {
            return false;
          }

          // Exclude unwanted patterns (NQG, NQM, etc.)
          if (excludePatterns.some(pattern => contractSymbol.includes(pattern))) {
            return false;
          }

          // For symbols like NQ, match exact NQ but not MNQ
          // Filter out if searching for NQ but found MNQ
          if (symbol === 'NQ' && contractSymbol.includes('MNQ')) {
            return false;
          }
          if (symbol === 'ES' && contractSymbol.includes('MES')) {
            return false;
          }
          if (symbol === 'GC' && contractSymbol.includes('MGC')) {
            return false;
          }

          // Check if the contract symbol matches exactly or is part of the name
          const symbolMatch = contractSymbol.includes(symbol);

          return symbolMatch;
        });

        if (matchingContracts.length > 0) {
          // Sort by expiration or contract month to get the front month (current contract)
          // Look for Z2025 (December 2025) or current month
          const currentContract = matchingContracts.sort((a, b) => {
            const aId = a.id || a.symbol || '';
            const bId = b.id || b.symbol || '';
            return aId.localeCompare(bId);
          })[0];

          currentContracts[symbol] = {
            id: currentContract.id,
            symbol: currentContract.symbol,
            name: currentContract.name,
            description: currentContract.description,
            tickSize: currentContract.tickSize,
            tickValue: currentContract.tickValue,
            activeContract: currentContract.activeContract,
            symbolId: currentContract.symbolId
          };

          console.log(`✓ Found contract for ${symbol}: ${currentContract.id}`);
        } else {
          console.log(`⚠ No matching contract found for ${symbol}`);
        }
      }

      return currentContracts;
    } catch (error) {
      console.error('Error fetching current futures contracts:', error.message);
      throw error;
    }
  }

  async getPositions() {
    try {
      const response = await this.httpClient.get('/positions');
      return response.data;
    } catch (error) {
      console.error('Positions error:', error.message);
      throw error;
    }
  }

  async placeOrder(orderData) {
    try {
      await this.ensureAuthenticated();

      console.log('Placing order with data:', JSON.stringify(orderData, null, 2));

      const response = await this.httpClient.post('/Order/place', orderData);

      if (response.data && response.data.success === true && response.data.errorCode === 0) {
        console.log('✅ Order placed successfully');
        return response.data;
      } else {
        const errorMessage = response.data?.errorMessage || 'Failed to place order';
        const errorCode = response.data?.errorCode || 'Unknown';
        throw new Error(`Order placement failed: ${errorMessage} (Code: ${errorCode})`);
      }
    } catch (error) {
      console.error('Order placement error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  disconnect() {
    if (this.ws && this.isConnected) {
      this.ws.close();
    }

    // Clear token refresh interval
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
      console.log('Token auto-refresh stopped');
    }
  }
}

module.exports = TopstepXClient;