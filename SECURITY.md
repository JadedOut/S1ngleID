# Security & Architecture Overview

**Current Status:** Hybrid client-server architecture with server-side verification.

## Architecture

The application uses a **hybrid architecture**:

- **Client-side**: Face detection/matching (via face-api.js), camera capture, UI flow
- **Server-side**: OCR processing (Tesseract.js + Puppeteer/OpenCV), DOB extraction and age validation, WebAuthn credential generation and verification

### Server-Side Verification Flow

1. Client captures ID photo and selfie
2. Client sends ID image to `/api/ocr/recognize` for server-side OCR
3. Client performs face matching locally (for UX speed)
4. Client sends OCR text + extracted DOB to `/api/verify/start`
5. **Server re-extracts DOB from OCR text** to validate client claims
6. Server verifies age >= 19, creates user, generates WebAuthn challenge
7. Client registers passkey, sends attestation to `/api/verify/complete`
8. Server verifies attestation and stores credential

## Remaining Vulnerabilities

### Client-Side Face Matching

Face matching runs in the browser for UX reasons. A motivated attacker could:

| Attack | Method |
|--------|--------|
| Virtual camera spoofing | Use OBS Virtual Camera to feed pre-recorded video |
| Console injection | Override `matchFaces` to always return `{ isMatch: true }` |
| React state manipulation | Use React DevTools to skip the face matching step |

**Mitigation path**: Move face matching to server using a headless browser or native face-api.js on Node.js.

### OCR Text Manipulation

While the server re-extracts DOB from OCR text, the client provides the raw OCR text. An attacker could:

| Attack | Method |
|--------|--------|
| Inject fake OCR text | Send fabricated text with a fake DOB to `/api/verify/start` |

**Current mitigation**: Server-side DOB extraction uses the same regex patterns; if extraction fails on both ends, verification is rejected.

**Stronger mitigation**: Run OCR entirely server-side by sending only the raw image (the "slow path" already supports this).

## What IS Verified Server-Side

| Component | Server-Side? | Notes |
|-----------|--------------|-------|
| OCR text extraction | YES | Tesseract.js runs on Node.js |
| Image preprocessing | YES | Puppeteer + OpenCV.js or Sharp fallback |
| DOB extraction | YES | Server re-extracts from OCR text |
| Age calculation | YES | Server calculates and enforces 19+ |
| WebAuthn challenge | YES | Generated and stored server-side |
| WebAuthn verification | YES | Attestation verified with @simplewebauthn/server |
| Credential storage | YES | Stored in PostgreSQL via Prisma |

## Production Checklist

- [ ] Use HTTPS in production (required for WebAuthn)
- [ ] Set strong `DATABASE_URL` credentials (not the default `password`)
- [ ] Configure `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` for your domain
- [ ] Consider rate limiting on verification endpoints
- [ ] Enable server-side face matching for high-security deployments
- [ ] Review Puppeteer sandbox settings if running in containers

## Conclusion

S1ngleID now performs **server-side age verification**. The server controls the final decision ("Is this user 19?") based on OCR text it processes and validates. Face matching remains client-side for UX, which is acceptable for age verification but not for high-security identity verification.
