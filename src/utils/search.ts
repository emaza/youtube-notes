/**
 * Video search filters (YouTube Data API v3 `search.list`). They are kept as
 * plain strings so they serialize 1:1 into the browser URL and the cache key.
 */
export const SEARCH_FILTER_KEYS = [
  // Words (composed into the API `q`)
  'q', 'exactPhrase', 'anyWords', 'noneWords',
  // Channel
  'channel', 'channelType',
  // Sorting and dates (dates as YYYY-MM-DD)
  'order', 'publishedAfter', 'publishedBefore',
  // Video properties
  'videoDuration', 'videoDefinition', 'videoDimension', 'videoCaption', 'videoLicense',
  'videoEmbeddable', 'videoSyndicated', 'videoType', 'eventType',
  // Region, language and content
  'regionCode', 'relevanceLanguage', 'safeSearch', 'videoCategoryId', 'topicId',
  // Location ("lat,lng" and e.g. "10km")
  'location', 'locationRadius',
  'maxResults'
] as const;

export type SearchFilterKey = typeof SEARCH_FILTER_KEYS[number];
export type SearchFilters = Partial<Record<SearchFilterKey, string>>;

/** Gmail-style word fields, composed into the API `q` by `buildQuery`. */
const WORD_KEYS: SearchFilterKey[] = ['q', 'exactPhrase', 'anyWords', 'noneWords'];

/** Trimmed copy without empty values, or null when nothing is left. */
export function normalizeFilters(filters: SearchFilters): SearchFilters | null {
  const result: SearchFilters = {};
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key]?.trim();
    if (value) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

/** Canonical query string: the same for the browser URL and the cache key. */
export function serializeFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function parseFilters(params: URLSearchParams): SearchFilters | null {
  const filters: SearchFilters = {};
  for (const key of SEARCH_FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return normalizeFilters(filters);
}

/**
 * Gmail-style word fields composed into one `q` with the operators
 * `search.list` supports: "exact phrase", a|b (any) and -x (none).
 */
export function buildQuery(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(filters.q);
  if (filters.exactPhrase) parts.push(`"${filters.exactPhrase.replace(/"/g, '')}"`);
  const anyWords = splitWords(filters.anyWords);
  if (anyWords.length) parts.push(anyWords.join('|'));
  for (const word of splitWords(filters.noneWords)) parts.push(`-${word.replace(/^-/, '')}`);
  return parts.join(' ');
}

/** Query params for our `/api/search` endpoint. */
export function toApiParams(filters: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    if (value && !WORD_KEYS.includes(key)) params[key] = value;
  }
  const q = buildQuery(filters);
  if (q) params['q'] = q;
  // Whole days, in UTC.
  if (filters.publishedAfter) params['publishedAfter'] = `${filters.publishedAfter}T00:00:00Z`;
  if (filters.publishedBefore) params['publishedBefore'] = `${filters.publishedBefore}T23:59:59Z`;
  return params;
}

function splitWords(text?: string): string[] {
  return (text ?? '').split(/\s+/).filter(Boolean);
}

// --- Options for the advanced search form ---

export interface SelectOption { value: string; label: string; }

export const ORDER_OPTIONS: SelectOption[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date', label: 'Upload date' },
  { value: 'viewCount', label: 'View count' },
  { value: 'rating', label: 'Rating' },
  { value: 'title', label: 'Title' }
];

export const VIDEO_FILTER_OPTIONS: Partial<Record<SearchFilterKey, SelectOption[]>> = {
  channelType: [{ value: 'show', label: 'Shows only' }],
  videoDuration: [
    { value: 'short', label: 'Under 4 minutes' },
    { value: 'medium', label: '4 – 20 minutes' },
    { value: 'long', label: 'Over 20 minutes' }
  ],
  videoDefinition: [{ value: 'high', label: 'HD' }, { value: 'standard', label: 'SD' }],
  videoDimension: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }],
  videoCaption: [{ value: 'closedCaption', label: 'With captions' }, { value: 'none', label: 'Without captions' }],
  videoLicense: [{ value: 'creativeCommon', label: 'Creative Commons' }, { value: 'youtube', label: 'Standard YouTube' }],
  videoEmbeddable: [{ value: 'true', label: 'Embeddable only' }],
  videoSyndicated: [{ value: 'true', label: 'Playable outside YouTube' }],
  videoType: [{ value: 'episode', label: 'Episodes' }, { value: 'movie', label: 'Movies' }],
  eventType: [
    { value: 'live', label: 'Live now' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'completed', label: 'Past broadcasts' }
  ],
  safeSearch: [
    { value: 'none', label: 'Off' },
    { value: 'strict', label: 'Strict' }
  ]
};

export const MAX_RESULTS_OPTIONS = ['10', '25', '50'];
export const RADIUS_UNITS = ['km', 'mi', 'm', 'ft'];

const REGION_CODES = [
  'AR', 'AT', 'AU', 'BE', 'BO', 'BR', 'CA', 'CH', 'CL', 'CN', 'CO', 'CR', 'CU', 'CZ', 'DE', 'DK', 'DO', 'EC',
  'EG', 'ES', 'FI', 'FR', 'GB', 'GR', 'GT', 'HN', 'HU', 'ID', 'IE', 'IL', 'IN', 'IT', 'JP', 'KR', 'MA', 'MX',
  'NG', 'NI', 'NL', 'NO', 'NZ', 'PA', 'PE', 'PH', 'PL', 'PR', 'PT', 'PY', 'RO', 'RU', 'SA', 'SE', 'SG', 'SV',
  'TH', 'TR', 'TW', 'UA', 'US', 'UY', 'VE', 'VN', 'ZA'
];

const LANGUAGE_CODES = [
  'ar', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'eu', 'fi', 'fr', 'gl', 'he', 'hi', 'hu', 'id', 'it', 'ja',
  'ko', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant'
];

export const REGION_OPTIONS = displayOptions(REGION_CODES, 'region');
export const LANGUAGE_OPTIONS = displayOptions(LANGUAGE_CODES, 'language');

function displayOptions(codes: string[], type: 'region' | 'language'): SelectOption[] {
  const names = new Intl.DisplayNames(['en'], { type });
  return codes
    .map(code => ({ value: code, label: names.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Topics `search.list` accepts as `topicId` (from the API reference). */
export const TOPIC_GROUPS: { label: string; topics: SelectOption[] }[] = [
  { label: 'Music', topics: [
    { value: '/m/04rlf', label: 'Music (all)' }, { value: '/m/02mscn', label: 'Christian music' },
    { value: '/m/0ggq0m', label: 'Classical music' }, { value: '/m/01lyv', label: 'Country' },
    { value: '/m/02lkt', label: 'Electronic music' }, { value: '/m/0glt670', label: 'Hip hop music' },
    { value: '/m/05rwpb', label: 'Independent music' }, { value: '/m/03_d0', label: 'Jazz' },
    { value: '/m/028sqc', label: 'Music of Asia' }, { value: '/m/0g293', label: 'Music of Latin America' },
    { value: '/m/064t9', label: 'Pop music' }, { value: '/m/06cqb', label: 'Reggae' },
    { value: '/m/06j6l', label: 'Rhythm and blues' }, { value: '/m/06by7', label: 'Rock music' },
    { value: '/m/0gywn', label: 'Soul music' }
  ] },
  { label: 'Gaming', topics: [
    { value: '/m/0bzvm2', label: 'Gaming (all)' }, { value: '/m/025zzc', label: 'Action game' },
    { value: '/m/02ntfj', label: 'Action-adventure game' }, { value: '/m/0b1vjn', label: 'Casual game' },
    { value: '/m/02hygl', label: 'Music video game' }, { value: '/m/04q1x3q', label: 'Puzzle video game' },
    { value: '/m/01sjng', label: 'Racing video game' }, { value: '/m/0403l3g', label: 'Role-playing video game' },
    { value: '/m/021bp2', label: 'Simulation video game' }, { value: '/m/022dc6', label: 'Sports game' },
    { value: '/m/03hf_rm', label: 'Strategy video game' }
  ] },
  { label: 'Sports', topics: [
    { value: '/m/06ntj', label: 'Sports (all)' }, { value: '/m/0jm_', label: 'American football' },
    { value: '/m/018jz', label: 'Baseball' }, { value: '/m/018w8', label: 'Basketball' },
    { value: '/m/01cgz', label: 'Boxing' }, { value: '/m/09xp_', label: 'Cricket' },
    { value: '/m/02vx4', label: 'Football' }, { value: '/m/037hz', label: 'Golf' },
    { value: '/m/03tmr', label: 'Ice hockey' }, { value: '/m/01h7lh', label: 'Mixed martial arts' },
    { value: '/m/0410tth', label: 'Motorsport' }, { value: '/m/07bs0', label: 'Tennis' },
    { value: '/m/07_53', label: 'Volleyball' }
  ] },
  { label: 'Entertainment', topics: [
    { value: '/m/02jjt', label: 'Entertainment (all)' }, { value: '/m/09kqc', label: 'Humor' },
    { value: '/m/02vxn', label: 'Movies' }, { value: '/m/05qjc', label: 'Performing arts' },
    { value: '/m/066wd', label: 'Professional wrestling' }, { value: '/m/0f2f9', label: 'TV shows' }
  ] },
  { label: 'Lifestyle', topics: [
    { value: '/m/019_rr', label: 'Lifestyle (all)' }, { value: '/m/032tl', label: 'Fashion' },
    { value: '/m/027x7n', label: 'Fitness' }, { value: '/m/02wbm', label: 'Food' },
    { value: '/m/03glg', label: 'Hobby' }, { value: '/m/068hy', label: 'Pets' },
    { value: '/m/041xxh', label: 'Beauty' }, { value: '/m/07c1v', label: 'Technology' },
    { value: '/m/07bxq', label: 'Tourism' }, { value: '/m/07yv9', label: 'Vehicles' }
  ] },
  { label: 'Society', topics: [
    { value: '/m/098wr', label: 'Society (all)' }, { value: '/m/09s1f', label: 'Business' },
    { value: '/m/0kt51', label: 'Health' }, { value: '/m/01h6rj', label: 'Military' },
    { value: '/m/05qt0', label: 'Politics' }, { value: '/m/06bvp', label: 'Religion' }
  ] },
  { label: 'Other', topics: [{ value: '/m/01k8wb', label: 'Knowledge' }] }
];

const FILTER_LABELS: Partial<Record<SearchFilterKey, string>> = {
  channel: 'Channel', channelType: 'Channel type',
  order: 'Sort', publishedAfter: 'After', publishedBefore: 'Before', videoDuration: 'Duration',
  videoDefinition: 'Quality', videoDimension: 'Dimension', videoCaption: 'Captions', videoLicense: 'License',
  videoEmbeddable: 'Embeddable', videoSyndicated: 'Syndicated', videoType: 'Type', eventType: 'Live',
  regionCode: 'Region', relevanceLanguage: 'Language', safeSearch: 'SafeSearch', videoCategoryId: 'Category',
  topicId: 'Topic', location: 'Location', locationRadius: 'Radius', maxResults: 'Per page'
};

/** Human-readable chips for the active filters (the words are shown via `buildQuery`). */
export function describeFilters(filters: SearchFilters, categoryNames: Record<string, string> = {}): string[] {
  const chips: string[] = [];
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    if (!value || WORD_KEYS.includes(key)) continue;
    chips.push(`${FILTER_LABELS[key]}: ${describeValue(key, value, categoryNames)}`);
  }
  return chips;
}

function describeValue(key: SearchFilterKey, value: string, categoryNames: Record<string, string>): string {
  if (key === 'order') return ORDER_OPTIONS.find(o => o.value === value)?.label ?? value;
  if (key === 'regionCode') return REGION_OPTIONS.find(o => o.value === value)?.label ?? value;
  if (key === 'relevanceLanguage') return LANGUAGE_OPTIONS.find(o => o.value === value)?.label ?? value;
  if (key === 'videoCategoryId') return categoryNames[value] ?? value;
  if (key === 'topicId') {
    return TOPIC_GROUPS.flatMap(g => g.topics).find(t => t.value === value)?.label ?? value;
  }
  return VIDEO_FILTER_OPTIONS[key]?.find(o => o.value === value)?.label ?? value;
}
