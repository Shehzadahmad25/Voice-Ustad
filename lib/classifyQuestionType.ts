/**
 * classifyQuestionType
 * --------------------
 * Detects the intent of a student question using strict keyword rules.
 * No ML, no external calls — pure deterministic classification.
 *
 * Priority order (highest to lowest):
 *   numerical > formula > definition > example > explanation > general
 */

export type QuestionType =
  | 'definition'
  | 'explanation'
  | 'formula'
  | 'example'
  | 'numerical'
  | 'general';

interface ClassifierRule {
  type: QuestionType;
  patterns: RegExp[];
}

// Each rule is tested in order. First match wins.
const RULES: ClassifierRule[] = [
  {
    type: 'numerical',
    patterns: [
      /\b(solve|calculate|find the|compute|work out|how many|how much|what is the mass|what is the volume|grams of|moles of|volume of|numerica[l]?)\b/i,
      /\d+\s*(g|kg|mol|dm3|cm3|l|atm|k)\b/i,          // contains a value with unit
      /\b(numerical|num\b|problem|question no|q\.?\d)/i,
    ],
  },
  {
    type: 'formula',
    patterns: [
      /\b(formula|equation|expression|formula of|formula for|math(ematical)?|equation of|write the formula)\b/i,
      /\bformula\b/i,
    ],
  },
  {
    type: 'definition',
    patterns: [
      /\b(define|definition|what is a?\b|what are\b|meaning of|kya hai|kya hota|matlab|kise kehte|define the term|give definition|what do you mean)\b/i,
    ],
  },
  {
    type: 'example',
    patterns: [
      /\b(give (an? )?example|show (an? )?example|example of|examples of|illustrate|demonstrate with)\b/i,
    ],
  },
  {
    type: 'explanation',
    patterns: [
      /\b(explain|how does|how do|why (is|are|does|do)|describe|elaborate|tell me (about|how)|clarify|elaborate on|what happens|how (is|are) .+ (used|formed|calculated))\b/i,
    ],
  },
];

/**
 * Returns the detected question type for a given student question string.
 *
 * @example
 *   classifyQuestionType("define mole")        // => "definition"
 *   classifyQuestionType("explain limiting reagent") // => "explanation"
 *   classifyQuestionType("formula of percent yield")  // => "formula"
 *   classifyQuestionType("calculate moles in 60g NaOH") // => "numerical"
 */
export function classifyQuestionType(question: string): QuestionType {
  const q = String(question || '').trim();
  if (!q) return 'general';

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(q)) return rule.type;
    }
  }

  return 'general';
}
