import { describe, it, expect, vi } from 'vitest';
import { isCompatible, findMatch, MatchCandidate } from './matcher';

describe('Matching Engine Pure Logic', () => {
  describe('Compatibility Matrix', () => {
    it('ANY filter accepts any year', () => {
      const a: MatchCandidate = { userId: 'a', joiningYear: 2024, filter: 'ANY', timestamp: 1 };
      const b: MatchCandidate = { userId: 'b', joiningYear: 2023, filter: 'ANY', timestamp: 2 };
      expect(isCompatible(a, b)).toBe(true);
    });

    it('SAME_YEAR matches only same year', () => {
      const a: MatchCandidate = { userId: 'a', joiningYear: 2024, filter: 'SAME_YEAR', timestamp: 1 };
      const b: MatchCandidate = { userId: 'b', joiningYear: 2024, filter: 'ANY', timestamp: 2 };
      const c: MatchCandidate = { userId: 'c', joiningYear: 2023, filter: 'ANY', timestamp: 3 };
      expect(isCompatible(a, b)).toBe(true);
      expect(isCompatible(a, c)).toBe(false);
    });

    it('SPECIFIC_YEARS matches only included years', () => {
      const a: MatchCandidate = { userId: 'a', joiningYear: 2024, filter: [2022, 2023], timestamp: 1 };
      const b: MatchCandidate = { userId: 'b', joiningYear: 2023, filter: 'ANY', timestamp: 2 };
      const c: MatchCandidate = { userId: 'c', joiningYear: 2024, filter: 'ANY', timestamp: 3 }; // not in A's array
      expect(isCompatible(a, b)).toBe(true);
      expect(isCompatible(a, c)).toBe(false);
    });

    it('Compatibility is two-way', () => {
      const a: MatchCandidate = { userId: 'a', joiningYear: 2024, filter: [2023], timestamp: 1 };
      const b: MatchCandidate = { userId: 'b', joiningYear: 2023, filter: [2022], timestamp: 2 }; // B wants 2022, not 2024
      expect(isCompatible(a, b)).toBe(false);
    });
  });

  describe('Finding Matches', () => {
    it('Finds the first compatible match honoring FIFO', async () => {
      const candidates: MatchCandidate[] = [
        { userId: '1', joiningYear: 2024, filter: 'ANY', timestamp: 100 },
        { userId: '2', joiningYear: 2023, filter: 'SAME_YEAR', timestamp: 101 }, // Needs 2023
        { userId: '3', joiningYear: 2024, filter: 'ANY', timestamp: 102 },
      ];
      const match = await findMatch(candidates, async () => false);
      expect(match).not.toBeNull();
      expect(match![0].userId).toBe('1');
      expect(match![1].userId).toBe('3');
    });

    it('Excludes blocked pairs', async () => {
      const candidates: MatchCandidate[] = [
        { userId: '1', joiningYear: 2024, filter: 'ANY', timestamp: 100 },
        { userId: '2', joiningYear: 2024, filter: 'ANY', timestamp: 101 },
        { userId: '3', joiningYear: 2024, filter: 'ANY', timestamp: 102 },
      ];
      // Exclude 1 and 2
      const hasExclusions = async (a: string, b: string) => (a === '1' && b === '2') || (a === '2' && b === '1');
      const match = await findMatch(candidates, hasExclusions);
      expect(match).not.toBeNull();
      expect(match![0].userId).toBe('1');
      expect(match![1].userId).toBe('3');
    });

    it('No match if exclusions prevent it', async () => {
      const candidates: MatchCandidate[] = [
        { userId: '1', joiningYear: 2024, filter: 'ANY', timestamp: 100 },
        { userId: '2', joiningYear: 2024, filter: 'ANY', timestamp: 101 },
      ];
      const match = await findMatch(candidates, async () => true);
      expect(match).toBeNull();
    });

    it('Concurrency check (100 users) produces unique pairs', async () => {
      const candidates: MatchCandidate[] = Array.from({ length: 100 }).map((_, i) => ({
        userId: i.toString(),
        joiningYear: 2024,
        filter: 'ANY',
        timestamp: i
      }));
      
      const inSession = new Set<string>();
      let matches = 0;
      
      while(candidates.length >= 2) {
        const match = await findMatch(candidates, async () => false);
        if (!match) break;
        
        expect(inSession.has(match[0].userId)).toBe(false);
        expect(inSession.has(match[1].userId)).toBe(false);
        
        inSession.add(match[0].userId);
        inSession.add(match[1].userId);
        
        // Remove from candidates array
        const idx1 = candidates.findIndex(c => c.userId === match[0].userId);
        candidates.splice(idx1, 1);
        const idx2 = candidates.findIndex(c => c.userId === match[1].userId);
        candidates.splice(idx2, 1);
        
        matches++;
      }
      
      expect(matches).toBe(50);
      expect(inSession.size).toBe(100);
      expect(candidates.length).toBe(0);
    });
  });
});
