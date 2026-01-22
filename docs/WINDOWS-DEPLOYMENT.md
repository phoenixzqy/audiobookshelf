# Windows 11 Deployment Guide

Complete guide to deploy the Audiobook Platform on Windows 11, including exposing it to the public internet.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start (One-Click Install)](#quick-start)
3. [Manual Installation](#manual-installation)
4. [Server Management](#server-management)
5. [Auto-Start on Boot](#auto-start-on-boot)
6. [Expose to Public Network](#expose-to-public-network)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Automatic Installation (Recommended)

The `install-and-start.bat` script will **automatically install** Node.js and PostgreSQL if they are not already installed. Just run the script as Administrator and it will handle everything.

**Requirements for auto-install:**
- Windows 10 (version 1709 or later) or Windows 11
- Windows Package Manager (winget) - included by default in Windows 11

### Manual Installation (Alternative)

If auto-installation fails or you prefer manual control:

1. **Node.js 18+**
   - Download: https://nodejs.org/
   - Choose the LTS version
   - During installation, check "Automatically install necessary tools"

2. **PostgreSQL 14+**
   - Download: https://www.postgresql.org/download/windows/
   - Remember your password during installation (default: `postgres`)
   - Default port: 5432

3. **Git** (optional, for cloning)
   - Download: https://git-scm.com/download/win

### Verify Installation

Open Command Prompt and run:
```cmd
node -v
npm -v
psql --version
```

---

## Quick Start

### One-Click Installation

1. Navigate to the `scripts` folder
2. Right-click on `install-and-start.bat`
3. Select **"Run as administrator"** (required for auto-installing prerequisites)

This will:
- **Auto-install Node.js** (if not installed) via winget
- **Auto-install PostgreSQL** (if not installed) via winget
- Start PostgreSQL service if not running
- Create the `audiobookshelf` database
- Install all npm dependencies
- Create database tables
- Create admin account (admin@test.com / admin)
- Start the server on port 8081

### Default Credentials
- **URL**: http://localhost:8081
- **Admin Email**: admin@test.com
- **Admin Password**: admin

### PostgreSQL Password Note

The default configuration assumes PostgreSQL password is `postgres`. If you set a different password during PostgreSQL installation:

1. Edit `backend\.env`
2. Update the `DATABASE_URL` line:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/audiobookshelf
   ```

---

## Manual Installation

### Step 1: Database Setup

1. Open pgAdmin or psql
2. Create a new database:
```sql
CREATE DATABASE audiobookshelf;
```

3. Update connection string in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/audiobookshelf
```

### Step 2: Backend Setup

```cmd
cd backend
npm install
npm run reset-db
npm run create-admin -- --email admin@test.com --password admin
```

### Step 3: Frontend Setup

```cmd
cd frontend
npm install
npm run build
```

### Step 4: Start Server

```cmd
cd backend
npm run dev
```

---

## Server Management

### Available Scripts

All scripts are in the `scripts` folder:

| Script | Description |
|--------|-------------|
| `install-and-start.bat` | Full installation + start server |
| `start-server.bat` | Start server (foreground) |
| `start-background.bat` | Start server (background) |
| `stop-server.bat` | Stop running server |
| `restart-server.bat` | Restart server |
| `setup-autostart.bat` | Enable auto-start on boot (requires admin) |
| `remove-autostart.bat` | Disable auto-start (requires admin) |

### Check Server Status

Open browser: http://localhost:8081/health

Or in Command Prompt:
```cmd
curl http://localhost:8081/health
```

### View Server Logs

Logs are stored in `logs/server.log` when running in background mode.

```cmd
type logs\server.log
```

---

## Auto-Start on Boot

### Setup Auto-Start

1. Right-click `scripts/setup-autostart.bat`
2. Select "Run as administrator"
3. Follow the prompts

This creates a Windows Task Scheduler task that:
- Starts the server 30 seconds after Windows boots
- Runs silently in background
- Restarts if it crashes

### Remove Auto-Start

1. Right-click `scripts/remove-autostart.bat`
2. Select "Run as administrator"

### Manual Task Scheduler Setup

If the script doesn't work:

1. Open Task Scheduler (`taskschd.msc`)
2. Create Basic Task
3. Name: `AudiobookshelfServer`
4. Trigger: "When the computer starts"
5. Action: Start a program
6. Program: `wscript.exe`
7. Arguments: `"C:\path\to\audiobookshelf\scripts\silent-start.vbs"`
8. Check "Run with highest privileges"

---

## Expose to Public Network

### Option 1: Cloudflare Tunnel (Recommended)

**Pros**: Free, secure, no port forwarding, automatic HTTPS, hides your IP

1. **Create Cloudflare Account**
   - Sign up at https://dash.cloudflare.com/
   - Add your domain or use a free `.trycloudflare.com` subdomain

2. **Install Cloudflared**
   - Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   - Or via winget:
   ```cmd
   winget install Cloudflare.cloudflared
   ```

3. **Quick Tunnel (No Account Required)**
   ```cmd
   cloudflared tunnel --url http://localhost:8081
   ```
   This gives you a temporary public URL like `https://random-name.trycloudflare.com`

4. **Permanent Tunnel (With Account)**
   ```cmd
   cloudflared tunnel login
   cloudflared tunnel create audiobookshelf
   cloudflared tunnel route dns audiobookshelf your-domain.com
   cloudflared tunnel run audiobookshelf
   ```

5. **Auto-Start Cloudflared**
   ```cmd
   cloudflared service install
   ```

### Option 2: Tailscale (For Personal/Family Use)

**Pros**: Free for personal use, very secure, easy setup, works through NAT

1. **Install Tailscale**
   - Download: https://tailscale.com/download/windows
   - Sign in with Google/Microsoft/GitHub

2. **Access from Other Devices**
   - Install Tailscale on phone/other computers
   - Access via `http://your-pc-name:8081` or IP shown in Tailscale

### Option 3: Port Forwarding + Dynamic DNS

**Pros**: Direct connection, no third-party
**Cons**: Exposes your IP, requires router config, no automatic HTTPS

1. **Configure Windows Firewall**
   ```cmd
   netsh advfirewall firewall add rule name="Audiobookshelf" dir=in action=allow protocol=tcp localport=8081
   ```

2. **Router Port Forwarding**
   - Log into your router (usually 192.168.1.1)
   - Find "Port Forwarding" settings
   - Forward external port 8081 to your PC's local IP, port 8081

3. **Dynamic DNS** (for changing IP addresses)
   - Use a free service like:
     - No-IP (https://www.noip.com/)
     - DuckDNS (https://www.duckdns.org/)
     - Dynu (https://www.dynu.com/)

   - Install their client to auto-update your IP

4. **Find Your Public IP**
   ```cmd
   curl ifconfig.me
   ```

### Option 4: ngrok (For Testing)

**Pros**: Quick setup, good for testing
**Cons**: Free tier has limitations, URL changes each restart

1. **Install ngrok**
   ```cmd
   winget install ngrok.ngrok
   ```

2. **Start Tunnel**
   ```cmd
   ngrok http 8081
   ```

### Security Recommendations

When exposing to the internet:

1. **Change Default Password**
   - Log in as admin@test.com
   - Go to settings and change password

2. **Use HTTPS**
   - Cloudflare Tunnel provides automatic HTTPS
   - For other methods, use Let's Encrypt with a reverse proxy

3. **Update JWT Secret**
   - Edit `backend/.env`
   - Change `JWT_SECRET` to a long random string:
   ```
   JWT_SECRET=your-very-long-random-string-at-least-32-characters
   ```

4. **Enable Rate Limiting**
   - Already enabled by default (100 requests per 15 minutes)

---

## Configuration

### Environment Variables

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/audiobookshelf

# JWT Security
JWT_SECRET=change-this-to-a-very-long-random-string
JWT_ACCESS_EXPIRY=1d
JWT_REFRESH_EXPIRY_DAYS=180

# Server
PORT=8081
NODE_ENV=production

# Storage
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=./storage

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

### Change Port

1. Edit `backend/.env`:
   ```
   PORT=YOUR_NEW_PORT
   ```

2. Edit `frontend/.env`:
   ```
   VITE_API_URL=http://localhost:YOUR_NEW_PORT/api
   ```

3. Rebuild frontend:
   ```cmd
   cd frontend
   npm run build
   ```

---

## Troubleshooting

### "Node.js not found"

- Reinstall Node.js from https://nodejs.org/
- Make sure to check "Add to PATH" during installation
- Restart Command Prompt after installation

### "Database connection failed"

1. Check PostgreSQL is running:
   ```cmd
   pg_isready
   ```

2. Verify connection string in `backend/.env`

3. Try connecting manually:
   ```cmd
   psql -U postgres -d audiobookshelf
   ```

### "Port 8081 already in use"

1. Find what's using the port:
   ```cmd
   netstat -ano | findstr :8081
   ```

2. Kill the process:
   ```cmd
   taskkill /F /PID <PID_NUMBER>
   ```

### "EACCES permission denied"

- Run Command Prompt as Administrator
- Or change the storage path in `.env` to a folder you have access to

### "Cannot access from other devices on LAN"

1. Check Windows Firewall:
   ```cmd
   netsh advfirewall firewall add rule name="Audiobookshelf" dir=in action=allow protocol=tcp localport=8081
   ```

2. Find your local IP:
   ```cmd
   ipconfig
   ```
   Look for "IPv4 Address" under your network adapter

3. Access from other devices using: `http://YOUR_LOCAL_IP:8081`

### Server Keeps Crashing

1. Check logs in `logs/server.log`

2. Increase memory for Node.js:
   ```cmd
   set NODE_OPTIONS=--max-old-space-size=4096
   npm run dev
   ```

3. Check disk space for storage

---

## Backup & Restore

### Backup Database

```cmd
pg_dump -U postgres audiobookshelf > backup.sql
```

### Restore Database

```cmd
psql -U postgres audiobookshelf < backup.sql
```

### Backup Audio Files

Copy the `backend/storage` folder to your backup location.

---

## Updates

To update to a new version:

1. Stop the server:
   ```cmd
   scripts\stop-server.bat
   ```

2. Pull latest code (if using git):
   ```cmd
   git pull
   ```

3. Update dependencies:
   ```cmd
   cd backend && npm install
   cd ../frontend && npm install && npm run build
   ```

4. Run migrations (if any):
   ```cmd
   cd backend && npm run migrate
   ```

5. Restart:
   ```cmd
   scripts\start-server.bat
   ```

---

## Support

- Check `logs/server.log` for error details
- Ensure all prerequisites are installed
- Try running `install-and-start.bat` again

---

*Last Updated: January 2025*
