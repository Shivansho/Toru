# How to Run Toru Locally

Toru is a monorepo containing a Next.js App Router frontend and a Node.js/Express backend. To run the full stack locally on your machine, follow these instructions.

## Prerequisites

Before starting, ensure you have the following installed on your machine:
- **Node.js** (v18 or higher)
- **pnpm** (install via `npm install -g pnpm`)
- **Docker Desktop** (required for running the database and cache)

## Step 1: Start the Docker Infrastructure

The backend relies on three external services:
1. **PostgreSQL** (The main relational database)
2. **Redis** (Used for rate-limiting and matchmaking queues)
3. **Mailpit** (A local email server to catch verification emails)

Open your terminal in the root directory of the project and run:

```powershell
docker compose up -d
```
*(The `-d` flag runs them in the background so your terminal remains free).*

## Step 2: Initialize the Database

With the database running, you need to apply the schemas (tables) defined in the Prisma ORM.

```powershell
pnpm exec prisma db push
```

If you want to visually inspect the data in your database, you can open Prisma Studio:
```powershell
pnpm exec prisma studio
```
*(This will open a UI in your browser at `http://localhost:5555`)*

## Step 3: Start the Backend (API Server)

The backend Express server handles authentication and real-time chat websockets. 

Open a **new terminal tab/window** and run:

```powershell
pnpm -F api run dev
```

*(You will see logs indicating the server is running on `http://localhost:4000`)*

## Step 4: Start the Frontend (Web App)

The frontend is a Next.js application. 

Open a **third terminal tab/window** and run:

```powershell
pnpm -F web run dev
```

*(This compiles the UI and starts a server on `http://localhost:3000`)*

## Step 5: Test the Application

1. Open your web browser and navigate to [http://localhost:3000](http://localhost:3000).
2. Enter an email address (e.g., `student_cs.24@college.example` if configured, or any testing email format your app expects).
3. To find the OTP code sent by the app, navigate to your local Mailpit dashboard at [http://localhost:8025](http://localhost:8025).
4. Enter the code to log in!

### Testing the "Mobile" Version
Because Toru is a Progressive Web App (PWA):
1. In Google Chrome, press `F12` to open Developer Tools.
2. Click the "Toggle Device Toolbar" icon (or press `Ctrl+Shift+M`).
3. Select a phone model (like iPhone 14 Pro) from the dropdown at the top to simulate the mobile experience.
