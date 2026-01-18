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
- A webcam (for selfie verification)
- Modern browser (Chrome, Firefox, Edge, Safari)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Download face recognition models
.\scripts\download-models.ps1

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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

Copy `.env.example` to `.env.local` and configure:

```bash
# Database (Railway PostgreSQL)
DATABASE_URL="postgresql://..."

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