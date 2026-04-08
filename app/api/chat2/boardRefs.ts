export type BoardRef = {
  refChapterNo?: string;
  refPageNo?: string;
  refLabel?: string;
};

type TopicRefRule = {
  keywords: string[];
  refPageNo: string;
};

type ChapterRefConfig = {
  chapterNo: string;
  chapterMatch: string[];
  defaultPageNo: string;
  topics: TopicRefRule[];
};

const CHAPTER_REF_CONFIGS: ChapterRefConfig[] = [
  {
    chapterNo: '01',
    chapterMatch: ['stoichiometry'],
    defaultPageNo: '1-25',
    topics: [
      { keywords: ['gram-atom', 'gram atom', 'atomic mass', 'avogadro', 'mole and avogadro'], refPageNo: '1-5' },
      { keywords: ['molar mass', 'moles from mass', 'mole calculation'], refPageNo: '5-8' },
      { keywords: ['chemical equation', 'mole-mole', 'mole-mass', 'mass-mass', 'stoichiometric'], refPageNo: '8-12' },
      { keywords: ['gas', 'stp', 'molar volume', 'dm3', 'litre'], refPageNo: '12-14' },
      { keywords: ['percentage composition', 'percent composition', 'h2so4', 'percentage of'], refPageNo: '14-17' },
      { keywords: ['limiting reagent', 'excess reagent', 'limiting', 'excess'], refPageNo: '17-19' },
      { keywords: ['theoretical yield', 'percent yield', 'actual yield', 'yield'], refPageNo: '19-25' },
    ],
  },
  {
    chapterNo: '03',
    chapterMatch: ['atomic structure'],
    defaultPageNo: '40-49',
    topics: [
      { keywords: ['bohr'], refPageNo: '41' },
      { keywords: ['quantum number', 'quantum numbers', 'quantum'], refPageNo: '44' },
      { keywords: ['pauli'], refPageNo: '45' },
      { keywords: ['hund'], refPageNo: '46' },
      { keywords: ['electronegativity'], refPageNo: '47' },
    ],
  },
];

export function inferBoardRef(message: string, chapter: string): BoardRef {
  const q = (message || '').toLowerCase();
  const ch = (chapter || '').toLowerCase();

  const cfg = CHAPTER_REF_CONFIGS.find((c) => c.chapterMatch.some((m) => ch.includes(m)));
  if (!cfg) {
    // No page data available — return empty so the UI hides the badge entirely
    return {
      refChapterNo: '',
      refPageNo: '',
      refLabel: '',
    };
  }

  const topic = cfg.topics.find((t) => t.keywords.some((k) => q.includes(k)));
  return {
    refChapterNo: cfg.chapterNo,
    refPageNo: topic?.refPageNo ?? cfg.defaultPageNo,
    refLabel: 'Board Reference',
  };
}
