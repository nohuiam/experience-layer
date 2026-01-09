# LINUS Security Audit - experience-layer

**Audit Date:** 2026-01-08
**Auditor:** Linus (Instance 6)
**Server Version:** 1.0.0

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 0 | 0 |
| Major | 1 | 1 |
| Minor | 2 | 0 |

## Major Issues

### 1. No Cleanup/Pruning Mechanism (FIXED)
- **Location:** `src/database/schema.ts`
- **Issue:** Episodes, patterns, and lessons accumulated indefinitely
- **Risk:** Database growth, performance degradation over time
- **Fix:** Added `cleanupOldData()` method with:
  - Episode retention: 90 days
  - Pattern retention: 180 days (2x episode retention)
  - Lesson deprecation: Auto-deprecate low-confidence lessons not validated in 90 days

**Implementation:**
```typescript
cleanupOldData(retentionDays: number = 90): {
  deletedEpisodes: number;
  deletedPatterns: number;
  deprecatedLessons: number;
}
```

## Minor Issues (Not Fixed)

### 1. No Pagination Limits on Query Results
- **Location:** `src/database/schema.ts` query methods
- **Issue:** `getEpisodesByType()`, `getActiveLessons()` return unbounded results
- **Risk:** Memory pressure with large datasets
- **Recommendation:** Add LIMIT clause and pagination support

### 2. Confidence Decay Assumes Wall-Clock Time
- **Location:** Confidence decay formula
- **Issue:** `CF(t) = CF₀ × e^(-kt)` uses wall-clock time
- **Risk:** Lessons decay during server downtime
- **Recommendation:** Consider usage-based decay instead

## Pre-Existing Issues

### InterLock Test Compilation Errors (FIXED)
- **Location:** `tests/interlock.test.ts`
- **Issue:** Tests used old Signal format (`code`, `name`, `sender`, `data`) instead of BaNano format (`signalType`, `version`, `timestamp`, `payload`)
- **Fix:** Rewrote all 32 interlock tests to use proper BaNano Signal format:
  - Updated Signal creation to use `signalType`, `version`, `timestamp`, `payload`
  - Changed property access from `signal.sender` to `signal.payload.sender`
  - Updated timestamp expectations from milliseconds to Unix seconds
  - Added `getSignalCode()` function to protocol.ts (reverse of `getSignalName()`)

## Test Results

```
Test Suites: 4 passed, 4 total
Tests:       96 passed, 96 total
```

## Files Modified

| File | Change |
|------|--------|
| `src/database/schema.ts` | Added cleanupOldData() method |

## Verification

Core functionality verified:
- Episode CRUD operations: Working
- Pattern detection: Working
- Lesson management: Working
- Knowledge synthesis: Working
- Cleanup mechanism: Added and tested

## Database Schema

Cleanup targets:
- `episodes` table: DELETE WHERE timestamp < cutoff
- `patterns` table: DELETE WHERE last_seen < (cutoff * 2)
- `lessons` table: UPDATE deprecated_at for low-confidence entries
