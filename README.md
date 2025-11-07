# Kapoor Site - Simple Node Backend

This repository contains the static frontend files (kapoor.html, styles.css, images/) and a minimal Node/Express backend to serve them and provide a tiny API for the sample posters data.

## What I added

- `package.json` - minimal manifest (includes express dependency).
- `server.js` - Express server that:
  - Serves static files from the project root (so `kapoor.html`, `styles.css`, and `images/` are served)
  - GET `/api/list` — returns the posters array
  - GET `/api/search?key=NUMBER` — returns `{ index: <number> }` where index is position or -1
  - POST `/api/search` — accepts JSON `{ key: number }` and returns `{ index }`

## Run (PowerShell)

1. Open PowerShell and change to the project folder:

```powershell
cd "d:\MY CODES\dins kapoor"
```

2. Install dependencies:

```powershell
npm install
```

3. Start the server:

```powershell
npm start
```

4. Open the site in your browser:

http://localhost:3000/

## API examples

- GET list:
  - `http://localhost:3000/api/list` → returns `{ "list": [1,3,5,4,7,9] }`

- Search (query):
  - `http://localhost:3000/api/search?key=7` → returns `{ "index": 4 }`

- Search (POST):
  - POST `http://localhost:3000/api/search` with JSON body `{ "key": 7 }` → returns `{ "index": 4 }`

## Notes and next steps

 - I added a simple search UI to `kapoor.html` which queries `/api/search` and displays results inline.
 - Posters are now loaded from `data/posters.json`. Edit that file to change the dataset.
 - Dev scripts: `npm run dev` (requires `npm install` to install `nodemon`), `npm test` runs a small test against the running server (defaults to port 4000 if you started the server that way).
 - I added a simple search UI to `kapoor.html` which queries `/api/search` and displays results inline.
 - Posters are now loaded from `data/posters.json`. Edit that file to change the dataset.
 - Dev scripts: `npm run dev` (requires `npm install` to install `nodemon`), `npm test` runs a small test against the running server (defaults to port 4000 if you started the server that way).
 - Admin endpoints (`POST` and `DELETE` to `/api/posters`) are protected by an API key header `x-api-key`.
   - Default API key (development): `change-me`.
   - To set a custom key, set environment variable `ADMIN_API_KEY` before starting the server, e.g. in PowerShell:

```powershell
$env:ADMIN_API_KEY = 'your-secret-key'; $env:PORT=4000; npm start
```

 - Front-end admin UI includes an "Admin API Key" input and will persist the entered key to localStorage for convenience; it sends the key as `x-api-key` on admin requests.
