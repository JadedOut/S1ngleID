# SDUARF - Age Verification App

A privacy-first age verification web application that processes ID documents, performs face matching, and issues WebAuthn credentials for future authentication. All personal data is immediately deleted after processing.

## Features

- **ID Document OCR**: Extracts date of birth, expiry date, and license number
- **Live Face Matching**: Compares your selfie with your ID photo using AI
- **WebAuthn Credentials**: Creates passkeys (FaceID/TouchID) for future verification
- **Privacy-First**: Your ID data is immediately deleted after processing
- **Split Deployment**: Frontend on Vercel, backend with Puppeteer OCR on Railway/Render

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker Desktop (for PostgreSQL database)
- A webcam (for selfie verification)
- Modern browser (Chrome, Firefox, Edge, Safari)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd sduarf
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up PostgreSQL with Docker

Start the PostgreSQL container using Docker Compose:

```bash
docker compose up -d
```

**Note:** Use `docker compose` (without hyphen) for Docker Compose V2, or `docker-compose` (with hyphen) if you have the standalone version installed. Both work the same way.

This will:
- Pull the PostgreSQL 15 Alpine image
- Create a container named `sduarf-postgres`
- Set up a database named `age_verify`
- Expose PostgreSQL on port `5433` (to avoid conflicts with local PostgreSQL)
- Create a persistent volume for data

Verify the container is running:

```bash
docker ps
```

You should see `sduarf-postgres` in the list.

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# .env
DATABASE_URL="postgresql://postgres:password@localhost:5433/age_verify"

# WebAuthn config (for localhost testing)
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_ORIGIN="http://localhost:3000"
WEBAUTHN_RP_NAME="AgeVerify"

# If using split deployment (optional for local)
# NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"
```

**Note:** The credentials are included in this repository for local development. Change them for production deployments.

### 5. Set Up the Database Schema

Generate Prisma client and push the schema to the database:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

This creates the following tables:
- `User` - Stores user records
- `WebAuthnChallenge` - Stores WebAuthn challenge tokens
- `WebAuthnCredential` - Stores registered passkey credentials

(Optional) Open Prisma Studio to view the database:

```bash
npx prisma studio
```

### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
