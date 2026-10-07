import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';

export type ModerationDecision = 'allow' | 'hide-for-review' | 'reject';

export interface ModerationResult {
  decision: ModerationDecision;
  reasons: string[];
  flags: string[];
}

export interface ToxicityResult {
  score: number;
  category: string;
}

export interface ToxicityClassifier {
  analyze(text: string): Promise<ToxicityResult[]>;
}

export class StubClassifier implements ToxicityClassifier {
  async analyze(text: string): Promise<ToxicityResult[]> {
    if (text.includes('stub_toxic')) return [{ category: 'toxicity', score: 0.9 }];
    if (text.includes('stub_selfharm')) return [{ category: 'self-harm', score: 0.9 }];
    return [];
  }
}

export class HttpClassifier implements ToxicityClassifier {
  constructor(private endpoint: string, private apiKey: string) {}
  async analyze(text: string): Promise<ToxicityResult[]> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      return [];
    }
  }
}

// Caching Wordlists
let wordlistCache: Record<string, { blocked: RegExp[], review: RegExp[] }> = {};
export let lastRefresh = 0;

export async function refreshWordlists(prisma: PrismaClient) {
  const lists = await prisma.wordlist.findMany();
  wordlistCache = {};
  for (const item of lists) {
    if (!wordlistCache[item.collegeId]) {
      wordlistCache[item.collegeId] = { blocked: [], review: [] };
    }
    // Use word boundaries. To handle Hinglish and variants, the admin should define the terms carefully.
    const term = item.term.toLowerCase();
    // Escape regex, then allow optional repeated chars: 'bad' -> /b+a+d+/
    const regexStr = term.split('').map(c => `${c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}+`).join('[\\W_]*');
    const reg = new RegExp(`\\b${regexStr}\\b`, 'i');

    if (item.kind === 'BLOCK') wordlistCache[item.collegeId].blocked.push(reg);
    else if (item.kind === 'REVIEW') wordlistCache[item.collegeId].review.push(reg);
  }
  lastRefresh = Date.now();
}

// Normalisation
export function normalizeText(text: string): string {
  let s = text.toLowerCase();
  
  // Strip zero-width chars and invisible formatting
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Map look-alikes
  const map: Record<string, string> = {
    '@': 'a', '4': 'a', '8': 'b', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't'
  };
  s = s.replace(/[a-z0-9@!$]/g, m => map[m] || m);

  // Instead of completely stripping spaces, we collapse spaces to a single space
  // but also handle "s p a c e d" letters if they are single letters
  // E.g. "b a d w o r d" -> "badword"
  s = s.replace(/(?:^|\s)([a-z])(?=\s|$)/g, '$1').replace(/\s+/g, ' ');

  return s;
}

const PHONE_REGEX = /(\+91[\-\s]?)?[6789]\d{9}|(\d[\s\-]?){10,12}/;
const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_REGEX = /https?:\/\/[^\s]+|[a-z0-9.-]+\.(com|net|org|in|edu)/i;
// Avoid blocking '@a' to prevent regular names matching
const SOCIAL_REGEX = /@[a-z0-9_]{3,20}/i; 

export async function moderateMessage(
  text: string, 
  collegeId: string, 
  classifier: ToxicityClassifier,
  collegeThresholds: { block: number, review: number } = { block: 0.8, review: 0.6 }
): Promise<ModerationResult> {
  const result: ModerationResult = { decision: 'allow', reasons: [], flags: [] };
  
  // 1. Patterns (check against raw text to avoid breaking URLs with normalisation)
  if (PHONE_REGEX.test(text) || EMAIL_REGEX.test(text) || URL_REGEX.test(text) || SOCIAL_REGEX.test(text)) {
    result.decision = 'reject';
    result.reasons.push('Personal contact information or links are not allowed.');
    await redisClient.incr('metrics:moderation:reject_pattern');
    return result; 
  }

  // 2. Normalisation & Wordlist
  const norm = normalizeText(text);
  const cache = wordlistCache[collegeId] || { blocked: [], review: [] };

  let matchedBlock = false;
  let matchedReview = false;

  for (const reg of cache.blocked) {
    if (reg.test(norm)) {
      matchedBlock = true;
      result.reasons.push('Contains prohibited term');
      break;
    }
  }

  if (!matchedBlock) {
    for (const reg of cache.review) {
      if (reg.test(norm)) {
        matchedReview = true;
        result.reasons.push('Contains flagged term');
        break;
      }
    }
  }

  if (matchedBlock) {
    result.decision = 'reject';
    await redisClient.incr('metrics:moderation:reject_wordlist');
    return result;
  }

  // 3. Classifier
  const toxicity = await classifier.analyze(text);
  let highestToxic = 0;
  
  for (const t of toxicity) {
    if (t.category === 'self-harm' && t.score >= 0.5) {
      result.flags.push('support_card_tele_manas_14416');
      result.flags.push('needs_moderator_review');
    }
    if (t.category === 'toxicity') {
      if (t.score > highestToxic) highestToxic = t.score;
    }
  }

  if (highestToxic >= collegeThresholds.block) {
    result.decision = 'reject';
    result.reasons.push('Message violates community guidelines.');
    await redisClient.incr('metrics:moderation:reject_toxicity');
  } else if (highestToxic >= collegeThresholds.review || matchedReview) {
    result.decision = 'hide-for-review';
    await redisClient.incr('metrics:moderation:review');
  } else {
    await redisClient.incr('metrics:moderation:allow');
  }

  return result;
}
