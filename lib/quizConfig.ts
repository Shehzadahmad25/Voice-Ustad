/**
 * lib/quizConfig.ts
 * -----------------
 * Single source of truth for chapter-quiz sizing.
 * generate-quiz (chapter path) targets TARGET and never returns fewer than
 * MIN questions; save-quiz-result refuses to persist a quiz below MIN.
 * This is the guard against the "1-2 question quiz" bug.
 */

export const QUIZ_TARGET_COUNT = 30  // questions we ask the generator for
export const QUIZ_MIN_COUNT = 15     // hard floor — below this we reject, never launch/save
