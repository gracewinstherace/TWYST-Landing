const knownCasing = new Map([
  ["bcom", "BCom"],
  ["mba", "MBA"],
  ["msc", "MSc"],
  ["ba", "BA"],
  ["bba", "BBA"],
  ["ivey", "Ivey"],
  ["mcgill", "McGill"],
  ["uoft", "UofT"],
  ["u of t", "UofT"],
  ["ubc", "UBC"],
  ["nyu", "NYU"],
  ["ucla", "UCLA"],
  ["rbc", "RBC"],
  ["bmo", "BMO"],
  ["cibc", "CIBC"],
  ["td", "TD"],
  ["pe", "private equity"],
  ["ib", "investment banking"],
  ["er", "equity research"]
]);

const interestAliases = new Map([
  ["ib", "investment banking"],
  ["investment banking", "investment banking"],
  ["pe", "private equity"],
  ["private equity", "private equity"],
  ["er", "equity research"],
  ["equity research", "equity research"],
  ["am", "asset management"],
  ["asset management", "asset management"],
  ["corporate banking", "corporate banking"],
  ["corp banking", "corporate banking"],
  ["consulting", "consulting"],
  ["sales and trading", "sales and trading"],
  ["s&t", "sales and trading"],
  ["wealth management", "wealth management"],
  ["capital markets", "capital markets"]
]);

const fillerPatterns = [
  /^(hi|hello|hey)[,!.\s]+/i,
  /^(so|um|uh|probably|maybe|currently|right now)[,\s]+/i,
  /^(my name is|my name's|you can call me|call me|please call me|i go by|i'm called|im called|i am called|i am|i'm|im|this is|it's|its)\s+/i,
  /^(i go to|i went to|i attend|i'm at|im at|currently at|studying at|my school is|school is|at)\s+/i,
  /^(i study|i'm studying|im studying|studying|my program is|i am in|i'm in|im in)\s+/i,
  /^(i am interested in|i'm interested in|im interested in|interested in|i like|i want to do|i want|looking at|exploring|probably)\s+/i,
  /^(my experience is|i have experience in|i have|i did|i worked on|i worked at|for experience,?)\s+/i,
  /^(i prefer|make it|tone should be|i want it|i want the tone to be)\s+/i
];

const normalizeSpaces = (value) => String(value || "").trim().replace(/[“”]/g, "\"").replace(/[’]/g, "'").replace(/\s+/g, " ");

const trimPunctuation = (value) => normalizeSpaces(value).replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "");

const stripRepeatedFillers = (value) => {
  let output = trimPunctuation(value);
  let previous = "";
  while (output && output !== previous) {
    previous = output;
    for (const pattern of fillerPatterns) output = trimPunctuation(output.replace(pattern, ""));
  }
  return output;
};

const smartTitleWord = (word) => {
  const cleaned = word.toLowerCase();
  if (knownCasing.has(cleaned)) return knownCasing.get(cleaned);
  if (/^mc[a-z]/i.test(word)) return `Mc${word.charAt(2).toUpperCase()}${word.slice(3).toLowerCase()}`;
  if (/^[ivx]+$/i.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
};

const smartTitle = (value) =>
  trimPunctuation(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split("-").map(smartTitleWord).join("-"))
    .join(" ");

const normalizeName = (rawInput) => {
  const cleaned = stripRepeatedFillers(rawInput)
    .replace(/^(you can call me|call me|please call me|i go by|i'm called|im called|i am called)\s+/i, "")
    .replace(/\s+is fine$/i, "")
    .replace(/\s+works$/i, "");
  return smartTitle(cleaned);
};

const normalizeYearWord = (value) => {
  const text = normalizeSpaces(value).toLowerCase();
  if (/(first|1st|year\s*1|\b1\b)/.test(text)) return "First-year";
  if (/(second|2nd|year\s*2|\b2\b)/.test(text)) return "Second-year";
  if (/(third|3rd|year\s*3|\b3\b)/.test(text)) return "Third-year";
  if (/(fourth|4th|year\s*4|\b4\b)/.test(text)) return "Fourth-year";
  return "";
};

const normalizeProgram = (rawInput) => {
  const raw = stripRepeatedFillers(rawInput)
    .replace(/^(in my|my)\s+/i, "")
    .replace(/\b(a|an)\b\s+/i, "")
    .replace(/\bstudent\b/gi, "")
    .replace(/\bat\s+[A-Z][A-Za-z .'-]+$/i, "")
    .replace(/\s+/g, " ");
  const year = normalizeYearWord(rawInput);
  const withoutYear = trimPunctuation(
    raw
      .replace(/\b(first|second|third|fourth)[-\s]?year\b/gi, "")
      .replace(/\b(1st|2nd|3rd|4th)\s*year\b/gi, "")
      .replace(/\byear\s*\d\b/gi, "")
      .replace(/\b[1-4]\b/g, "")
  );
  const program = smartTitle(withoutYear);
  return [year, program].filter(Boolean).join(" ").trim();
};

const splitList = (value) =>
  trimPunctuation(value)
    .replace(/\s+(and|or)\s+/gi, ",")
    .split(/[,;/]+/)
    .map(trimPunctuation)
    .filter(Boolean);

const normalizeInterestItem = (item) => {
  const cleaned = stripRepeatedFillers(item).toLowerCase();
  if (interestAliases.has(cleaned)) return interestAliases.get(cleaned);
  if (/\bib\b/.test(cleaned)) return "investment banking";
  if (/\bpe\b/.test(cleaned)) return "private equity";
  if (/\ber\b/.test(cleaned)) return "equity research";
  return cleaned;
};

const normalizeInterests = (rawInput) => {
  const stripped = stripRepeatedFillers(rawInput);
  const items = splitList(stripped).map(normalizeInterestItem).filter(Boolean);
  const unique = [...new Set(items)];
  return unique.map((item, index) => (index === 0 ? item.charAt(0).toUpperCase() + item.slice(1) : item)).join(", ");
};

const normalizeCompanies = (rawInput) => {
  const stripped = stripRepeatedFillers(rawInput)
    .replace(/\b(companies|firms|places|targets|targeting|such as|like|including)\b/gi, "")
    .replace(/\s+/g, " ");
  return splitList(stripped)
    .map((company) => smartTitle(company.replace(/^and\s+/i, "")))
    .filter(Boolean)
    .join(", ");
};

const normalizeExperience = (rawInput) => {
  const stripped = stripRepeatedFillers(rawInput)
    .replace(/\b(relevant|previous|past)\s+experience\s*(is|includes|:)?/gi, "")
    .replace(/\b(anything relevant|stuff like)\b/gi, "")
    .replace(/\s+/g, " ");
  const phrase = trimPunctuation(stripped)
    .replace(/\bInternship\b/g, "internship")
    .replace(/\bDebate Coach\b/g, "debate coaching")
    .replace(/\bCoach\b/g, "coaching")
    .replace(/\bClub\b/g, "club")
    .replace(/\bCompetition\b/g, "competition");
  return phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : "";
};

const normalizeTone = (rawInput) => {
  const lower = stripRepeatedFillers(rawInput).toLowerCase();
  const options = ["concise", "formal", "warm", "confident", "direct", "casual"];
  if (/(short|brief|succinct|to the point)/.test(lower)) return "concise";
  if (/(professional|polished|formal)/.test(lower)) return "formal";
  if (/(friendly|warm|personal|nice)/.test(lower)) return "warm";
  if (/(confident|strong|assertive)/.test(lower)) return "confident";
  if (/(direct|blunt|straightforward)/.test(lower)) return "direct";
  if (/(casual|relaxed|chill)/.test(lower)) return "casual";
  return options.find((option) => lower.includes(option)) || "warm";
};

export const isClarificationLike = (value) => {
  const lower = String(value || "").trim().toLowerCase().replace(/[?!.,]+$/g, "");
  if (!lower) return true;

  return [
    "what",
    "what?",
    "what do you mean",
    "what does that mean",
    "explain",
    "explain that",
    "i don't know",
    "i dont know",
    "not sure",
    "idk",
    "examples",
    "example",
    "huh",
    "confused",
    "can you clarify",
    "clarify"
  ].some((phrase) => lower === phrase || lower.includes(phrase));
};

export const normalizeAnswer = (field, rawInput) => {
  const raw = normalizeSpaces(rawInput);
  if (!raw) return "";

  switch (field) {
    case "name":
      return normalizeName(raw);
    case "school":
      return smartTitle(stripRepeatedFillers(raw));
    case "program":
    case "yearProgram":
    case "year_program":
      return normalizeProgram(raw);
    case "interests":
    case "careerInterests":
    case "interested_field":
      return normalizeInterests(raw);
    case "targets":
    case "targetCompanies":
    case "target_companies":
      return normalizeCompanies(raw);
    case "experience":
    case "previous_experience":
      return normalizeExperience(raw);
    case "tone":
      return normalizeTone(raw);
    default:
      return trimPunctuation(stripRepeatedFillers(raw));
  }
};

export const cleanProfileAnswer = normalizeAnswer;

export const cleanProfileAnswers = (answers = {}) =>
  Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, normalizeAnswer(key, value)]));
