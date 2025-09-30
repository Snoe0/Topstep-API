# TopstepX Algorithmic Trading System

A basis for TopstepX API integration, to be expanded upon for personal use. 

## Project Structure

```
TopstepAlgo/
├── src/
│   ├── api/
│   │   └── topstepx-client.js    # TopstepX API connection
└── .env.example                  # Environment variables template
```

## Features

### API Connection
- **TopstepX API Integration**: Complete REST API client with authentication
- **Live Data Feed**: WebSocket connection for real-time market data
- **Historical Data**: Fetch historical price data for backtesting

## Installation

1. **Clone or download the project**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure environment**:
   ```bash
   # Edit .env.example with your TopstepX API credentials, and change to simply .env
   ```

## Configuration

Edit the `.env` file with your settings:

```env
# TopstepX API
TOPSTEP_API_KEY=your_api_key_here
TOPSTEP_API_SECRET=your_api_secret_here
```

## Usage
### Test Topstep Connection
```bash
node test-live-data.js
```

## Disclaimer

This software is for educational and research purposes only. Trading involves significant risk of loss. Never trade with money you cannot afford to lose. Past performance does not guarantee future results. Always test strategies thoroughly before live trading.

## License

MIT License - see LICENSE file for details.