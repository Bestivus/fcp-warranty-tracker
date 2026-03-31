# 📦 FCP Euro Warranty Tracker

A dumb vibe-coded, self-hosted, web application designed to track purchases from FCP Euro to make the RMA process easier.  I'm lazy, my spreadsheet wasn't cutting it anymore, and I was curious how deep I could go while letting AI take the wheel.  **DO NOT TRUST THIS APP WHATSOEVER.**  I have it hosted locally without any outside access just for my own use.

Also this README was AI generated too because YOLO

## ✨ Features

-   **🚗 Multi-Vehicle Support:** Group parts by order number, even if you bought parts for three different cars in the same cart to hit free shipping.
    
-   **♻️ Smart Replacement Wizard:** Easily swap an active part for a new one.
    
    -   **Partial Returns:** Returning only 1 out of 4 spark plugs? The app automatically splits the database row so you don't lose track of the 3 still on the car.
        
    -   **Write-Offs:** Did a wiper blade fly off on the highway? Mark it as "Lost/Discarded" to keep your history intact without clogging up your Returns Queue.
        
-   **🔗 Bi-Directional Linking:** Automatically links your old returned part to the new replacement order so you always have a paper trail.
    
-   **💰 Financial Tracking:** Instantly calculates your "Pending Credit" for parts currently in the mail, and tracks your "Lifetime Refunded" swagger.
    
-   **📥 Seamless Import:** Copy/paste directly from your old Google Sheet to instantly populate the database.
    

## 🛠️ Tech Stack

-   **Frontend:** React 19, Tailwind CSS, Vite, Lucide Icons
    
-   **Backend:** Node.js, Express
    
-   **Database:** SQLite (Stored locally in a persistent Docker volume)
    
-   **Deployment:** Docker, GitHub Actions (CI/CD to GHCR)
    

## 🚀 Deployment (Docker Compose)

This app is built to be deployed via Docker. The SQLite database is stored in `/app/data` inside the container, so mapping a volume is critical to avoid losing data when the container updates.

1.  **Make your GHCR Package Public:** If you used GitHub Actions to build the container, ensure your package visibility is set to "Public" in your GitHub repo's Package settings so your server can pull it.
    
2.  **Create your `docker-compose.yml`:**
    

```
version: '3.8'

services:
  fcp-tracker:
    image: ghcr.io/YOUR_GITHUB_USERNAME/fcp-warranty-tracker:latest
    container_name: fcp-tracker
    restart: unless-stopped
    volumes:
      # CRITICAL: Maps the SQLite DB to your local host to ensure persistence
      - ./app-data:/app/data
    networks:
      - proxy 
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.fcptracker.rule=Host(`fcp.local`)"
      - "traefik.http.routers.fcptracker.entrypoints=websecure"
      - "traefik.http.routers.fcptracker.tls=true"
      - "traefik.http.services.fcptracker.loadbalancer.server.port=3000"

networks:
  proxy:
    external: true

```

3.  Run `docker-compose up -d` (or deploy the stack in Portainer).
    

## 💻 Local Development

Want to add a new feature or tweak the UI?

1.  Clone the repository.
    
2.  Open a terminal in the `backend` folder:
    

```
npm install
npm start
```

_(This runs the Node server on port 3000)_

3.  Open a second terminal in the `frontend` folder:
    

```
npm install
npm run dev
```

_(This runs the Vite React app on port 5173 and proxies API requests to the backend)_

## 📋 Google Sheets Import Format

To use the built-in bulk importer, your Google Sheet must be arranged in this **exact** column order (Columns A through K). Just highlight the cells, copy, and paste into the app's import window.

| **A** | **B** | **C** | **D**| **E** | **F** | **G** | **H** | **I** | **J** | **K** | 
|--|--|--|--|--|--|--|--|--|--|--|
| Date | SKU | Description | Vehicle | Order # | Has Been RMA'd? (YES/NO) | Replaced By (Order #) | Replaces (Order #) | _Blank/Notes_ | RMA # | Price |

_(Note: All imported items default to a Quantity of 1. You can easily edit quantities in the app later)._
