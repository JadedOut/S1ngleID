# SDUARF - Age Verification App

A privacy-first age verification web application that processes ID documents and performs face matching entirely on the client-side.

## Features

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

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Privacy

- All processing happens in your browser
- No images are sent to any server
- ID data is stored only in memory during the session
- Data is automatically cleared when you close the page

## License

MIT