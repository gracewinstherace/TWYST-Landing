const fallback = {
  name: "your name",
  school: "your school",
  program: "your program",
  interests: "finance",
  experience: "my relevant experience"
};

const clean = (value, key) => {
  const text = String(value || "").trim();
  return text || fallback[key];
};

const sentenceCase = (text) => {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
};

const signoffForTone = (tone) => {
  const lower = tone.toLowerCase();
  if (lower.includes("formal")) return "Sincerely";
  if (lower.includes("cold")) return "Regards";
  if (lower.includes("warm") || lower.includes("casual")) return "Best";
  if (lower.includes("direct") || lower.includes("concise")) return "Thanks";
  return "Best regards";
};

const studentDescription = (program, school) => {
  const normalizedProgram = clean(program, "program");
  const normalizedSchool = clean(school, "school");
  const studentNoun = /\bstudent\b/i.test(normalizedProgram) ? "" : " student";
  return `a ${normalizedProgram}${studentNoun} at ${normalizedSchool}`;
};

const askForTone = (tone, iteration = 0) => {
  const lower = tone.toLowerCase();
  if (lower.includes("cold")) {
    return iteration % 2 === 0
      ? "Would you be open to a brief 15-minute call if your schedule allows?"
      : "If you are available, I would appreciate a short call to learn more about your experience.";
  }
  if (lower.includes("direct")) {
    return iteration % 2 === 0
      ? "Would you be open to a quick 15-minute call next week?"
      : "If you have 15 minutes next week, I would appreciate the chance to ask a few focused questions.";
  }
  if (lower.includes("formal")) {
    return iteration % 2 === 0
      ? "I would be grateful for the opportunity to schedule a brief call at your convenience."
      : "If your schedule permits, I would sincerely appreciate a short informational conversation.";
  }
  if (lower.includes("warm") || lower.includes("casual")) {
    return iteration % 2 === 0
      ? "If you are open to it, I would love to grab 15 minutes for a quick coffee chat or call."
      : "I would really appreciate the chance to hear your perspective over a short call or coffee chat.";
  }
  if (lower.includes("confident")) {
    return iteration % 2 === 0
      ? "I would appreciate 15 minutes to learn from your experience and better understand how I can position myself strongly."
      : "A short conversation would help me pressure-test my recruiting approach and learn from your experience.";
  }
  return iteration % 2 === 0
    ? "Would you be open to a brief call or coffee chat in the next couple of weeks?"
    : "If you are available, I would be grateful for a quick call or coffee chat sometime soon.";
};

const makeBody = (profile, style, iteration = 0) => {
  const name = clean(profile.name, "name");
  const school = clean(profile.school, "school");
  const program = clean(profile.program, "program");
  const interests = clean(profile.interests, "interests");
  const experience = clean(profile.experience, "experience");
  const selectedTone = style.tone || "polished";
  const signoff = signoffForTone(selectedTone);
  const ask = askForTone(selectedTone, iteration);
  const introVerb = iteration % 2 === 0 ? "reaching out" : "getting in touch";

  return [
    style.subject({ interests }),
    "",
    "Hi [Name],",
    "",
    style.opening({ name, school, program, introVerb }),
    style.reason({ interests }),
    style.background({ experience, interests, program }),
    ask,
    "",
    `${signoff},`,
    sentenceCase(name)
  ].join("\n");
};

const splitEmail = (text) => {
  const [subjectLine, ...bodyLines] = text.split("\n");
  return {
    subject: subjectLine.replace(/^Subject:\s*/i, ""),
    body: bodyLines.join("\n").trim()
  };
};

const styles = [
  {
    key: "warm",
    title: "Warm version",
    badge: "Warm",
    tone: "warm",
    subject: ({ interests }) => `Subject: Would love to learn about your path in ${interests}`,
    opening: ({ name, school, program }) =>
      `My name is ${name}, and I am ${studentDescription(program, school)}.`,
    reason: ({ interests }) =>
      `I am exploring ${interests} and came across your background while learning more about the industry.`,
    background: ({ experience }) =>
      `I have been building my interest through ${experience}, and I would really value hearing how you approached your path.`
  },
  {
    key: "cold",
    title: "Colder version",
    badge: "Colder",
    tone: "cold",
    subject: ({ interests }) => `Subject: Quick question from a student interested in ${interests}`,
    opening: ({ name, school, program }) =>
      `My name is ${name}, and I am ${studentDescription(program, school)}.`,
    reason: ({ interests }) =>
      `I am currently learning more about ${interests} and wanted to reach out after seeing your experience at [Firm].`,
    background: ({ experience }) =>
      `My background includes ${experience}, and I am hoping to better understand the recruiting path and day-to-day work.`
  },
  {
    key: "short",
    title: "Short version",
    badge: "Short",
    tone: "concise",
    subject: ({ interests }) => `Subject: Student interested in ${interests}`,
    opening: ({ name, school, program }) =>
      `I am ${name}, ${studentDescription(program, school)}.`,
    reason: ({ interests }) =>
      `I am exploring ${interests} and would appreciate learning from your experience at [Firm].`,
    background: ({ experience }) =>
      `My background includes ${experience}, and I am hoping to ask a few focused questions about your path.`
  },
  {
    key: "longer",
    title: "Longer version",
    badge: "Longer",
    subject: ({ interests }) => `Subject: Coffee chat request from a student exploring ${interests}`,
    opening: ({ name, school, program }) =>
      `My name is ${name}, and I am currently ${studentDescription(program, school)}.`,
    reason: ({ interests }) =>
      `I have been learning more about ${interests} and came across your background while researching professionals at [Firm].`,
    background: ({ experience, program }) =>
      `Through ${experience}, I have been building a stronger foundation in finance and getting clearer on where I want to focus after ${program}. I would value hearing how you approached recruiting, what your role looks like day to day, and what you think students should understand before entering the industry.`
  },
  {
    key: "formal",
    title: "More formal version",
    badge: "Formal",
    tone: "formal",
    subject: ({ interests }) => `Subject: Request for an informational conversation about ${interests}`,
    opening: ({ name, school, program }) =>
      `My name is ${name}, and I am ${studentDescription(program, school)}.`,
    reason: ({ interests }) =>
      `I am currently exploring opportunities in ${interests} and wanted to reach out after learning about your experience at [Firm].`,
    background: ({ experience }) =>
      `My relevant experience includes ${experience}, which has strengthened my interest in the industry and motivated me to seek informed perspectives from professionals.`
  }
];

export const generateEmailDrafts = (answers, options = {}) => {
  const refineTone = options.refineTone || "";
  const iteration = options.iteration || 0;
  const profile = { ...fallback, ...answers };

  return styles.map((style) => {
    const activeStyle = refineTone ? { ...style, tone: refineTone } : style;
    const email = splitEmail(makeBody(profile, activeStyle, iteration));
    return {
      id: style.key,
      title: style.title,
      badge: refineTone || style.badge,
      ...email
    };
  });
};
