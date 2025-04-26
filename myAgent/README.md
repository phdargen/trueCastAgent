# TrueCastAgent

## Setup

1. Make sure the CDP AgentKit submodule is cloned:
   ```bash
   git submodule update --init --recursive
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the `.env.example` template:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file and add your API keys.

## Usage

Run interactive chatbot:
```bash
npm run chat
```

Run the trueCastAgent:
```bash
npm run start
npm run start -- --no-posts --no-bets
```

Run other scripts:
```bash
npm run select-featured-market
npm run update-markets
```
