# trueCastAgent

## Clone the Repository

This repository contains submodules. To clone the repository with all submodules, use:

```bash
git clone --recurse-submodules https://github.com/phdargen/trueCastAgent.git
cd trueCastAgent
```

If you've already cloned the repository without submodules, you can initialize and update them with:

```bash
git submodule init
git submodule update
```

## Build Instructions

1. Build the AgentKit module:
   ```bash
   cd cdp-agentkit/typescript
   pnpm i && pnpm build
   ```

2. (Optional) Run the chatbot example:
   ```bash
   cd cdp-agentkit/typescript/examples/langchain-cdp-chatbot
   pnpm run start
   ```

3. Build and run myAgent:
   ```bash
   cd myAgent
   npm install
   npm start
   ```