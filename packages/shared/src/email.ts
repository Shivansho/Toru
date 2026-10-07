export interface CollegeConfig {
  domains: string[];
  studentPattern: string;
  staffPattern: string;
  programmeLengths: Record<string, number>;
}

export type EmailParseResult =
  | { type: 'student'; branch: string; programme: string; joiningYear: number }
  | { type: 'staff' }
  | { type: 'rejected'; reason: string };

export type YearOfStudyResult =
  | { status: 'active'; yearOfStudy: number }
  | { status: 'graduated' }
  | { status: 'invalid' };

export function parseCollegeEmail(email: string, config: CollegeConfig, now: Date): EmailParseResult {
  if (typeof email !== 'string') {
    return { type: 'rejected', reason: 'invalid_format' };
  }

  const normalized = email.trim().toLowerCase();

  // Basic sanity checks
  if (normalized.length > 254 || normalized.length === 0) {
    return { type: 'rejected', reason: 'suspicious_input' };
  }

  // Count @ signs
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return { type: 'rejected', reason: 'invalid_format' };
  }

  const [local, domain] = parts;

  // Plus addressing trick
  if (local.includes('+')) {
    return { type: 'rejected', reason: 'suspicious_input' };
  }

  // Unicode look-alikes / non-ascii check
  if (/[^\x00-\x7F]/.test(normalized)) {
    return { type: 'rejected', reason: 'suspicious_input' };
  }

  // Allow-list domain
  if (!config.domains.includes(domain)) {
    return { type: 'rejected', reason: 'domain_not_allowed' };
  }

  try {
    // Check staff first
    const staffRegex = new RegExp(config.staffPattern);
    if (staffRegex.test(normalized)) {
      return { type: 'staff' };
    }

    // Check student
    const studentRegex = new RegExp(config.studentPattern);
    const match = normalized.match(studentRegex);

    if (match && match.groups) {
      const branch = match.groups.branch;
      const programme = match.groups.programme || branch; // Fallback if programme is not captured
      const yy = parseInt(match.groups.yy, 10);

      if (!branch || isNaN(yy)) {
        return { type: 'rejected', reason: 'no_pattern_match' };
      }

      // Convert yy to full year. Assuming 2000s for yy.
      // If yy is > 99, it might be a full year already?
      const joiningYear = yy < 100 ? 2000 + yy : yy;

      // Basic year validation (e.g. not before 2000, not in distant future)
      const currentYear = now.getUTCFullYear();
      if (joiningYear < 2000 || joiningYear > currentYear + 1) {
        return { type: 'rejected', reason: 'invalid_year' };
      }

      return {
        type: 'student',
        branch,
        programme,
        joiningYear
      };
    }
  } catch (err) {
    // Regex compile error or similar
    return { type: 'rejected', reason: 'config_error' };
  }

  return { type: 'rejected', reason: 'no_pattern_match' };
}

export function computeYearOfStudy(joiningYear: number, branch: string, config: CollegeConfig, now: Date): YearOfStudyResult {
  const programmeLength = config.programmeLengths[branch];
  if (typeof programmeLength !== 'number') {
    return { status: 'invalid' };
  }

  // Academic year starts in July (month 6, 0-indexed)
  const academicStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const yearOfStudy = academicStartYear - joiningYear + 1;

  if (yearOfStudy < 1) {
    return { status: 'invalid' };
  }

  if (yearOfStudy > programmeLength) {
    return { status: 'graduated' };
  }

  return { status: 'active', yearOfStudy };
}

export function validateYearCorrection(correctedYear: number, branch: string, config: CollegeConfig, now: Date): YearOfStudyResult {
  // It works exactly the same, this function is an alias to ensure domain language matches
  // A lateral entry student might have joined later but their "effective joining year" is earlier.
  // Or they supply their actual year of study and we validate it against limits.
  // The requirement says: "a function that validates a corrected year within the programme length"
  // Assuming 'correctedYear' is the year of study they claim to be in (e.g., 2, 3)

  const programmeLength = config.programmeLengths[branch];
  if (typeof programmeLength !== 'number') {
    return { status: 'invalid' };
  }

  if (correctedYear < 1) {
    return { status: 'invalid' };
  }

  if (correctedYear > programmeLength) {
    return { status: 'graduated' };
  }

  return { status: 'active', yearOfStudy: correctedYear };
}
