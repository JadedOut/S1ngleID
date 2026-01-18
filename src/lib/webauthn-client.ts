import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// ==========================================
// 1. THE STORE: Local Storage Management
// ==========================================

const KEY_STORAGE_NAME = 'age_verify_passkey_id';

function saveKeyId(id: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY_STORAGE_NAME, id);
    console.log(`[STORE] Saved key ID: ${id}`);
  }
}

function getKeyId(): string | null {
  if (typeof window !== 'undefined') {
    const id = localStorage.getItem(KEY_STORAGE_NAME);
    console.log(`[FETCH] Retrieved key ID: ${id}`);
    return id;
  }
  return null;
}

export function hasAgePasskey(): boolean {
  return !!getKeyId();
}

export function resetAgePasskey() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEY_STORAGE_NAME);
    console.log('[RESET] Key ID cleared from storage');
  }
}

// ==========================================
// 2. REGISTRATION (Create & Store)
// ==========================================

export async function createAgePasskey() {
  try {
    console.log('--- START REGISTRATION ---');

    // 1. Get options from server
    const resp = await fetch('/api/passkey/create', { method: 'POST' });
    const options = await resp.json();

    // 2. Create credentials (Windows Hello Prompt)
    // FORCE it to be platform (Windows Hello) via optionsJSON
    const registrationResponse = await startRegistration({ optionsJSON: options });

    // 3. Send to server to verify & save
    const completeResp = await fetch('/api/passkey/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationResponse }),
    });

    if (!completeResp.ok) throw new Error('Registration failed on server');

    const result = await completeResp.json();

    // 4. CRITICAL: STORE THE ID
    // We explicitly save the ID so we can ask for it specifically later
    saveKeyId(result.passkey_id);

    console.log('--- REGISTRATION SUCCESS ---');
    return { success: true };

  } catch (e: any) {
    console.error('Registration failed:', e);
    return { success: false, error: e.message };
  }
}

// ==========================================
// 3. VERIFICATION (Fetch & Login)
// ==========================================

export async function verifyAgeWithPasskey() {
  try {
    console.log('--- START VERIFICATION ---');

    // 1. FETCH THE ID
    const passkeyId = getKeyId();
    if (!passkeyId) throw new Error('No passkey ID found in Local Storage');

    // 2. Ask server for challenge for THIS SPECIFIC KEY
    const resp = await fetch('/api/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey_id: passkeyId }), // explicitly sending ID
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Server rejected verify init');
    }

    const options = await resp.json();

    // 3. Windows Hello Prompt
    // It will ONLY ask for the specific key we sent (details in server route)
    const authResponse = await startAuthentication({ optionsJSON: options });

    // 4. Final Confirmation
    const confirmResp = await fetch('/api/passkey/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passkey_id: passkeyId, // Send ID again for lookup
        authResponse
      }),
    });

    if (!confirmResp.ok) throw new Error('Verification failed on server');

    const result = await confirmResp.json();

    console.log('--- VERIFICATION SUCCESS ---');
    return result;

  } catch (e: any) {
    console.error('Check failed:', e);
    return { verified: false, error: e.message };
  }
}