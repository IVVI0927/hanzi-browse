# Quick Start Guide

Get your AI agent controlling a real browser in 2 minutes, or integrate browser automation API in 10 minutes.

## 🤖 AI Agent Users (2 minutes)

### Step 1: Setup Everything
```bash
npx hanzi-browse setup
```

### Step 2: Test Your Agent
Ask your AI agent:
```
"Go to Hacker News and tell me the top 3 stories"
```

## ✅ You are ready if:

- Browser window opens automatically
- Your agent navigates to news.ycombinator.com  
- Task completes and returns actual story titles
- No error messages appear

**Success!** Your AI agent now has browser superpowers.

---

## 🛠 Developers (10 minutes)

### Step 1: Get API Key
1. Sign up: [api.hanzilla.co/dashboard](https://api.hanzilla.co/dashboard)
2. Create API key (free: 20 tasks/month)

### Step 2: Install & Code
```bash
npm install @hanzi-browse/sdk
```

```typescript
import { HanziClient } from '@hanzi-browse/sdk';

const client = new HanziClient({ apiKey: 'hic_live_...' });

// Create browser pairing for your user
const { pairingToken } = await client.createPairingToken();
console.log(`Pair: https://api.hanzilla.co/pair/${pairingToken}`);

// Run a task (after user pairs browser)
const sessions = await client.listSessions();
const result = await client.runTask({
  browserSessionId: sessions[0].id,
  task: 'Go to example.com and read the page title'
});

console.log(result.answer); // "Example Domain"
```

### Step 3: Test Integration
```bash
node your_script.js
```

## ✅ You are ready if:

- Pairing URL displays correctly
- User can connect their browser via the URL
- `listSessions()` returns connected browser
- `runTask()` executes and returns "Example Domain"
- No authentication or connection errors

**Success!** You can now automate real browsers via API.

---

## 🆘 Having Issues?

### Common Problems

**❌ "Command not found"**  
→ Update npm: `npm install -g npm@latest`

**❌ Extension won't install**  
→ Enable Developer Mode in `chrome://extensions`

**❌ "Browser session not found"**  
→ Make sure browser is paired via the pairing URL

**❌ Tasks timeout**  
→ Check internet connection, restart browser

**❌ API authentication fails**  
→ Verify API key format: `hic_live_...`

### Get Help
- 🔧 **[Troubleshooting Guide](troubleshooting.md)** - Fix common issues
- 📖 **[Full Documentation](installation.md)** - Detailed setup guides
- 💬 **[Discord Community](https://discord.gg/hahgu5hcA5)** - Live support
- 🐛 **[GitHub Issues](https://github.com/hanzili/hanzi-browse/issues)** - Report bugs

---

## 🚀 What's Next?

### 🤖 AI Agent Users
- **Try more tasks:** *"Apply to jobs on LinkedIn"*, *"Extract data from competitor sites"*
- **Explore skills:** Check [pre-built automation skills](../server/skills/README.md)
- **Advanced usage:** Multi-step workflows, parallel tasks
- **Configuration:** [Environment variables and settings](configuration.md)

### 🛠 Developers  
- **See examples:** Browse [complete integrations](../examples/)
- **API reference:** [Full endpoint documentation](api-reference.md)  
- **Webhooks:** Async notifications for long tasks
- **Scale up:** Enterprise features and custom deployment

### 👥 Everyone
- **Try free tools:** No-install demos at [tools.hanzilla.co](https://tools.hanzilla.co)
- **Join community:** [Discord](https://discord.gg/hahgu5hcA5) for discussions and support
- **Contribute:** Help improve Hanzi Browse - see [CONTRIBUTING.md](../CONTRIBUTING.md)