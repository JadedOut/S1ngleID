import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// Create passkey immediately (skip OCR for demo)
export async function createAgePasskey() {
  try {
    console.log('Calling /api/passkey/create...');
    const response = await fetch('/api/passkey/create', {
      method: 'POST',
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('API Error:', errorData);
      throw new Error(errorData.reason || errorData.error || 'Failed to start passkey creation');
    }

    const challengeData = await response.json();
    console.log('Challenge data received');

    // This will trigger Windows Hello / Touch ID / Face ID
    console.log('Prompting for biometric authentication...');
    const registrationResponse = await startRegistration(challengeData);
    
    console.log('Registration response received');

    const completeResponse = await fetch('/api/passkey/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationResponse, // Send the whole response object
      }),
    });

    if (!completeResponse.ok) {
      const errorData = await completeResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Complete API Error:', errorData);
      throw new Error('Failed to complete passkey creation');
    }

    const { passkey_id } = await completeResponse.json();
    
    localStorage.setItem('age_passkey_id', passkey_id);

    return { success: true, passkey_id };
  } catch (error: any) {
    console.error('Passkey creation failed:', error);
    return { success: false, error: error.message };
  }
}

// Verify age using passkey
export async function verifyAgeWithPasskey() {
  try {
    const passkey_id = localStorage.getItem('age_passkey_id');
    
    if (!passkey_id) {
      throw new Error('No passkey found. Please create one first.');
    }

    const startResponse = await fetch('/api/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey_id }),
    });

    if (!startResponse.ok) {
      throw new Error('Failed to start verification');
    }

    const challengeData = await startResponse.json();

    // This will trigger Windows Hello / Touch ID / Face ID
    console.log('Prompting for biometric authentication...');
    const authResponse = await startAuthentication(challengeData);

    const verifyResponse = await fetch('/api/passkey/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passkey_id,
        authResponse,
      }),
    });

    if (!verifyResponse.ok) {
      throw new Error('Verification failed');
    }

    const result = await verifyResponse.json();
    
    return result;
  } catch (error: any) {
    console.error('Age verification failed:', error);
    return { verified: false, error: error.message };
  }
}

// Check if user has passkey
export function hasAgePasskey(): boolean {
  return !!localStorage.getItem('age_passkey_id');
}

// Reset passkey (for testing/demo purposes)
export function resetAgePasskey(): void {
  localStorage.removeItem('age_passkey_id');
  console.log('Passkey reset! Refresh the page to set up a new one.');
}