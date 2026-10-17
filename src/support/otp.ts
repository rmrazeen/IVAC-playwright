const digits: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

export function parseIvacOtp(text: string): string | null {
  if (!/^\s*\(IVACBD\)/i.test(text)) return null;
  const sequence = text.match(/type the following sequence when prompted\s+([\s\S]*?)\s*\.?\s*$/i)?.[1];
  if (!sequence) return null;
  if (/^\d{6}$/.test(sequence.trim())) return sequence.trim();
  const words = sequence.trim().toLowerCase().split(/\s*[-–—]\s*/);
  if (words.length !== 6 || words.some(word => !(word in digits))) return null;
  return words.map(word => digits[word]).join('');
}

export type Sms = { id: string; text: string; receivedAt: number };
export function latestNewOtp(messages: Sms[], baseline: Set<string>, requestedAt: number): { id: string; code: string } | null {
  const candidates = messages
    .filter(message => !baseline.has(message.id) && message.receivedAt >= requestedAt)
    .map(message => ({ ...message, code: parseIvacOtp(message.text) }))
    .filter(message => message.code !== null)
    .sort((a, b) => a.receivedAt - b.receivedAt);
  const newest = candidates.at(-1);
  return newest ? { id: newest.id, code: newest.code! } : null;
}
