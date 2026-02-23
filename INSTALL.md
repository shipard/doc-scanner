# Installation on fresh Ubuntu 24.04 LTS for production

Before you begin the installation, ensure you have:
- A domain with a DNS A record pointing to the server's IP address.
- An SSL certificate for the domain (e.g. from Let's Encrypt).
- An SMTP server for sending emails (either your own or a public one with SMTP AUTH support).
- A Google Cloud project with OAuth 2.0 credentials for Google Sign-In.

## Install Core packages
```bash
# Install system dependencies
sudo apt update
sudo apt install -y curl git

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Nginx (for HTTPS reverse proxy)
sudo apt install -y nginx
```


## Clone the repository
```bash
# Clone the repository
cd /opt
sudo git clone https://github.com/shipard/doc-scanner.git
cd doc-scanner

# Install dependencies
sudo npm install
```


## Create PostgreSQL database
```bash
sudo -u postgres createuser scandoc
sudo -u postgres createdb scandoc -O scandoc
sudo -u postgres psql -c "ALTER USER scandoc PASSWORD 'secret-password';"
```


## Set up the .env file
```bash
# Copy .env.example to .env
sudo cp .env.example .env
```

Edit `.env` with your configuration. Make sure to set `NODE_ENV=production`.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | Must match Google console: `<BASE_URL>/auth/google/callback` |
| `SESSION_SECRET` | Random string ≥ 16 chars |
| `SMTP_*` | SMTP server configuration |
| `APPROVAL_WEBHOOK_URL` | Optional: auto-approval webhook URL |
| `BASE_URL` | Public URL of the app |

See .env.example for all configuration options.

## Run database migrations
```bash
npm run db:migrate
```

## Set up nginx

**Configuration file (`/etc/nginx/sites-available/scandoc`):**
```nginx
server {
    listen 443 ssl http2;
    # listen [::]:443 ssl http2; # Uncomment for IPv6 support
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    client_max_body_size 200M;  # For photo upload

    location / {
        proxy_pass http://127.0.0.1:3000; # Change 127.0.0.1 to localhost in IPv6 enabled environment
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
# this is not needed for domains with forced HSTS (eg. .dev, .app)
server {
    listen 80;
    # listen [::]:80; # Uncomment for IPv6 support
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
```

**Activate the configuration:**
```bash
sudo ln -s /etc/nginx/sites-available/scandoc /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```


## First run and admin activation
```bash
npm run build
npm start
```

Open a web browser and navigate to `https://app.example.com`.
After logging in to the application as a regular user, create an admin account:
```bash
npm run create-admin -- --email=user@example.com
```

Stop the server (Ctrl+C) — we'll run it as a systemd service instead.

## Set up systemd service
```bash
# Copy systemd service file
sudo cp /opt/doc-scanner/systemd/scandoc.service /etc/systemd/system/

# Create non-root user for running the app
sudo useradd -r -s /bin/false scandoc
sudo chown -R scandoc:scandoc /opt/doc-scanner
sudo chmod 600 /opt/doc-scanner/.env

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable scandoc
sudo systemctl start scandoc

# Verify the service is running
sudo systemctl status scandoc
sudo journalctl -u scandoc -f
```
