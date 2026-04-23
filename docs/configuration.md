# Configuration Guide

Complete configuration reference for all Hanzi Browse components and deployment scenarios.

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode (`development`, `production`) |
| `PORT` | `3456` | HTTP server port |
| `WS_RELAY_PORT` | `7862` | WebSocket relay port |
| `DATABASE_URL` | *none* | PostgreSQL connection string (required for API mode) |

### MCP Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HANZI_BROWSE_MAX_SESSIONS` | `5` | Max concurrent browser tasks |
| `HANZI_BROWSE_TIMEOUT_MS` | `300000` | Task timeout in milliseconds (5 minutes) |
| `HANZI_BROWSE_DEBUG` | `false` | Enable debug logging |

### Authentication

| Variable | Example | Description |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | `your-random-secret` | Session encryption key (change in production!) |
| `BETTER_AUTH_URL` | `https://api.yoursite.com` | Base URL for auth callbacks |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | Google OAuth client secret |

### AI Provider Configuration

| Variable | Example | Description |
|----------|---------|-------------|
| `VERTEX_SA_PATH` | `../vertex-sa.json` | Path to Google Cloud service account JSON |
| `ANTHROPIC_API_KEY` | `sk-ant-xxx` | Anthropic API key (for BYOM mode) |
| `OPENAI_API_KEY` | `sk-xxx` | OpenAI API key (for BYOM mode) |

### Optional Services

| Variable | Example | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxx` | Stripe webhook endpoint secret |
| `SENTRY_DSN` | `https://xxx@xxx.ingest.sentry.io/xxx` | Sentry error tracking |
| `POSTHOG_API_KEY` | `phc_xxx` | PostHog analytics key |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog instance URL |

---

## AI Agent Configuration

### Claude Code

**Location:** `~/.claude_cli_config.json`
```json
{
  "mcp": {
    "mcpServers": {
      "hanzi-browse": {
        "command": "npx",
        "args": ["hanzi-browse", "mcp"],
        "env": {
          "HANZI_BROWSE_MAX_SESSIONS": "3",
          "HANZI_BROWSE_TIMEOUT_MS": "600000"
        }
      }
    }
  }
}
```

### Cursor

**Location:** `~/.cursor/mcp.json`  
```json
{
  "mcpServers": {
    "hanzi-browse": {
      "command": "npx",
      "args": ["hanzi-browse", "mcp"],
      "env": {
        "HANZI_BROWSE_DEBUG": "true"
      }
    }
  }
}
```

### VS Code (with Cline)

**Location:** `.vscode/settings.json`
```json
{
  "cline.mcpServers": {
    "hanzi-browse": {
      "command": "npx",
      "args": ["hanzi-browse", "mcp"]
    }
  }
}
```

---

## Database Configuration

### Development (Docker)

```bash
# .env
DATABASE_URL=postgresql://hanzi:hanzi_dev@localhost:5433/hanzi
```

### Production (Managed Database)

**Neon Postgres:**
```bash
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname?sslmode=require
```

**Supabase:**
```bash
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

**Railway:**
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### Schema Migration

```bash
# Run migrations
make migrate

# Reset database (WARNING: deletes all data)
make db-reset

# Check migration status
npx prisma migrate status
```

---

## Chrome Extension Configuration

### Development Mode

**Manifest overwrites** (`manifest.dev.json`):
```json
{
  "key": "your-dev-extension-key",
  "permissions": ["activeTab", "storage", "debugger"],
  "host_permissions": ["http://localhost/*"]
}
```

**Developer options** (extension popup):
- Enable debug mode
- Use local relay (ws://localhost:7862)
- Show detailed logs

### Production Mode

**Content Security Policy:**
- WebSocket: `wss://relay.hanzilla.co`
- API: `https://api.hanzilla.co`

**Permissions:**
```json
{
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["<all_urls>"]
}
```

---

## API Server Configuration

### Local Development

```bash
# .env
NODE_ENV=development
PORT=3456
DATABASE_URL=postgresql://hanzi:hanzi_dev@localhost:5433/hanzi
BETTER_AUTH_SECRET=dev-secret-change-in-production
BETTER_AUTH_URL=http://localhost:3456

# Optional: Google OAuth for dashboard
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

### Production Deployment

```bash
# .env.production
NODE_ENV=production
PORT=3456
DATABASE_URL=postgresql://user:pass@host:port/db?sslmode=require
BETTER_AUTH_SECRET=your-super-secret-key-here
BETTER_AUTH_URL=https://api.yourdomain.com

# Required: Google OAuth
GOOGLE_CLIENT_ID=your-prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-prod-secret

# Required: Vertex AI for managed tasks
VERTEX_SA_PATH=/app/vertex-sa.json

# Optional: Billing
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Optional: Monitoring
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
POSTHOG_API_KEY=phc_your_posthog_key
```

---

## OAuth Configuration

### Google OAuth Setup

**1. Create OAuth Client:**
- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Create "OAuth 2.0 Client ID"
- Application type: "Web application"

**2. Configure URLs:**
```
Authorized JavaScript origins:
- http://localhost:3456 (development)
- https://api.yourdomain.com (production)

Authorized redirect URIs:  
- http://localhost:3456/api/auth/callback/google (development)
- https://api.yourdomain.com/api/auth/callback/google (production)
```

**3. Environment Variables:**
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

---

## Billing Configuration

### Stripe Setup

**1. Create Stripe Account:**
- Sign up at [stripe.com](https://stripe.com)
- Get API keys from dashboard

**2. Create Credit Products:**
```bash
# Create products in Stripe dashboard
stripe products create --name="100 Credits" --description="Credit pack for browser automation"
stripe prices create --product=prod_xxx --amount=500 --currency=usd
```

**3. Environment Variables:**
```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_key  # or sk_live_ for production
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Credit pack pricing (credits:stripe_price_id)
STRIPE_CREDIT_PACK_1=100:price_xxx
STRIPE_CREDIT_PACK_2=500:price_yyy  
STRIPE_CREDIT_PACK_3=1500:price_zzz
```

**4. Configure Webhooks:**
- Endpoint: `https://api.yourdomain.com/api/billing/webhook`
- Events: `checkout.session.completed`, `invoice.payment_succeeded`

---

## Monitoring Configuration

### Sentry Error Tracking

```bash
# .env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=v1.0.0
```

**Performance monitoring:**
```javascript
// server/src/index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
});
```

### PostHog Analytics

```bash
# .env
POSTHOG_API_KEY=phc_your_key
POSTHOG_HOST=https://us.i.posthog.com
```

**Events tracked:**
- `task_started`, `task_completed`, `task_failed`
- `browser_connected`, `browser_disconnected`  
- `api_key_created`, `credits_purchased`

---

## Security Configuration

### CORS Configuration

```javascript
// server/src/managed/server.ts
const corsOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://yourdomain.com', 'https://tools.hanzilla.co']
  : ['http://localhost:3000', 'http://localhost:3456'];
```

### Rate Limiting

```javascript
// API rate limits (per API key)
const limits = {
  tasks: '100/hour',
  sessions: '50/hour',
  keys: '10/hour'
};
```

### Content Security Policy

```html
<!-- Extension popup CSP -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; connect-src https://api.hanzilla.co wss://relay.hanzilla.co">
```

---

## WebSocket Relay Configuration

### Development
```bash
WS_RELAY_PORT=7862
WS_RELAY_HOST=localhost
```

### Production
```bash
WS_RELAY_PORT=7862
WS_RELAY_HOST=0.0.0.0

# Behind reverse proxy
WS_RELAY_PROXY_TRUST=true
```

**Nginx configuration:**
```nginx
location /ws {
    proxy_pass http://127.0.0.1:7862;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

---

## Performance Tuning

### Browser Concurrency
```bash
# Limit concurrent browser sessions
HANZI_BROWSE_MAX_SESSIONS=5

# Reduce for low-memory environments  
HANZI_BROWSE_MAX_SESSIONS=2
```

### Database Connections
```bash
# PostgreSQL connection pool
DATABASE_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT=30000
```

### Memory Management
```bash
# Node.js memory limits
NODE_OPTIONS="--max-old-space-size=2048"

# Extension memory limits (manifest.json)
"minimum_chrome_version": "96"
```

---

## Logging Configuration

### Log Levels
```bash
# Development: detailed logging
LOG_LEVEL=debug

# Production: essential only  
LOG_LEVEL=info
```

### Log Destinations
```bash
# File logging
LOG_FILE=/var/log/hanzi-browse/app.log

# Structured JSON logging
LOG_FORMAT=json

# Disable console in production
LOG_CONSOLE=false
```

---

## SSL/HTTPS Configuration

### Development (self-signed)
```bash
# Generate dev certificates
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Use in server
HTTPS_CERT_PATH=./cert.pem
HTTPS_KEY_PATH=./key.pem
```

### Production (Let's Encrypt)
```bash
# Certbot setup
sudo certbot --nginx -d api.yourdomain.com
sudo certbot --nginx -d relay.yourdomain.com
```

---

## Configuration Validation

### Environment Check Script
```bash
#!/bin/bash
# check-config.sh

echo "🔍 Checking Hanzi Browse configuration..."

# Required variables
required_vars=(
  "DATABASE_URL"
  "BETTER_AUTH_SECRET"  
  "VERTEX_SA_PATH"
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi
done

echo "✅ Configuration validation passed"
```

### Health Checks
```bash
# API health
curl -f http://localhost:3456/v1/health || exit 1

# Database health  
pg_isready -h localhost -p 5433 || exit 1

# WebSocket health
wscat -c ws://localhost:7862 || exit 1
```

---

## Troubleshooting Configuration

**Common issues:**

1. **Extension not connecting**
   - Check WebSocket URL in extension settings
   - Verify `WS_RELAY_PORT` matches

2. **Database connection fails**
   - Verify `DATABASE_URL` format
   - Check network connectivity
   - Ensure database exists

3. **OAuth redirect mismatch**
   - Update Google Console redirect URLs
   - Check `BETTER_AUTH_URL` matches domain

4. **Stripe webhook fails**
   - Verify webhook URL is publicly accessible
   - Check `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard

For more troubleshooting help, see the [Troubleshooting Guide](troubleshooting.md).