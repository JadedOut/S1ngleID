// Simple in-memory challenge storage
const challenges = new Map<string, string>();

export async function storeChallenge(id: string, challenge: string): Promise<void> {
  challenges.set(id, challenge);
  
  // Auto-delete after 5 minutes
  setTimeout(() => {
    challenges.delete(id);
  }, 5 * 60 * 1000);
}

export async function getChallenge(id: string): Promise<string | undefined> {
  return challenges.get(id);
}

export async function deleteChallenge(id: string): Promise<void> {
  challenges.delete(id);
}