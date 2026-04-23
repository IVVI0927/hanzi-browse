# Troubleshooting Guide

Common issues and solutions for Hanzi Browse setup, configuration, and usage.

## Quick Diagnostics

### Health Check Commands
```bash
# Check API server
curl -f http://localhost:3456/v1/health

# Check WebSocket relay  
wscat -c ws://localhost:7862

# Check extension status
chrome://extensions/ → Find "Hanzi Browse" → Check for errors

# Test MCP connection
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npx hanzi-browse mcp
```

---

## Installation Issues

### ❌ "Command not found: npx hanzi-browse"

**Symptom:** `npx hanzi-browse setup` returns "command not found"

**Solutions:**
1. **Update npm:** `npm install -g npm@latest`
2. **Clear npm cache:** `npm cache clean --force`
3. **Check Node version:** `node --version` (must be 18+)
4. **Manual install:** `npm install -g hanzi-browse`

### ❌ Extension Won't Install

**Symptom:** Chrome Web Store shows error or extension doesn't load

**Solutions:**
1. **Check browser:** Ensure using Chrome/Chromium/Brave/Edge
2. **Enable Developer Mode:** `chrome://extensions` → toggle "Developer mode"
3. **Clear extension data:** Remove old versions first
4. **Manual install:** Download from [releases](https://github.com/hanzili/hanzi-browse/releases)

### ❌ AI Agent Not Detected

**Symptom:** `npx hanzi-browse setup` doesn't find your AI agent

**Solutions:**
1. **Manual MCP config:** See [configuration guide](configuration.md#ai-agent-configuration)
2. **Check installation:** Ensure agent is properly installed
3. **Custom config path:** Use `--config-path` flag

```bash
npx hanzi-browse setup --config-path ~/.custom/claude_config.json
```

---

## Connection Issues

### ❌ "WebSocket connection failed"

**Symptom:** Extension shows "Disconnected" or "Connection failed"

**Diagnosis:**
```bash
# Test WebSocket directly
wscat -c ws://localhost:7862

# Check if port is in use
lsof -i :7862

# Check firewall
sudo ufw status
```

**Solutions:**
1. **Restart relay:** `make dev` or restart the server
2. **Change port:** Set `WS_RELAY_PORT=8000` in environment
3. **Check firewall:** Allow port 7862
4. **Extension settings:** Update relay URL in extension options

### ❌ Extension Shows "Permission Denied"

**Symptom:** Extension popup shows permission errors

**Solutions:**
1. **Grant permissions:** Click extension icon → "Grant permissions"
2. **Reset permissions:** Remove and reinstall extension
3. **Check manifest:** Verify required permissions in `manifest.json`

### ❌ "Browser session not found"

**Symptom:** API calls fail with session not found error

**Solutions:**
1. **Check session status:**
   ```bash
   curl -H "Authorization: Bearer hic_live_xxx" \
        http://localhost:3456/v1/browser-sessions
   ```
2. **Re-pair browser:** Create new pairing token
3. **Clear session cache:** Restart extension

---

## Task Execution Issues

### ❌ Tasks Timeout or Hang

**Symptom:** Browser tasks never complete, show "running" status

**Diagnosis:**
```bash
# Check running sessions
npx hanzi-browse status

# Check extension console
chrome://extensions → Hanzi Browse → background page → Console

# Check server logs
tail -f ~/.hanzi-browse/logs/server.log
```

**Solutions:**
1. **Increase timeout:**
   ```bash
   export HANZI_BROWSE_TIMEOUT_MS=600000
   ```
2. **Reduce concurrency:**
   ```bash
   export HANZI_BROWSE_MAX_SESSIONS=2
   ```
3. **Restart browser:** Close all Chrome windows, restart
4. **Clear cache:** `chrome://settings/clearBrowserData`

### ❌ "Page not responding" Errors

**Symptom:** Tasks fail with page navigation or interaction errors

**Solutions:**
1. **Wait for page load:** Add delays in task description
2. **Check internet:** Verify connectivity to target sites
3. **Disable extensions:** Turn off other Chrome extensions temporarily
4. **Update Chrome:** Ensure latest version installed

### ❌ Form Interactions Fail

**Symptom:** Extension can't fill forms or click buttons

**Solutions:**
1. **Check selectors:** Target may have changed
2. **Wait for elements:** Add "wait for page to load" to task
3. **Check for overlays:** Remove popups/modals first
4. **Disable JavaScript:** Some sites block automation

---

## Authentication Issues  

### ❌ "Invalid API key"

**Symptom:** API calls return 401 Unauthorized

**Solutions:**
1. **Check key format:** Must start with `hic_live_` or `hic_test_`
2. **Verify workspace:** Key belongs to correct workspace
3. **Check permissions:** Ensure key has required scopes
4. **Regenerate key:** Create new API key in dashboard

### ❌ Google OAuth Fails

**Symptom:** Dashboard login redirects fail

**Diagnosis:**
```bash
# Check OAuth configuration
curl http://localhost:3456/api/auth/providers

# Check redirect URL
echo $BETTER_AUTH_URL
```

**Solutions:**
1. **Update Google Console:**
   - Add correct redirect URI: `${BETTER_AUTH_URL}/api/auth/callback/google`
   - Check authorized domains
2. **Environment variables:**
   ```bash
   GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com  
   GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
   BETTER_AUTH_URL=http://localhost:3456
   ```

---

## Database Issues

### ❌ "Database connection failed" 

**Symptom:** Server won't start, shows database errors

**Diagnosis:**
```bash
# Test database connection
pg_isready -h localhost -p 5433

# Check if database exists
psql -h localhost -p 5433 -U hanzi -d hanzi -c "SELECT 1"

# Check Docker containers
docker ps | grep postgres
```

**Solutions:**
1. **Start database:** `make db`
2. **Reset database:** `make clean && make db`
3. **Check URL format:**
   ```bash
   DATABASE_URL=postgresql://user:pass@host:port/dbname
   ```
4. **Run migrations:** `make migrate`

### ❌ Migration Errors

**Symptom:** Database schema is out of date

**Solutions:**
```bash
# Check migration status
npx prisma migrate status

# Force reset (WARNING: deletes data)
npx prisma migrate reset

# Apply specific migration
npx prisma migrate deploy
```

---

## Performance Issues

### ❌ High Memory Usage

**Symptom:** Browser or server consuming excessive memory

**Diagnosis:**
```bash
# Check memory usage
ps aux | grep -E "(chrome|node)"

# Check extension memory
chrome://settings/content/all → Extensions → Hanzi Browse
```

**Solutions:**
1. **Limit sessions:** `HANZI_BROWSE_MAX_SESSIONS=2`
2. **Restart browser:** Close all windows, restart Chrome
3. **Increase Node memory:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096"
   ```
4. **Clear browser cache:** `chrome://settings/clearBrowserData`

### ❌ Slow Task Execution

**Symptom:** Tasks take much longer than expected

**Solutions:**
1. **Check internet speed:** Ensure stable connection
2. **Reduce page complexity:** Target simpler pages when possible
3. **Use local selectors:** Avoid generic selectors like "div" 
4. **Cache responses:** Enable browser caching

---

## Development Issues

### ❌ Extension Hot Reload Not Working

**Symptom:** Extension changes don't appear after rebuild

**Solutions:**
1. **Reload extension:** `chrome://extensions` → click reload button
2. **Clear background page:** Inspect background page → clear console
3. **Restart browser:** Sometimes required for manifest changes
4. **Check build output:** Ensure `dist/` folder updated

### ❌ "Module not found" Errors

**Symptom:** Import/require errors during development

**Solutions:**
1. **Install dependencies:** `npm install` in all directories
2. **Check paths:** Verify import paths are correct
3. **Build first:** Run `make build` before testing
4. **Clear node_modules:** Delete and reinstall if needed

---

## API Integration Issues

### ❌ CORS Errors in Browser

**Symptom:** Web requests blocked by CORS policy

**Solutions:**
1. **Configure CORS origins:**
   ```javascript
   // In server configuration
   corsOrigins: ['https://yourdomain.com']
   ```
2. **Use server-side calls:** Call API from backend, not frontend
3. **Proxy requests:** Route through your server

### ❌ Webhook Not Received

**Symptom:** Stripe/external webhooks not triggering

**Diagnosis:**
```bash
# Check webhook endpoint
curl -X POST http://localhost:3456/api/billing/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": true}'

# Check ngrok (for local testing)
ngrok http 3456
```

**Solutions:**
1. **Use public URL:** Deploy or use ngrok for local testing
2. **Check webhook secret:** Verify `STRIPE_WEBHOOK_SECRET`
3. **Test endpoint:** Use webhook testing tools

---

## Environment-Specific Issues

### macOS Issues

**Symptom:** Permission errors, security warnings

**Solutions:**
1. **Allow terminal access:** System Preferences → Security → Privacy
2. **Disable Gatekeeper temporarily:**
   ```bash
   sudo spctl --master-disable
   ```
3. **Chrome security:** Allow Chrome to access files

### Windows Issues

**Symptom:** Path errors, PowerShell restrictions

**Solutions:**
1. **Use Command Prompt:** Instead of PowerShell
2. **Set execution policy:**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
   ```
3. **Use WSL:** Run in Windows Subsystem for Linux

### Linux Issues

**Symptom:** Missing dependencies, permission errors

**Solutions:**
1. **Install Chrome:**
   ```bash
   wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
   echo "deb https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
   sudo apt update && sudo apt install google-chrome-stable
   ```
2. **Fix permissions:**
   ```bash
   sudo chown -R $USER:$USER ~/.hanzi-browse
   ```

---

## Getting Help

### Log Collection

**Collect diagnostic information:**
```bash
# System info
node --version
npm --version
google-chrome --version

# Extension logs
# 1. Go to chrome://extensions
# 2. Click "background page" under Hanzi Browse  
# 3. Copy console output

# Server logs
tail -100 ~/.hanzi-browse/logs/server.log

# MCP logs
npx hanzi-browse mcp --debug
```

### Support Channels

1. **GitHub Issues:** [Report bugs](https://github.com/hanzili/hanzi-browse/issues)
2. **Discord:** [Community support](https://discord.gg/hahgu5hcA5)  
3. **Email:** hanzili0217@gmail.com (for partners/enterprise)

### Filing Bug Reports

**Include the following:**
- Operating system and version
- Browser version  
- Node.js version
- Complete error messages
- Steps to reproduce
- Configuration (remove secrets)

**Example:**
```
**Environment:**
- macOS 13.4
- Chrome 120.0.6099.199
- Node.js 18.17.0

**Error:**
WebSocket connection failed: Error: connect ECONNREFUSED

**Steps:**
1. Run `npx hanzi-browse setup`
2. Install extension
3. Try to run task

**Config:**
WS_RELAY_PORT=7862 (default)
```

---

## Known Issues

### Chrome Extension Manifest V3
- Some permissions may require user approval
- Background scripts have limited lifecycle
- **Workaround:** Keep browser window open during tasks

### Rate Limiting
- Some sites detect automation
- **Workaround:** Add delays, rotate user agents

### Memory Leaks
- Long-running sessions may accumulate memory
- **Workaround:** Restart browser periodically

---

## Still Having Issues?

1. Check the [FAQ](../README.md#faq) in the main README
2. Search existing [GitHub issues](https://github.com/hanzili/hanzi-browse/issues)
3. Join our [Discord](https://discord.gg/hahgu5hcA5) community
4. For urgent issues, email hanzili0217@gmail.com

**When reporting issues, always include:**
- Your environment details
- Complete error messages  
- Steps to reproduce
- What you expected vs what happened