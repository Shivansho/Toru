export type MatchFilter = 'ANY' | 'SAME_YEAR' | number[];

export interface MatchCandidate {
  userId: string;
  joiningYear: number;
  filter: MatchFilter;
  timestamp: number;
}

export function isCompatible(a: MatchCandidate, b: MatchCandidate): boolean {
  return checkFilter(a.filter, a.joiningYear, b.joiningYear) && 
         checkFilter(b.filter, b.joiningYear, a.joiningYear);
}

function checkFilter(filter: MatchFilter, myYear: number, otherYear: number): boolean {
  if (filter === 'ANY') return true;
  if (filter === 'SAME_YEAR') return myYear === otherYear;
  if (Array.isArray(filter)) return filter.includes(otherYear);
  return false;
}

export async function findMatch(
  candidates: MatchCandidate[],
  hasExclusions: (userIdA: string, userIdB: string) => Promise<boolean>
): Promise<[MatchCandidate, MatchCandidate] | null> {
  // Sort candidates by timestamp ascending (FIFO)
  const sorted = [...candidates].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      
      if (isCompatible(a, b)) {
        const excluded = await hasExclusions(a.userId, b.userId);
        if (!excluded) {
          return [a, b];
        }
      }
    }
  }
  return null;
}
