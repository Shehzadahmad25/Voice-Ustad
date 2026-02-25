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
    return {
      refChapterNo: chapter ? 'TBD' : '',
      refPageNo: 'TBD',
      refLabel: 'Board Reference',
    };
  }

  const topic = cfg.topics.find((t) => t.keywords.some((k) => q.includes(k)));
  return {
    refChapterNo: cfg.chapterNo,
    refPageNo: topic?.refPageNo ?? cfg.defaultPageNo,
    refLabel: 'Board Reference',
  };
}
