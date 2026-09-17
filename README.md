# Telegram Group and Channel Cleanup

A local toolkit for reviewing Telegram groups and channels before removing memberships. The browser is only a local UI; Telegram credentials, login prompts, and the Telethon session stay in the Python backend.

## Quick Start on Windows

### 1. Clone the repository

```powershell
git clone https://github.com/akinrinmade/Telegram-Group-Channel-Cleanup.git
cd Telegram-Group-Channel-Cleanup
```

### 2. Run setup

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
```

The setup script installs Python and Node dependencies and creates `backend/.env`. It asks for your Telegram API ID, API hash, and session name or path. Get API credentials from https://my.telegram.org.

### 3. Authenticate locally

If you already have an authenticated Telethon session, set its path in `backend/.env` and skip this step. Otherwise run:

```powershell
.\scripts\login.ps1
```

This may ask for your phone number, Telegram login code, and 2FA password in the terminal only. Nothing is sent through the browser.

### 4. Start the app

```powershell
.\scripts\start.ps1
```

Or double-click `Start Telegram Cleanup.ps1`. Open http://localhost:5173.

The sidebar includes `Reconnect Telegram`. Use it when the connection indicator is stale or Telegram temporarily drops the network connection. It reconnects the existing local session and shows the backend diagnostic message. It does not send credentials through the browser.

## macOS and Linux

Install Python 3.11 or 3.12, Node.js 18+, and npm. Create the backend environment with `python -m venv backend/.venv`, install `backend/requirements.txt`, run `npm install` inside `frontend`, configure `backend/.env`, and run the backend and frontend commands in the manual section below.

## What It Does

- Reads live Telegram memberships from an authenticated Telethon session.
- Supports search, type filters, review statuses, protected memberships, selection, and pagination.
- Saves review decisions locally in the browser.
- Performs leave operations only after the user selects memberships and confirms the final action.
- Skips protected memberships and reports successful and failed operations.

## Configuration

Create `backend/.env` from `backend/.env.example`:

```dotenv
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_SESSION=telegram_cleanup
```

`TELEGRAM_SESSION` can be a session name or a path without the `.session` suffix. The generated session file is local and ignored by Git.

If an authenticated session already exists, the backend uses it without creating a browser login flow. If no session exists, run `scripts/login.ps1` once.

The website cannot force a brand-new Telegram login securely because phone numbers, login codes, and 2FA passwords must stay out of the browser. Use `scripts/login.ps1` for first-time authentication, then use the website's reconnect button for normal recovery.

## Manual Development Commands

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell, activate with `backend\.venv\Scripts\Activate.ps1`.

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:5173 and the backend at http://localhost:8000.

## Safety and Privacy

- The frontend only talks to the local backend at `localhost:8000`.
- API ID, API hash, phone number, login code, 2FA password, session string, and session files never go to React.
- Never commit `backend/.env`, `*.session`, or credentials.
- Leaving memberships is irreversible. Review selections carefully and use `Protect` for anything that must remain.
- Do not deploy the backend publicly.

## Testing

```bash
cd backend
pytest
```

## Project Layout

```text
backend/       FastAPI, Telethon service, classifier, and safety checks
frontend/      React, Vite, TypeScript, and review UI
scripts/       Setup, local login, and startup helpers
```
