# trueCastAgent

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