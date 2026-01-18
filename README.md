# SDUARF - Age Verification App

A privacy-first age verification web application that processes ID documents and performs face matching entirely on the client-side.

## Conceptual Features

- **Privacy-First**: All processing (OCR, face matching) happens in your browser
- **ID Document OCR**: Extracts date of birth, expiry date, and license number
- **Live Face Matching**: Compares your selfie with your ID photo using AI
- **No Server Storage**: Your ID data never leaves your device

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
- Don't use `http://192.168.x.x:3000` - this won't work

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
src/
├── app/
│   ├── page.tsx         # Landing page
│   └── verify/
│       └── page.tsx     # Verification flow
├── components/
│   ├── Camera.tsx       # Webcam capture component
│   ├── IDUpload.tsx     # ID document upload
│   └── ProgressIndicator.tsx
├── lib/
│   ├── ocr.ts           # Tesseract.js OCR service
│   ├── faceMatching.ts  # face-api.js matching service
│   └── validation.ts    # Age validation logic
public/
└── models/              # face-api.js AI models
```

## How It Works

1. **Upload ID**: Take a photo of your driver's license
2. **OCR Processing**: Tesseract.js extracts your date of birth
3. **Age Validation**: Confirms you're 19+ and ID isn't expired
4. **Take Selfie**: Live camera capture (cannot be faked with photo)
5. **Face Match**: AI compares your selfie with ID photo
6. **Verified**: Success if face match confidence >= 75%

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
| `confidence` | number | Weighted score (0-1) |
| `faceApiScore` | number | face-api.js score (40% weight) |
| `tensorFlowScore` | number | TensorFlow.js score (35% weight) - placeholder |
| `trackingScore` | number | tracking.js score (25% weight) - placeholder |
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
- **TensorFlow.js** - AI model runtime
- **Tailwind CSS** - Styling

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

- All processing happens in your browser
- No images are sent to any server
- ID data is stored only in memory during the session
- Data is automatically cleared when you close the page

## License

MIT