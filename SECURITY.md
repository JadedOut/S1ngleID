# Security & Architecture Overview

**Current Status:** Is anything truly done on the backend?
**Answer:** **NO.**

Currently, the application runs 100% on the client-side (in the user's browser). There is **zero** server-side verification. The Next.js server acts only as a file server, delivering the HTML/JS/CSS to the browser.

## The "Trusting the Client" Vulnerability
Because all logic executes in the user's browser, the user (the "client") has complete control over the execution environment. A motivated user with technical knowledge can modify **any** data field or logic flow listed below.

### User-Modifiable Data Fields
The following fields exist in the browser's memory (RAM) and can be modified using Browser DevTools, Console injection, or Network interception.

#### 1. Input Data
| Field | Modifiable? | Method |
|-------|-------------|--------|
| `idImage` | YES | Can inject base64 string, bypass camera, upload edited photo |
| `selfieImage` | YES | Can inject pre-recorded video frame, bypass liveness check |
| `Camera Video Stream` | YES | Can use "Virtual Webcam" software (OBS) to feed fake video |

#### 2. OCR Extraction Logic (`ocr.ts`)
| Field | Internal Name | Vulnerability |
|-------|---------------|---------------|
| **Birth Date** | `birthDate` | User can set breakpoint in `extractIDData` and overwrite return value |
| **Expiry Date** | `expiryDate` | Can be manually set to future date |
| **Raw Text** | `text` | Tesseract output can be intercepted and rewritten |

#### 3. Verification Logic (`validation.ts`)
| Field | Internal Name | Vulnerability |
|-------|---------------|---------------|
| **Is Over 19?** | `isOver19` | User can set `const isOver19 = true` in console |
| **Is Valid?** | `isValid` | Can force function to always return `true` |
| **Results** | `ValidationResult` | The entire object can be mocked |

#### 4. Face Matching (`faceMatching.ts`)
| Field | Internal Name | Vulnerability |
|-------|---------------|---------------|
| **Match Score** | `confidence` | Can be manually set to `1.0` (100%) |
| **Threshold** | `MATCH_THRESHOLD` | Can be lowered to `0.0` to accept any face |
| **Result** | `isMatch` | Can modify `matchFaces` to always return `{ isMatch: true }` |

## Attack Vectors

### A. The "Console Hack"
A user opens Chrome DevTools and pastes a script to overwrite the validation function:
```javascript
// Example attack
validateIDData = () => ({ 
    isValid: true, 
    isOver19: true, 
    age: 25 
});
```
**Result:** The UI updates to show "Verified" instantly, regardless of the ID used.

### B. Virtual Camera Spoofing
Instead of a real selfie, the user selects "OBS Virtual Camera" as their media input. They play a video of someone else.
**Result:** The liveness check (if simple) and face match pass using someone else's face.

### C. Client-Side State Injection
React State (`useState`) determines what is shown on screen.
**Result:** A user can use React Developer Tools to toggle the `step` from "upload" directly to "success", bypassing all checks.

## Path to Security
To make this secure while maintaining privacy, we must move the *verification of trust* to a component the user cannot control.

### Implementation: Server-Side Verification
Send the data to the server, verify it there, then delete it immediately.
*   **Flow:** Client Uploads ID/Selfie -> Server OCRs & Matches -> Server returns Token -> Server deletes images.
*   **Pros:** Secure. User cannot spoof the server's execution.
*   **Cons:** Data leaves the device (even if transiently). Requires server resources.

## Conclusion
**Currently, S1ngleID is a "Client-Side Demo".** It prevents accidental errors but provides **zero security** against malicious users.

To prevent modification, the *decision* ("Is this user 19?") **MUST** happen on a trusted server, which means the raw evidence (Images) or a cryptographic proof of them must be sent to that server.
