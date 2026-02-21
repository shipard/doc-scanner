# PRD: ScanDoc — Aplikace pro skenování a odesílání dokladů

## 1. Přehled projektu

**ScanDoc** je progresivní webová aplikace (PWA) optimalizovaná pro mobilní telefony, která slouží ke skenování účtenek a dokladů pomocí fotoaparátu. Naskenované fotografie se odešlou na server, ten je spojí do jednoho PDF souboru a odešle emailem zvolenému příjemci. Aplikace podporuje offline režim — doklady lze naskenovat i bez připojení k internetu a odeslat později.

### Klíčové vlastnosti
- PWA optimalizovaná pro moderní Android a iOS
- Focení dokladů přímo z aplikace (až 10 fotek na doklad)
- Offline fronta s automatickým odesíláním po obnovení připojení
- Generování PDF (jedna fotka = jedna stránka A4, fit to page)
- Odesílání PDF emailem přes vlastní SMTP server
- OAuth přihlašování (Google, Apple Sign-In)
- Systém pozvánek a schvalování nových uživatelů
- Administrační rozhraní pro správce
- Vícejazyčné UI (čeština, angličtina)

---

## 2. Technický stack

| Komponenta | Technologie |
|---|---|
| **Frontend (PWA)** | React + Vite, Service Worker, Web App Manifest |
| **Backend** | Node.js + Fastify |
| **Databáze** | PostgreSQL |
| **Autentizace** | OAuth 2.0 (Google, Apple Sign-In) |
| **Email** | Nodemailer + vlastní SMTP server |
| **PDF generování** | pdf-lib (nebo sharp + PDFKit) |
| **Admin UI** | Server-side rendered (Fastify + šablonovací engine, např. Handlebars/EJS) |
| **Deployment** | Ubuntu LXC kontejner, systemd, nginx reverse proxy |
| **Jazyk** | TypeScript (frontend i backend) |

---

## 3. Architektura

```
┌─────────────────────────────────────┐
│  Mobilní prohlížeč (PWA)            │
│  - React SPA                        │
│  - Service Worker (offline podpora) │
│  - IndexedDB (offline fronta)       │
│  - Camera API                       │
└──────────────┬──────────────────────┘
               │ HTTPS REST API
               ▼
┌─────────────────────────────────────┐
│  Node.js / Fastify server           │
│  - REST API (klient + admin)        │
│  - OAuth callback handling          │
│  - PDF generování                   │
│  - SMTP odesílání                   │
│  - Server-side rendered admin UI    │
│  - API pro pozvánky (ext. systémy)  │
│  - API pro auto-schvalování         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  PostgreSQL                         │
│  - Uživatelé                        │
│  - Pozvánky                         │
│  - Log odeslaných dokladů           │
│  - API klíče                        │
└─────────────────────────────────────┘
```

---

## 4. Databázový model

### Tabulka: `users`
| Sloupec | Typ | Popis |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR UNIQUE NOT NULL | Email z OAuth |
| name | VARCHAR NOT NULL | Jméno z OAuth |
| oauth_provider | VARCHAR NOT NULL | 'google' / 'apple' |
| oauth_id | VARCHAR NOT NULL | ID z OAuth providera |
| status | ENUM | 'pending_approval', 'active', 'suspended' |
| is_admin | BOOLEAN DEFAULT false | |
| invite_id | UUID NULL FK → invites.id | Pozvánka, přes kterou se registroval |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Tabulka: `invites`
| Sloupec | Typ | Popis |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR NOT NULL | Email příjemce |
| name | VARCHAR | Jméno příjemce |
| token | VARCHAR UNIQUE NOT NULL | Unikátní token pro URL |
| status | ENUM | 'pending', 'accepted', 'expired' |
| created_by | UUID NULL FK → users.id | Kdo pozvánku vytvořil (NULL = API) |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | Expirace pozvánky |
| accepted_at | TIMESTAMPTZ NULL | |

### Tabulka: `document_logs`
| Sloupec | Typ | Popis |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | Kdo odeslal |
| recipient_email | VARCHAR NOT NULL | Email příjemce |
| recipient_name | VARCHAR | Jméno příjemce |
| note | VARCHAR | Poznámka / subject emailu |
| photo_count | INTEGER | Počet fotek v dokladu |
| status | ENUM | 'received', 'processing', 'sent', 'failed' |
| error_message | TEXT NULL | Chybová hláška při selhání |
| created_at | TIMESTAMPTZ | |
| sent_at | TIMESTAMPTZ NULL | |

### Tabulka: `api_keys`
| Sloupec | Typ | Popis |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR NOT NULL | Popis klíče (např. "ERP systém") |
| key_hash | VARCHAR NOT NULL | Hash API klíče |
| key_prefix | VARCHAR NOT NULL | Prvních 8 znaků klíče (pro identifikaci) |
| is_active | BOOLEAN DEFAULT true | |
| created_by | UUID FK → users.id | Admin, který klíč vytvořil |
| created_at | TIMESTAMPTZ | |
| last_used_at | TIMESTAMPTZ NULL | |

---

## 5. API endpointy

### 5.1 Autentizace

| Metoda | Endpoint | Popis |
|---|---|---|
| GET | `/auth/google` | Zahájení OAuth flow s Google |
| GET | `/auth/google/callback` | Google OAuth callback |
| GET | `/auth/apple` | Zahájení OAuth flow s Apple |
| GET | `/auth/apple/callback` | Apple OAuth callback |
| POST | `/auth/logout` | Odhlášení (zneplatnění session) |
| GET | `/auth/me` | Info o aktuálním uživateli |

Při prvním přihlášení se vytvoří uživatel se statusem `pending_approval`. Poté se provede auto-schvalovací flow (viz sekce 7).

Pokud se uživatel přihlásí přes pozvánkový odkaz (URL obsahuje `?invite=<token>`), je automaticky schválen a pozvánka označena jako přijatá.

### 5.2 Klientské API (vyžaduje autentizaci + status 'active')

| Metoda | Endpoint | Popis |
|---|---|---|
| POST | `/api/documents` | Odeslání naskenovaného dokladu |
| GET | `/api/documents` | Historie odeslaných dokladů (vlastní) |

#### POST `/api/documents`
- Content-Type: `multipart/form-data`
- Pole:
  - `photos[]` — 1–10 obrázků (JPEG/PNG, originální velikost)
  - `recipientEmail` — email příjemce
  - `recipientName` — jméno příjemce
  - `note` — volitelná poznámka

Odpověď: `201 Created` s ID záznamu v logu.

### 5.3 Externě volané API (vyžaduje API klíč v hlavičce)

Hlavička: `X-API-Key: <api_klíč>`

| Metoda | Endpoint | Popis |
|---|---|---|
| POST | `/api/external/invites` | Vytvoření pozvánky z externího systému |

#### POST `/api/external/invites`
```json
{
  "name": "Jan Novák",
  "email": "jan@example.com"
}
```
Odpověď: `201 Created`
```json
{
  "success": true,
  "inviteId": "uuid",
  "inviteUrl": "https://app.example.com/invite/abc123"
}
```

### 5.4 Auto-schvalovací webhook (interní, volaný serverem)

Při registraci nového uživatele (který nepřišel přes pozvánku) server odešle POST na nakonfigurovanou URL:

```json
POST <APPROVAL_WEBHOOK_URL>
Content-Type: application/json

{
  "name": "Jan Novák",
  "email": "jan@example.com"
}
```

Očekávaná odpověď:
```json
{ "success": 1 }
```

Pokud odpověď obsahuje `success: 1` → uživatel je automaticky schválen (status → `active`).
Pokud odpověď neobsahuje `success: 1` nebo webhook selže → uživatel zůstává `pending_approval` a čeká na manuální schválení adminem.

### 5.5 Admin API (server-side rendered stránky, vyžaduje admin session)

| Metoda | Endpoint | Popis |
|---|---|---|
| GET | `/admin` | Dashboard |
| GET | `/admin/users` | Seznam uživatelů |
| POST | `/admin/users/:id/approve` | Schválení uživatele |
| POST | `/admin/users/:id/suspend` | Pozastavení účtu |
| POST | `/admin/users/:id/activate` | Reaktivace účtu |
| DELETE | `/admin/users/:id` | Smazání uživatele |
| POST | `/admin/users/:id/toggle-admin` | Přepnutí admin role |
| GET | `/admin/invites` | Seznam pozvánek |
| POST | `/admin/invites` | Vytvoření nové pozvánky (formulář: jméno + email) |
| DELETE | `/admin/invites/:id` | Zrušení pozvánky |
| GET | `/admin/logs` | Prohlížení logů odeslaných dokladů |
| GET | `/admin/api-keys` | Správa API klíčů |
| POST | `/admin/api-keys` | Vytvoření nového API klíče |
| DELETE | `/admin/api-keys/:id` | Deaktivace API klíče |

---

## 6. Frontend (PWA) — detailní specifikace

### 6.1 Obrazovky

#### Přihlašovací obrazovka
- Logo aplikace
- Tlačítko "Přihlásit se přes Google"
- Tlačítko "Přihlásit se přes Apple"
- Přepínač jazyka (CZ/EN)
- Pokud uživatel čeká na schválení → informační hláška "Váš účet čeká na schválení"

#### Hlavní obrazovka (po přihlášení)
- Horní lišta s názvem aplikace, ikona nastavení
- Velké tlačítko **"Nový doklad"**
- Pod ním: **Fronta k odeslání** — seznam neodeslených dokladů (pokud jsou)
  - U každého: příjemce, počet fotek, stav (čeká / odesílání / chyba)
  - U chybového stavu: tlačítko **"Zkusit znovu"**
- Pod tím: **Poslední odeslané** — posledních N úspěšně odeslaných dokladů

#### Obrazovka nového dokladu
1. **Sekce fotek:**
   - Tlačítko "Vyfotit" — otevře fotoaparát (využívá `<input type="file" accept="image/*" capture="environment">` nebo MediaStream API)
   - Mřížka náhledů pořízených fotek (thumbnaily)
   - U každé fotky tlačítko ✕ pro smazání
   - Indikátor počtu fotek (např. "3/10")
   - Minimálně 1 fotka je povinná
2. **Poznámka:** textové pole (volitelné)
3. **Příjemce:** rozbalovací seznam (select) s nakonfigurovanými příjemci
   - Pokud žádný příjemce není nakonfigurován → odkaz do Nastavení
4. **Tlačítko "Odeslat"**
   - Doklad se uloží do offline fronty (IndexedDB)
   - Pokud je online → ihned se pokusí odeslat
   - Po úspěšném odeslání → přesměrování na hlavní obrazovku s potvrzením
   - Pokud offline → přesměrování na hlavní obrazovku s hláškou "Doklad bude odeslán, až budete online"

#### Nastavení
- **Příjemci:** seznam dvojic (Název, Email)
  - Přidat nového příjemce
  - Upravit existujícího
  - Smazat příjemce
  - Data se ukládají do localStorage
- **Jazyk:** přepínač CZ / EN
- **O aplikaci:** verze, odkaz na podporu
- **Odhlásit se**

### 6.2 Offline fronta

Implementace pomocí **IndexedDB** (robustnější než localStorage pro binární data/fotky).

#### Datová struktura záznamu ve frontě:
```typescript
interface QueuedDocument {
  id: string;              // UUID generované na klientovi
  photos: Blob[];          // Originální fotky
  recipientEmail: string;
  recipientName: string;
  note: string;
  status: 'pending' | 'sending' | 'failed';
  attempts: number;        // Počet pokusů o odeslání
  maxAttempts: 3;
  lastAttemptAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}
```

#### Logika odesílání:
1. Po uložení dokladu do fronty — pokud je online, ihned pokus o odeslání.
2. Při obnovení připojení (`navigator.onLine` + `online` event) — automatický pokus odeslat všechny `pending` záznamy.
3. Při selhání — inkrementace `attempts`. Po 3 neúspěšných pokusech → status `failed`, zobrazení chybové hlášky + tlačítko "Zkusit znovu".
4. Exponenciální backoff mezi pokusy: 5s, 15s, 45s.
5. Tlačítko "Zkusit znovu" resetuje počítadlo pokusů a okamžitě se pokusí odeslat.
6. Po úspěšném odeslání → smazání záznamu z IndexedDB.

### 6.3 Service Worker

- Caching strategie: Cache-first pro statické assety (JS, CSS, ikony), Network-first pro API volání.
- Manifest: `display: standalone`, ikony, `theme_color`, `start_url`.
- Offline fallback stránka.

### 6.4 Vícejazyčnost (i18n)

- Knihovna: `react-i18next`
- Soubory překladu: `locales/cs.json`, `locales/en.json`
- Automatická detekce jazyka prohlížeče (`navigator.language`)
- Uživatel může přepnout jazyk v Nastavení (uloží se do localStorage)
- Výchozí jazyk: čeština (pokud prohlížeč hlásí `cs`), jinak angličtina

---

## 7. Backend — detailní specifikace

### 7.1 Zpracování dokladu (POST `/api/documents`)

1. Přijetí multipart requestu (fotky + metadata).
2. Validace: 1–10 fotek, povinný email příjemce, uživatel musí být `active`.
3. Uložení záznamu do `document_logs` se statusem `received`.
4. Zpracování (synchronně nebo v pozadí):
   a. Status → `processing`
   b. Generování PDF:
      - Pro každou fotku jedna A4 stránka.
      - Fotka se vejde na stránku (fit to page) se zachováním poměru stran.
      - Knihovna: `pdf-lib` (pure JS, bez nativních závislostí).
   c. Odeslání emailu přes SMTP:
      - **To:** email příjemce
      - **Subject:** poznámka uživatele, pokud je prázdná → "Naskenovaný dokument" (respektive lokalizováno)
      - **Body:** "Posílám naskenovaný dokument."
      - **Příloha:** vygenerovaný PDF soubor
   d. Status → `sent`, uložení `sent_at`.
   e. Při chybě: status → `failed`, uložení `error_message`.

### 7.2 OAuth flow

1. Uživatel klikne na "Přihlásit se přes Google/Apple".
2. Redirect na OAuth provider.
3. Provider vrátí callback s authorization code.
4. Server vymění code za access token, získá profil (jméno, email).
5. Kontrola, zda uživatel existuje v DB:
   - **Ano:** přihlášení (vytvoření session).
   - **Ne:** vytvoření nového uživatele:
     a. Pokud přišel přes pozvánkový odkaz (query param `invite`) → automatické schválení → status `active`.
     b. Pokud ne → zavolání auto-schvalovacího webhooku.
        - Webhook vrátí `{ "success": 1 }` → status `active`.
        - Jinak → status `pending_approval`.
6. Session management: HTTP-only cookie s JWT nebo session ID.

### 7.3 Pozvánky

#### Ruční vytvoření (admin):
1. Admin vyplní jméno a email ve formuláři.
2. Server vytvoří záznam v `invites` s unikátním tokenem.
3. Server odešle email s pozvánkou:
   - **Subject:** "Pozvánka do ScanDoc" (lokalizováno)
   - **Body:** "Byli jste pozváni do aplikace ScanDoc. Klikněte na odkaz níže pro registraci: `https://app.example.com/invite/<token>`"

#### API vytvoření (externí systém):
1. POST na `/api/external/invites` s API klíčem v hlavičce `X-API-Key`.
2. Stejná logika jako ruční vytvoření.
3. Odpověď obsahuje `inviteUrl`.

#### Přijetí pozvánky:
1. Uživatel klikne na odkaz `https://app.example.com/invite/<token>`.
2. Frontend uloží token, přesměruje na přihlášení.
3. Po OAuth callbacku server zkontroluje token → automatické schválení uživatele.
4. Pozvánka se označí jako `accepted`.

### 7.4 SMTP konfigurace

Konfigurace přes environment proměnné:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=noreply@example.com
SMTP_PASS=xxxxx
SMTP_FROM="ScanDoc <noreply@example.com>"
```

### 7.5 Auto-schvalovací webhook

Konfigurace přes environment proměnné:
```
APPROVAL_WEBHOOK_URL=https://erp.example.com/api/approve-user
APPROVAL_WEBHOOK_TIMEOUT=5000
```

Pokud `APPROVAL_WEBHOOK_URL` není nastavena → všichni noví uživatelé (bez pozvánky) jdou do `pending_approval`.

---

## 8. Admin rozhraní — detailní specifikace

Server-side rendered HTML stránky (Fastify + EJS/Handlebars). Jednoduchý, funkční design (lze použít Bootstrap nebo Tailwind CSS).

### Stránky:

#### Dashboard (`/admin`)
- Počet aktivních uživatelů
- Počet čekajících na schválení
- Počet odeslaných dokladů (dnes / celkem)
- Počet nevyřízených pozvánek

#### Správa uživatelů (`/admin/users`)
- Tabulka: jméno, email, status, admin, vytvořen, akce
- Akce: schválit / pozastavit / aktivovat / smazat / přepnout admin
- Filtr podle statusu

#### Schvalování (`/admin/users?status=pending_approval`)
- Filtrovaný pohled na čekající uživatele
- Tlačítka: Schválit / Zamítnout (smazat)

#### Pozvánky (`/admin/invites`)
- Tabulka: jméno, email, status, vytvořeno, expiruje, akce
- Formulář pro vytvoření nové pozvánky (jméno + email)
- Akce: zrušit pozvánku

#### Logy (`/admin/logs`)
- Tabulka: datum, odesílatel, příjemce, poznámka, počet fotek, status
- Filtr podle data, statusu, odesílatele
- Stránkování

#### API klíče (`/admin/api-keys`)
- Tabulka: název, prefix klíče, aktivní, vytvořeno, naposledy použito
- Formulář pro vytvoření nového klíče
  - Po vytvoření se klíč zobrazí jednou (plain text) — poté jen hash
- Akce: deaktivovat klíč

---

## 9. Konfigurace

### Environment proměnné:
```env
# Server
PORT=3000
HOST=0.0.0.0
BASE_URL=https://app.example.com
NODE_ENV=production

# Databáze
DATABASE_URL=postgresql://user:pass@localhost:5432/scandoc

# OAuth - Google
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=https://app.example.com/auth/google/callback

# OAuth - Apple
APPLE_CLIENT_ID=xxx
APPLE_TEAM_ID=xxx
APPLE_KEY_ID=xxx
APPLE_PRIVATE_KEY=xxx
APPLE_CALLBACK_URL=https://app.example.com/auth/apple/callback

# Session
SESSION_SECRET=xxx

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=noreply@example.com
SMTP_PASS=xxx
SMTP_FROM="ScanDoc <noreply@example.com>"

# Auto-schvalování
APPROVAL_WEBHOOK_URL=https://erp.example.com/api/approve-user
APPROVAL_WEBHOOK_TIMEOUT=5000

# Pozvánky
INVITE_EXPIRY_DAYS=7
```

---

## 10. Bezpečnost

- Všechna API volání vyžadují autentizaci (kromě OAuth endpoints a invite přijetí).
- Admin endpointy vyžadují `is_admin = true`.
- Externí API vyžaduje validní API klíč v hlavičce `X-API-Key`.
- API klíče se ukládají jako hash (bcrypt/SHA-256).
- Rate limiting na API endpointy (zejména upload a login).
- Validace a sanitizace všech vstupů.
- CORS pouze pro doménu aplikace.
- HTTP-only, Secure, SameSite cookies pro session.
- Upload fotek: validace MIME type + velikost (max 20 MB na fotku).
- CSRF ochrana na admin formuláře.

---

## 11. Deployment

### Prostředí: Ubuntu LXC kontejner

Aplikace běží nativně na Ubuntu v LXC kontejneru. Veškeré závislosti se instalují přes `apt` a `npm`.

### Systémové závislosti (apt):
```bash
# Node.js (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Nginx (reverse proxy + HTTPS terminace)
sudo apt install -y nginx

# Certbot pro Let's Encrypt (HTTPS)
sudo apt install -y certbot python3-certbot-nginx
```

### Nastavení PostgreSQL:
```bash
sudo -u postgres createuser scandoc
sudo -u postgres createdb scandoc -O scandoc
sudo -u postgres psql -c "ALTER USER scandoc PASSWORD 'secure_password';"
```

### Instalace aplikace:
```bash
# Klonování a build
cd /opt
git clone <repo-url> scandoc
cd scandoc
npm ci
npm run build

# Konfigurace
cp .env.example .env
# Upravit .env dle prostředí

# Databázové migrace
npm run db:migrate
```

### Systemd service (`/etc/systemd/system/scandoc.service`):
```ini
[Unit]
Description=ScanDoc Application
After=network.target postgresql.service

[Service]
Type=simple
User=scandoc
WorkingDirectory=/opt/scandoc
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/scandoc/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false scandoc
sudo chown -R scandoc:scandoc /opt/scandoc
sudo systemctl enable --now scandoc
```

### Nginx reverse proxy (`/etc/nginx/sites-available/scandoc`):
```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    client_max_body_size 200M;  # Pro upload fotek

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/scandoc /etc/nginx/sites-enabled/
sudo certbot --nginx -d app.example.com
sudo systemctl reload nginx
```

### Databázové migrace:
- Pomocí knihovny `node-pg-migrate` nebo `knex` migrations.
- Spouštění: `npm run db:migrate` (ručně po každém updatu).

### Aktualizace aplikace:
```bash
cd /opt/scandoc
git pull
npm ci
npm run build
npm run db:migrate
sudo systemctl restart scandoc
```

---

## 12. Struktura projektu

```
scandoc/
├── .env.example
├── package.json
├── tsconfig.json
│
├── src/
│   ├── server/
│   │   ├── index.ts                 # Entry point, Fastify setup
│   │   ├── config.ts                # Environment proměnné
│   │   ├── db/
│   │   │   ├── connection.ts        # PostgreSQL připojení
│   │   │   └── migrations/          # DB migrace
│   │   ├── routes/
│   │   │   ├── auth.ts              # OAuth routes
│   │   │   ├── documents.ts         # Upload + zpracování dokladů
│   │   │   ├── external.ts          # Externí API (pozvánky)
│   │   │   └── admin.ts             # Admin routes
│   │   ├── services/
│   │   │   ├── pdf.ts               # Generování PDF
│   │   │   ├── email.ts             # SMTP odesílání
│   │   │   ├── approval.ts          # Auto-schvalovací webhook
│   │   │   └── invite.ts            # Logika pozvánek
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Session/JWT middleware
│   │   │   ├── admin.ts             # Admin guard
│   │   │   └── apiKey.ts            # API key validace
│   │   └── views/                   # Admin šablony (EJS/Handlebars)
│   │       ├── layout.ejs
│   │       ├── dashboard.ejs
│   │       ├── users.ejs
│   │       ├── invites.ejs
│   │       ├── logs.ejs
│   │       └── api-keys.ejs
│   │
│   └── client/
│       ├── index.html
│       ├── main.tsx                  # React entry point
│       ├── App.tsx                   # Routing
│       ├── sw.ts                     # Service Worker
│       ├── manifest.json             # PWA manifest
│       ├── components/
│       │   ├── LoginScreen.tsx
│       │   ├── HomeScreen.tsx
│       │   ├── NewDocument.tsx
│       │   ├── Settings.tsx
│       │   ├── QueueList.tsx
│       │   └── LanguageSwitcher.tsx
│       ├── services/
│       │   ├── api.ts                # HTTP klient
│       │   ├── queue.ts              # IndexedDB offline fronta
│       │   ├── sync.ts               # Online/offline synchronizace
│       │   └── auth.ts               # OAuth helpers
│       ├── i18n/
│       │   ├── index.ts              # i18next setup
│       │   ├── cs.json               # České překlady
│       │   └── en.json               # Anglické překlady
│       └── styles/
│           └── global.css
│
└── scripts/
    └── create-admin.ts              # CLI skript pro vytvoření prvního admina
```

---

## 13. Vytvoření prvního administrátora

Po prvním nasazení je potřeba vytvořit administrátorský účet. K tomu slouží CLI skript:

```bash
npx ts-node scripts/create-admin.ts --email admin@example.com
```

Skript nastaví existujícímu uživateli (který se již přihlásil přes OAuth) flag `is_admin = true`. Pokud uživatel s daným emailem neexistuje, skript o tom informuje a doporučí se nejprve přihlásit přes aplikaci.

---

## 14. Budoucí rozšíření (mimo scope první verze)

- OCR rozpoznávání textu z dokladů
- Kategorizace dokladů
- Export logů do CSV
- Push notifikace
- Více OAuth providerů (Microsoft, GitHub)
- Hromadné odesílání
- Komprese fotek na klientovi (volitelné nastavení)
- Automatická expirace a cleanup starých logů

---

## 15. Akceptační kritéria pro MVP

1. ✅ Uživatel se přihlásí přes Google OAuth.
2. ✅ Nový uživatel projde schvalovacím procesem (webhook nebo manuálně).
3. ✅ Uživatel vyfotí 1–10 fotek dokladu.
4. ✅ Uživatel vybere příjemce a odešle doklad.
5. ✅ Server vygeneruje PDF (1 fotka = 1 A4 stránka) a odešle emailem.
6. ✅ Offline fronta funguje — doklad se odešle po obnovení připojení.
7. ✅ Po 3 neúspěšných pokusech se zobrazí chyba + tlačítko "Zkusit znovu".
8. ✅ Admin může spravovat uživatele, pozvánky, logy a API klíče.
9. ✅ Pozvánky fungují — ruční i přes API.
10. ✅ UI je v češtině a angličtině s automatickou detekcí jazyka.
11. ✅ Aplikace je instalovatelná jako PWA.
