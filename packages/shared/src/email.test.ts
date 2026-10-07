import { describe, it, expect } from 'vitest';
import { parseCollegeEmail, computeYearOfStudy, validateYearCorrection, CollegeConfig } from './email';

describe('email parsing and year-of-study module', () => {
  const dummyConfig: CollegeConfig = {
    domains: ['college.example', 'alt.example'],
    // Matches firstname.lastname_branch.hYY@... OR firstname.lastname_branch.YY@...
    // With optional honours 'h'. We capture programme if present, otherwise branch fallback.
    studentPattern: '^([a-z0-9\\.]+)_(?<branch>[a-z]+)\\.(?<programme>h)?(?<yy>\\d{2})@college\\.example$',
    staffPattern: '^([a-z0-9\\.]+)@college\\.example$',
    programmeLengths: {
      cs: 4,
      ee: 4,
      arch: 5,
      bba: 3
    }
  };

  const NOW_2026_MAY = new Date('2026-05-15T12:00:00Z');
  const NOW_2026_AUG = new Date('2026-08-15T12:00:00Z');
  const NOW_2026_JUN_30 = new Date('2026-06-30T23:59:59Z');
  const NOW_2026_JUL_01 = new Date('2026-07-01T00:00:00Z');

  describe('parseCollegeEmail', () => {
    const testCases = [
      // Valid students (honours)
      { email: 'john.doe_cs.h24@college.example', expected: { type: 'student', branch: 'cs', programme: 'h', joiningYear: 2024 } },
      { email: 'jane.smith_ee.h22@college.example', expected: { type: 'student', branch: 'ee', programme: 'h', joiningYear: 2022 } },
      
      // Valid students (non-honours, programme group will be undefined in regex, fallback to branch)
      { email: 'bob_arch.25@college.example', expected: { type: 'student', branch: 'arch', programme: 'arch', joiningYear: 2025 } },
      { email: 'alice_ee.26@college.example', expected: { type: 'student', branch: 'ee', programme: 'ee', joiningYear: 2026 } },
      
      // Valid staff
      { email: 'dr.smith@college.example', expected: { type: 'staff' } },
      { email: 'admin.desk@college.example', expected: { type: 'staff' } },
      { email: 'chancellor@college.example', expected: { type: 'staff' } },
      
      // Normalisation (uppercase / spaces)
      { email: ' JOHN.DOE_CS.H24@COLLEGE.EXAMPLE ', expected: { type: 'student', branch: 'cs', programme: 'h', joiningYear: 2024 } },
      { email: ' \t jane.smith_ee.h22@college.example \n', expected: { type: 'student', branch: 'ee', programme: 'h', joiningYear: 2022 } },
      
      // Domain not allowed
      { email: 'john.doe_cs.h24@wrong.example', expected: { type: 'rejected', reason: 'domain_not_allowed' } },
      { email: 'john.doe_cs.h24@alt.example', expected: { type: 'rejected', reason: 'no_pattern_match' } }, // domain allowed but regex explicitly matches @college.example in our dummy config string!
      { email: 'john.doe_cs.h24@gmail.com', expected: { type: 'rejected', reason: 'domain_not_allowed' } },
      
      // Suspicious inputs
      { email: 'john.doe+trick_cs.h24@college.example', expected: { type: 'rejected', reason: 'suspicious_input' } }, // plus trick
      { email: 'john.doe+admin_cs.h24@college.example', expected: { type: 'rejected', reason: 'suspicious_input' } },
      { email: 'jöhn.doe_cs.h24@college.example', expected: { type: 'rejected', reason: 'suspicious_input' } }, // non-ascii
      { email: 'john.doe_cs.h24@@college.example', expected: { type: 'rejected', reason: 'invalid_format' } }, // multiple @
      { email: 'user@domain@college.example', expected: { type: 'rejected', reason: 'invalid_format' } },
      { email: '', expected: { type: 'rejected', reason: 'suspicious_input' } },
      { email: 'a'.repeat(300) + '@college.example', expected: { type: 'rejected', reason: 'suspicious_input' } }, // too long
      
      // Invalid formats
      { email: 'notanemail', expected: { type: 'rejected', reason: 'invalid_format' } },
      
      // No pattern match
      { email: 'john.doe_cs.hXX@college.example', expected: { type: 'rejected', reason: 'no_pattern_match' } },
      { email: 'john.doe_cs@college.example', expected: { type: 'rejected', reason: 'no_pattern_match' } },
      { email: 'john_doe@college.example', expected: { type: 'rejected', reason: 'no_pattern_match' } },
      
      // Invalid year
      { email: 'john.doe_cs.h99@college.example', expected: { type: 'rejected', reason: 'invalid_year' } }, // 2099 is in the future
      { email: 'john.doe_cs.h29@college.example', expected: { type: 'rejected', reason: 'invalid_year' } }, // 2029 is future (relative to 2026)
      { email: 'john.doe_cs.h98@college.example', expected: { type: 'rejected', reason: 'invalid_year' } }, // 1998 is before 2000
    ];

    testCases.forEach(({ email, expected }) => {
      it(`parses ${email} -> ${expected.type}`, () => {
        expect(parseCollegeEmail(email, dummyConfig, NOW_2026_MAY)).toEqual(expected);
      });
    });
  });

  describe('computeYearOfStudy', () => {
    // Academic year starting July 2025 (current is May 2026)
    // 2025: year 1, 2024: year 2, 2023: year 3, 2022: year 4
    const testCasesMay2026 = [
      { joiningYear: 2025, branch: 'cs', expected: { status: 'active', yearOfStudy: 1 } },
      { joiningYear: 2024, branch: 'cs', expected: { status: 'active', yearOfStudy: 2 } },
      { joiningYear: 2022, branch: 'cs', expected: { status: 'active', yearOfStudy: 4 } },
      { joiningYear: 2021, branch: 'cs', expected: { status: 'graduated' } }, // 5th year for a 4-year programme
      { joiningYear: 2020, branch: 'cs', expected: { status: 'graduated' } }, 
      
      { joiningYear: 2021, branch: 'arch', expected: { status: 'active', yearOfStudy: 5 } }, // arch is 5 years
      { joiningYear: 2020, branch: 'arch', expected: { status: 'graduated' } },
      
      { joiningYear: 2024, branch: 'bba', expected: { status: 'active', yearOfStudy: 2 } }, // bba is 3 years
      { joiningYear: 2022, branch: 'bba', expected: { status: 'graduated' } }, 
      
      { joiningYear: 2024, branch: 'unknown', expected: { status: 'invalid' } },
      { joiningYear: 2026, branch: 'cs', expected: { status: 'invalid' } }, // Joined in 2026, but it's May, academic year 2026 hasn't started!
      { joiningYear: 2027, branch: 'cs', expected: { status: 'invalid' } },
    ];

    testCasesMay2026.forEach(({ joiningYear, branch, expected }) => {
      it(`[May 2026] calculates year for ${branch} joining ${joiningYear} -> ${expected.status}`, () => {
        expect(computeYearOfStudy(joiningYear, branch, dummyConfig, NOW_2026_MAY)).toEqual(expected);
      });
    });

    // Academic year starting July 2026 (current is Aug 2026)
    // 2026: year 1, 2025: year 2, 2024: year 3, 2023: year 4
    const testCasesAug2026 = [
      { joiningYear: 2026, branch: 'cs', expected: { status: 'active', yearOfStudy: 1 } },
      { joiningYear: 2025, branch: 'cs', expected: { status: 'active', yearOfStudy: 2 } },
      { joiningYear: 2023, branch: 'cs', expected: { status: 'active', yearOfStudy: 4 } },
      { joiningYear: 2022, branch: 'cs', expected: { status: 'graduated' } },
    ];

    testCasesAug2026.forEach(({ joiningYear, branch, expected }) => {
      it(`[Aug 2026] calculates year for ${branch} joining ${joiningYear} -> ${expected.status}`, () => {
        expect(computeYearOfStudy(joiningYear, branch, dummyConfig, NOW_2026_AUG)).toEqual(expected);
      });
    });

    // Boundary dates: June 30 vs July 1
    it('treats June 30 as previous academic year', () => {
      // June 30, 2026 -> Academic start year 2025. Joining 2025 = year 1.
      expect(computeYearOfStudy(2025, 'cs', dummyConfig, NOW_2026_JUN_30)).toEqual({ status: 'active', yearOfStudy: 1 });
    });

    it('treats July 1 as new academic year', () => {
      // July 1, 2026 -> Academic start year 2026. Joining 2025 = year 2.
      expect(computeYearOfStudy(2025, 'cs', dummyConfig, NOW_2026_JUL_01)).toEqual({ status: 'active', yearOfStudy: 2 });
    });
  });

  describe('validateYearCorrection', () => {
    it('validates correct lateral entry year', () => {
      expect(validateYearCorrection(2, 'cs', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'active', yearOfStudy: 2 });
      expect(validateYearCorrection(4, 'cs', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'active', yearOfStudy: 4 });
    });

    it('rejects graduated lateral entry', () => {
      expect(validateYearCorrection(5, 'cs', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'graduated' });
    });

    it('rejects invalid branches', () => {
      expect(validateYearCorrection(2, 'unknown', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'invalid' });
    });

    it('rejects invalid years', () => {
      expect(validateYearCorrection(0, 'cs', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'invalid' });
      expect(validateYearCorrection(-1, 'cs', dummyConfig, NOW_2026_MAY)).toEqual({ status: 'invalid' });
    });
  });
});
