/**
 * lib/sundayTest.ts
 * -----------------
 * Single source of truth for Sunday Test settings.
 * The quiz itself AND every banner/label that mentions the test read from
 * here — change these two values and all UI text follows automatically.
 */

export const SUNDAY_COUNT = 45          // number of MCQs
export const SUNDAY_SECS  = 45 * 60     // test duration in seconds

/** Duration in whole minutes, for display. */
export const SUNDAY_MINS = Math.round(SUNDAY_SECS / 60)

/** "45 MCQs · 45 minutes" — shared display fragment. */
export const SUNDAY_TEST_SUMMARY = `${SUNDAY_COUNT} MCQs · ${SUNDAY_MINS} minutes`
