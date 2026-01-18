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

### 7. Verify Database Connection (Optional)

Test the database connection:

```bash
node scripts/test-port-5433.js
```

You should see:
```
✅ Connection successful!
PostgreSQL version: PostgreSQL 15.x
Database: age_verify
```

## Troubleshooting

### Database Connection Issues

**Container not running:**
```bash
# Check if container is running
docker ps

# Start container if stopped
docker compose up -d

# View logs
docker compose logs postgres
```

**Port already in use:**
If port 5433 is already in use, edit `docker-compose.yml` and change the port mapping:
```yaml
ports:
  - "5434:5432"  # Change 5433 to another port
```
Then update `DATABASE_URL` in `.env` accordingly.

**Database doesn't exist:**
The `docker-compose.yml` creates the database automatically. If it doesn't exist:
```bash
# Connect to PostgreSQL
docker exec -it sduarf-postgres psql -U postgres

# Create database manually
CREATE DATABASE age_verify;
\q
```

**Reset database:**
```bash
# Stop and remove container (keeps data volume)
docker compose down

# Remove data volume (deletes all data)
docker compose down -v

# Start fresh
docker compose up -d
npx prisma db push
```

### Stop Docker Container

When you're done developing:

```bash
# Stop container (keeps data)
docker compose stop

# Stop and remove container (keeps data volume)
docker compose down

# Stop and remove everything including data
docker compose down -v
```

## Camera Troubleshooting

The selfie capture requires camera access. If you see a camera error:

### "Camera requires HTTPS"
- Cameras only work on HTTPS or localhost
- Use `http://localhost:3000` (not your IP address)

### "Camera permission denied"
1. Look for a camera icon in your browser's address bar
2. Click it and select "Allow"
3. Refresh the page

### "Camera is in use"
- Close other apps using the camera (Zoom, Teams, etc.)
- Close other browser tabs that might be using the camera
- Try restarting your browser

### "No camera found"
- Make sure your webcam is connected
- Try a different USB port
- Check if the camera works in other apps

## Project Structure

```
prisma/
└── schema.prisma         # Database schema (User, Challenge, Credential)
src/
├── app/
│   ├── api/
│   │   ├── ocr/recognize/route.ts    # OCR endpoint
│   │   └── verify/
│   │       ├── start/route.ts        # WebAuthn registration start
│   │       └── complete/route.ts     # WebAuthn registration complete
│   ├── page.tsx          # Landing page
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # Global styles
│   └── verify/
│       └── page.tsx      # Verification flow
├── components/
│   ├── Camera.tsx        # Webcam capture component
│   ├── IDUpload.tsx      # ID document upload
│   └── ProgressIndicator.tsx # Step progress UI
├── lib/
│   ├── server/
│   │   ├── prisma.ts     # Prisma client singleton
│   │   ├── cors.ts       # CORS utilities
│   │   ├── dobExtractor.ts  # DOB extraction from OCR
│   │   └── opencvPreprocessPuppeteer.ts  # Server-side OpenCV preprocessing
│   ├── ocr.ts            # Tesseract.js OCR service
│   ├── faceMatching.ts   # face-api.js matching service
│   └── validation.ts     # Age validation logic
public/
└── models/               # face-api.js AI models
```

## How It Works

1. **Upload ID**: Take a photo of your driver's license
2. **OCR Processing**: Tesseract.js extracts license information and date of birth
3. **License Validation**: Confirms license is valid and not expired
4. **Age Validation**: Confirms you're 19+
5. **Take Selfie**: Live camera capture (cannot be faked with photo)
6. **Face Match**: AI compares your selfie with ID photo (requires >= 75% confidence)
7. **Server Verification**: Backend re-validates age from OCR
8. **WebAuthn Registration**: Create a passkey (FaceID/TouchID) for future logins
9. **Complete**: ID photos are deleted from memory; credential ID is stored in database

## Data Flow & Field Storage

All data is stored **in-memory only** (React state) and never persisted to disk or server. **NOTE:** This app is only a proof of concept. 

### OCR Extraction (`src/lib/ocr.ts` → `IDData`)
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Extracted name (not validated) |
| `idNumber` | string | Driver's license number |
| `birthDate` | string | Full DOB in YYYY-MM-DD format |
| `expiryDate` | string | ID expiry date |
| `confidence` | number | OCR confidence (0-100) |
| `rawText` | string | Raw OCR text for debugging |

### Validation (`src/lib/validation.ts` → `ValidationResult`)
| Field | Type | Description |
|-------|------|-------------|
| `isValid` | boolean | Overall validation pass |
| `isOver19` | boolean | Age >= 19 years |
| `isExpired` | boolean | ID is past expiry date |
| `age` | number | Calculated age in years |
| `birthDate` | string | DOB used for age calc |
| `expiryDate` | string | Expiry date |

### Face Matching (`src/lib/faceMatching.ts` → `FaceMatchResult`)
| Field | Type | Description |
|-------|------|-------------|
| `isMatch` | boolean | Faces match (confidence >= 75%) |
| `confidence` | number | Match confidence score (0-1) |
| `idFaceDescriptor` | Float32Array | 128-dim face embedding from ID |
| `selfieFaceDescriptor` | Float32Array | 128-dim face embedding from selfie |

### UI State (`src/app/verify/page.tsx`)
| State Variable | Stored Where | Cleared When |
|----------------|--------------|--------------|
| `idImage` | React state | Start over / page close |
| `selfieImage` | React state | Retry selfie / start over |
| `idData` | React state | Start over / page close |
| `validationResult` | React state | Start over / page close |
| `faceMatchResult` | React state | Retry selfie / start over |

## Technology Stack

- **Next.js 14** - React framework
- **Tesseract.js** - Client-side OCR
- **face-api.js** - Face detection and matching
- **Tailwind CSS** - Styling
- **Prisma** - Database ORM (PostgreSQL)
- **SimpleWebAuthn** - WebAuthn/Passkey implementation
- **Puppeteer** - Server-side OpenCV preprocessing

## Deployment (Split Architecture)

This app uses a split deployment for optimal performance:
- **Frontend (Vercel)**: Static Next.js app with client-side processing
- **Backend (Railway/Render)**: API routes with Puppeteer for OCR preprocessing

### Environment Variables

For production deployment, set these environment variables:

```bash
# Database (Production PostgreSQL)
DATABASE_URL="postgresql://user:password@host:port/database"

# WebAuthn Configuration
WEBAUTHN_RP_ID="your-app.vercel.app"       # Your frontend domain
WEBAUTHN_ORIGIN="https://your-app.vercel.app"
WEBAUTHN_RP_NAME="Age Verification"

# Frontend env (for split deployment)
NEXT_PUBLIC_BACKEND_URL="https://your-backend.railway.app"
```

### Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Open Prisma Studio
npx prisma studio
```

### Vercel Deployment

1. Connect your GitHub repo to Vercel
2. Set `NEXT_PUBLIC_BACKEND_URL` to your Railway/Render URL
3. Deploy

### Railway/Render Deployment

1. Connect your GitHub repo
2. Set all environment variables (DATABASE_URL, WEBAUTHN_*)
3. Deploy

Note: Puppeteer requires a Node.js environment with Chrome. Railway and Render support this out of the box.

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome 80+ | ✅ Full support |
| Firefox 80+ | ✅ Full support |
| Edge 80+ | ✅ Full support |
| Safari 14+ | ✅ Full support |
| Mobile Chrome | ✅ Works on HTTPS |
| Mobile Safari | ✅ Works on HTTPS |

## Privacy

- Face matching happens entirely in your browser
- ID photos are sent to the server only for OCR verification, then deleted from memory
- No ID images are stored on the server
- WebAuthn credentials use your device's secure enclave (biometrics never leave your device)
- Only your credential ID is stored in the database for future authentication

## License

MIT