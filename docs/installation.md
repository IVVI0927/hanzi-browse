# Installation Guide

Complete installation instructions for all deployment scenarios.

## Prerequisites

| Component | Version | Required for |
|-----------|---------|--------------|
| **Node.js** | 18+ | All scenarios |
| **Chrome/Chromium** | Latest | All scenarios |
| **Docker** | Latest | Local development only |
| **Git** | Latest | Development/contribution |

---

## AI Agent Installation (Recommended)

### Automated Setup
The fastest way to get started:

```bash
npx hanzi-browse setup
```

**What this does:**
1. 🔍 **Detects browsers** - Finds Chrome, Brave, Edge, Arc, Chromium
2. 🧩 **Installs extension** - Opens Chrome Web Store, waits for you to click "Add"
3. 🤖 **Detects AI agents** - Finds Claude Code, Cursor, Codex, Windsurf, VS Code, etc.
4. ⚙️ **Configures MCP** - Adds hanzi-browse to each agent's config automatically
5. 📚 **Installs skills** - Copies browser automation skills to each agent
6. 🎯 **Choose mode** - Managed ($0.05/task) or BYOM (free, your API key)

### Manual MCP Configuration
If automated setup fails, configure MCP manually:

**Claude Code (`~/.claude_cli_config.json`):**
```json
{
  "mcp": {
    "mcpServers": {
      "hanzi-browse": {
        "command": "npx",
        "args": ["hanzi-browse", "mcp"]
      }
    }
  }
}
```

**Cursor (`~/.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "hanzi-browse": {
      "command": "npx",
      "args": ["hanzi-browse", "mcp"]
    }
  }
}
```

### Extension Installation
If the automated extension install fails:

1. Go to [Chrome Web Store](https://chrome.google.com/webstore/detail/hanzi-browse/iklpkemlmbhemkiojndpbhoakgikpmcd)
2. Click "Add to Chrome"
3. Grant permissions when prompted
4. Verify: look for Hanzi icon in toolbar

---

## API Integration Installation

### 1. SDK Installation
```bash
npm install @hanzi-browse/sdk
```

### 2. Get API Credentials
1. Visit [api.hanzilla.co/dashboard](https://api.hanzilla.co/dashboard)
2. Sign in with Google
3. Create workspace (free)
4. Generate API key
5. Copy key (starts with `hic_live_`)

### 3. Extension Setup for End Users
Your users need the Chrome extension to run tasks:

**Option A: Direct install**
Send users to: https://chrome.google.com/webstore/detail/iklpkemlmbhemkiojndpbhoakgikpmcd

**Option B: Pairing widget**
Embed our widget on your site:
```html
<div id="hanzi-pair"></div>
<script src="https://api.hanzilla.co/embed.js"></script>
<script>
  HanziConnect.mount('#hanzi-pair', {
    apiKey: 'your_publishable_key',
    onConnected: (sessionId) => console.log('Browser connected:', sessionId)
  });
</script>
```

---

## Local Development Installation

### Quick Setup
```bash
git clone https://github.com/hanzili/hanzi-browse
cd hanzi-browse
make fresh
```

This runs a full setup (90 seconds):
- Installs all dependencies
- Builds server + dashboard + extension
- Starts PostgreSQL via Docker
- Runs database migrations  
- Launches development server

### Step-by-Step Setup

**1. Clone and install dependencies:**
```bash
git clone https://github.com/hanzili/hanzi-browse
cd hanzi-browse

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install dashboard dependencies
cd server/dashboard && npm install && cd ../..

# Install SDK dependencies
cd sdk && npm install && cd ..
```

**2. Build everything:**
```bash
make build
```

**3. Configure environment:**
```bash
cp .env.example .env
# Edit .env - see configuration guide for details
```

**4. Start services:**
```bash
make dev
```

**5. Load extension:**
- Open `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select `dist/` folder in project root

### Development Services
| Service | URL | Purpose |
|---------|-----|---------|
| API Server | http://localhost:3456 | REST API |
| Dashboard | http://localhost:3456/dashboard | Web UI |
| PostgreSQL | localhost:5433 | Database |
| WebSocket Relay | ws://localhost:7862 | Browser communication |

---

## Docker Installation

### Production Docker Setup
```bash
# Clone repo
git clone https://github.com/hanzili/hanzi-browse
cd hanzi-browse

# Build production image
docker build -t hanzi-browse .

# Run with environment
docker run -d \
  -p 3456:3456 \
  -p 7862:7862 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e VERTEX_SA_PATH="/app/vertex-sa.json" \
  -v /path/to/vertex-sa.json:/app/vertex-sa.json \
  hanzi-browse
```

### Docker Compose (Development)
```bash
# Included in repo
docker-compose up -d
```

---

## Server Deployment

### VPS Deployment (Ubuntu/Debian)

**1. Install Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Install dependencies:**
```bash
sudo apt-get update
sudo apt-get install -y git nginx postgresql-client
```

**3. Clone and setup:**
```bash
cd /opt
sudo git clone https://github.com/hanzili/hanzi-browse
cd hanzi-browse
sudo npm ci
cd server && sudo npm ci && sudo npm run build
```

**4. Configure systemd service:**
```bash
sudo tee /etc/systemd/system/hanzi-browse.service > /dev/null <<EOF
[Unit]
Description=Hanzi Browse API Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/hanzi-browse/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable hanzi-browse
sudo systemctl start hanzi-browse
```

**5. Configure reverse proxy:**
```nginx
# /etc/nginx/sites-available/hanzi-browse
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Cloud Platform Deployment

**Vercel (API only):**
```bash
npm i -g vercel
cd server
vercel --prod
```

**Railway:**
```bash
# Connect GitHub repo to Railway
# Set environment variables in dashboard
# Deploy automatically on push
```

**Google Cloud Run:**
```bash
gcloud run deploy hanzi-browse \
  --image gcr.io/PROJECT_ID/hanzi-browse \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Verification

### Test MCP Installation
```bash
# Test CLI directly
npx hanzi-browse --help

# Test MCP server
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npx hanzi-browse mcp
```

### Test API Installation  
```bash
# Health check
curl http://localhost:3456/v1/health

# Create pairing token (requires API key)
curl -X POST http://localhost:3456/v1/browser-sessions/pair \
  -H "Authorization: Bearer hic_live_your_key" \
  -H "Content-Type: application/json"
```

### Test Extension
1. Open Chrome with extension loaded
2. Right-click extension icon → Inspect popup
3. Console should show "Hanzi Browse ready"
4. No error messages

---

## Updating

### Update AI Agent Installation
```bash
npx hanzi-browse setup --update
```

### Update Local Development
```bash
git pull
npm install
cd server && npm install && cd ..
make build
make migrate  # if schema changed
```

### Update Docker
```bash
docker pull hanzi-browse:latest
docker-compose up -d
```

---

## Uninstalling

### Remove AI Agent Setup
```bash
npx hanzi-browse cleanup
```

### Remove Extension
1. Go to `chrome://extensions`
2. Find "Hanzi Browse"
3. Click "Remove"

### Remove Local Development
```bash
make clean  # stops containers, deletes volumes
rm -rf hanzi-browse/
```

---

## Next Steps

- ✅ **Installation complete** → Try the [Quick Start Guide](quickstart.md)
- ⚙️ **Need configuration?** → Check [Configuration Guide](configuration.md)  
- 🐛 **Having issues?** → See [Troubleshooting Guide](troubleshooting.md)
- 🔌 **Ready to integrate?** → Browse [API Reference](api-reference.md)