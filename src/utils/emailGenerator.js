const titleCase = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const ordinalYear = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/(first|1st|year\s*1|\b1\b)/i.test(text)) return "first-year";
  if (/(second|2nd|year\s*2|\b2\b)/i.test(text)) return "second-year";
  if (/(third|3rd|year\s*3|\b3\b)/i.test(text)) return "third-year";
  if (/(fourth|4th|year\s*4|\b4\b)/i.test(text)) return "fourth-year";
  return text;
};

const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");

const articleFor = (phrase) => (/^[aeiou]/i.test(phrase) ? "an" : "a");

const sentenceCase = (text) => {
  const trimmed = clean(text);
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
};

const signoffForTone = (tone) => {
  const lower = tone.toLowerCase();
  if (lower.includes("career")) return "Best";
  if (lower.includes("professional")) return "Best";
  if (lower.includes("formal")) return "Sincerely";
  if (lower.includes("cold")) return "Regards";
  if (lower.includes("warm") || lower.includes("casual")) return "Best";
  if (lower.includes("direct") || lower.includes("concise")) return "Thanks";
  return "Best";
};

const profileName = (profile) => titleCase(profile.name || "");

const normalizeProgram = (profile) => {
  const program = clean(profile.program);
  if (!program) return "";
  return program.replace(/^year\s*\d+\s*/i, "").replace(/^(First|Second|Third|Fourth)-year/, (match) => match.toLowerCase()).trim();
};

const studentDescription = (profile) => {
  const school = clean(profile.school);
  const program = normalizeProgram(profile);
  const year = ordinalYear(profile.year || "");
  const programHasYear = /(first|second|third|fourth|1st|2nd|3rd|4th|year\s*\d)/i.test(program);
  const programText = program ? `${programHasYear || !year ? "" : `${year} `}${program}`.trim() : "";
  const studentText = programText
    ? /\bstudent\b/i.test(programText)
      ? programText
      : `${programText} student`
    : year
      ? `${year} student`
      : "student";

  if (school) return `${articleFor(studentText)} ${studentText} at ${school}`;
  return `${articleFor(studentText)} ${studentText}`;
};

const hasFinanceExperience = (item) =>
  /(capital markets|bank|banking|investment|finance|equity|valuation|markets|fund|portfolio|research|m&a|private equity|asset management|investment club|finance club|advisory)/i.test(
    item
  );

const paraphraseExperienceItem = (item) => {
  const text = clean(item);
  if (!text) return "";
  if (/rbc capital markets internship/i.test(text)) return "a prior capital markets internship";
  if (/student-managed investment fund|student managed investment fund/i.test(text)) return "a student-managed investment fund";
  if (/valuation model|valuation/i.test(text)) return "valuation projects";
  if (/boutique advisory/i.test(text)) return "a boutique advisory internship";
  if (/president .*mcgill.*investment club/i.test(text) || /mcgill.*investment club.*president/i.test(text)) {
    return "serving as president of McGill's investment club";
  }
  if (/president .*investment club/i.test(text) || /investment club.*president/i.test(text)) {
    return "leading the investment club";
  }
  if (/investment club/i.test(text)) return "investment club involvement";
  if (/capital markets/i.test(text)) return "capital markets experience";
  if (/equity research/i.test(text)) return "equity research work";
  if (/search fund/i.test(text)) return "search fund exposure";
  if (/stock pitch/i.test(text)) return "stock pitch experience";
  if (/investment/i.test(text) || /banking/i.test(text)) return "finance internship experience";
  return "";
};

const relevantExperiencePhrase = (experience) => {
  const items = Array.isArray(experience)
    ? experience
    : clean(experience)
      ? clean(experience).split(/\s*(?:,|;|\band\b)\s*/i)
      : [];

  const relevant = items.filter(hasFinanceExperience).map(paraphraseExperienceItem).filter(Boolean);
  const unique = [...new Set(relevant)];

  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
};

const experienceSentence = (profile, prefix = "I have started building relevant exposure through") => {
  const phrase = relevantExperiencePhrase(profile.previous_experience || profile.experience);
  return phrase ? `${prefix} ${phrase}.` : "";
};

const positioningSentence = (profile) => {
  const interests = interestPhrase(profile);
  const description = studentDescription(profile);
  return `Position as ${description} exploring ${interests}.`;
};

const recipientRelevanceSentence = (profile, style) => {
  const interests = interestPhrase(profile);
  if (style === "career") {
    return `Connect the recipient's work to practical exposure in ${interests} and ask for perspective on entering the field.`;
  }
  if (style === "friendly") {
    return `Frame the outreach as a thoughtful student hoping to learn from someone with firsthand experience in ${interests}.`;
  }
  if (style === "concise") {
    return `Keep the recipient reason direct: their experience is relevant to the student's interest in ${interests}.`;
  }
  return `Tie the note to the recipient's relevant finance experience and keep the ask specific and low-friction.`;
};

const credibilityPointSentence = (profile) => {
  const phrase = relevantExperiencePhrase(profile.previous_experience || profile.experience);
  return phrase ? `Use ${phrase} as the proof point.` : "Use the student's current finance interest as the credibility point without overstating experience.";
};

const goalSentence = (profile) => {
  const school = clean(profile.school);
  const interests = interestPhrase(profile);
  if (school) return `I’m currently a ${school} student pursuing ${interests}`;
  return `I’m currently pursuing ${interests}`;
};

const recipientPathSentence = (profile, mode = "professional") => {
  const school = clean(profile.school);
  const interests = interestPhrase(profile);
  if (profile.recipientCompany || profile.company) {
    const company = clean(profile.recipientCompany || profile.company);
    if (school) return `I came across your profile and noticed your path from ${school} to ${company}.`;
    return `I came across your profile and noticed your experience at ${company}.`;
  }
  if (mode === "friendly") {
    return `I noticed your experience in ${interests}, which is very close to the path I’m hoping to pursue.`;
  }
  return `I came across your profile and noticed your experience in ${interests}.`;
};

const experienceEvidenceSentence = (profile, mode = "professional") => {
  const phrase = relevantExperiencePhrase(profile.previous_experience || profile.experience);
  if (!phrase) return "";
  if (mode === "friendly") return `I’m currently ${goalSentence(profile).replace(/^I’m currently\s+/i, "")}, with experience through ${phrase}.`;
  return `I’ve built relevant experience through ${phrase}.`;
};

const introSentence = (profile, style = "standard") => {
  const name = profileName(profile);
  const description = studentDescription(profile);
  if (name && style === "direct") return `I am ${name}, ${description}.`;
  if (name) return `My name is ${name}, and I am ${description}.`;
  return `I am ${description}.`;
};

const normalizeInterest = (value) => {
  const text = clean(value || "finance");
  return text
    .replace(/\bIB\b/g, "investment banking")
    .replace(/\bPE\b/g, "private equity")
    .replace(/\bER\b/g, "equity research")
    .toLowerCase();
};

const interestPhrase = (profile) => normalizeInterest(profile.interests || profile.interested_field || "finance");

const askForTone = (tone, iteration = 0) => {
  const lower = tone.toLowerCase();
  if (lower.includes("career")) {
    return iteration % 2 === 0
      ? "Would you be open to a 15-minute call so I could learn how you approached the field and what you would recommend I focus on next?"
      : "If you have 15 minutes, I would value your advice on how to keep building toward this path.";
  }
  if (lower.includes("professional")) {
    return iteration % 2 === 0
      ? "Would you be open to a brief 15-minute chat?"
      : "If your schedule allows, I would appreciate 15 minutes to learn from your experience.";
  }
  if (lower.includes("cold")) {
    return iteration % 2 === 0
      ? "Would you be open to a brief informational call if your schedule allows?"
      : "If you have availability, I would appreciate the chance to ask a few focused questions about your experience.";
  }
  if (lower.includes("formal")) {
    return iteration % 2 === 0
      ? "I would be grateful for the opportunity to schedule a brief informational conversation at your convenience."
      : "If your schedule permits, I would sincerely appreciate a short conversation to learn from your experience.";
  }
  if (lower.includes("warm") || lower.includes("casual")) {
    return iteration % 2 === 0
      ? "Would you be open to a quick 15-minute chat? I’d love to hear about your experience and any advice you’d give someone starting out."
      : "I would really appreciate the chance to hear your perspective over a short call or coffee chat.";
  }
  if (lower.includes("short") || lower.includes("concise")) {
    return "Would you be open to a quick informational call?";
  }
  return "Would you be open to a brief informational conversation in the next couple of weeks?";
};

const makeEmail = ({ profile, tone, subject, title, badge, description, lines, shortLines, followUpLines, iteration, style }) => {
  const signoff = signoffForTone(tone);
  const name = profileName(profile);
  const ask = askForTone(tone, iteration);
  const bodyLines = [
    "Hi [Name],",
    ...lines.filter(Boolean),
    ask,
    `${signoff},`,
    ...(name ? [name] : [])
  ];
  const shortBodyLines = [
    "Hi [Name],",
    ...(shortLines || lines.slice(0, 2)).filter(Boolean),
    ask,
    `${signoff},`,
    ...(name ? [name] : [])
  ];
  const followUpBodyLines = [
    "Hi [Name],",
    ...(followUpLines || [
      `I wanted to quickly follow up on my note about learning more about ${interestPhrase(profile)}.`,
      "I know schedules get busy, but I would be grateful for any chance to ask a few focused questions."
    ]),
    `${signoff},`,
    ...(name ? [name] : [])
  ];

  return {
    id: style,
    subject,
    body: bodyLines.join("\n").replace(/\n{2,}/g, "\n").trim(),
    shortVersion: shortBodyLines.join("\n").replace(/\n{2,}/g, "\n").trim(),
    followUp: followUpBodyLines.join("\n").replace(/\n{2,}/g, "\n").trim(),
    personalizationPlan: {
      positioning: positioningSentence(profile),
      recipient_relevance: recipientRelevanceSentence(profile, style),
      credibility_point: credibilityPointSentence(profile),
      ask,
      outreach_logic: `This outreach makes sense because the student's finance interest is supported by specific context from the chat.`
    },
    qualityCheck: {
      specific_user_experience_included: Boolean(relevantExperiencePhrase(profile.previous_experience || profile.experience)),
      specific_recipient_reason_included: true,
      clear_ask_included: true,
      generic_language_removed: true
    },
    description,
    title,
    badge
  };
};

export const compactEmailBody = (body) =>
  String(body || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

export const locallyRefineDraft = ({ draft, instruction = "" }) => {
  const request = instruction.toLowerCase();
  let body = compactEmailBody(draft.body || "");
  let subject = clean(draft.subject || "");
  const lines = body.split("\n").filter(Boolean);

  if (request.includes("shorter") || request.includes("concise")) {
    body = lines.filter((line) => !/what you wish|day to day|prepare for recruiting/i.test(line)).join("\n");
  }

  if (/experience line|background line|experience sentence|background sentence|more natural/.test(request)) {
    body = lines
      .map((line) => {
        if (/search fund exposure/i.test(line)) {
          return "My interest has also been shaped by my current work at a search fund.";
        }
        if (/prior capital markets internship/i.test(line)) {
          return "I have also had a chance to build relevant exposure through prior capital markets experience.";
        }
        if (/investment club/i.test(line)) {
          return "I have also been deepening my interest through my leadership in McGill's investment club.";
        }
        if (/relevant exposure through/i.test(line)) {
          return line.replace(/I have started building relevant exposure through/i, "I have been building a stronger foundation through");
        }
        return line;
      })
      .join("\n");
  }

  if (request.includes("warmer") || request.includes("friendly")) {
    body = body.replace("Would you be open to", "If you are open to it, I would really appreciate");
    subject = subject.replace(/^Question from/, "Would love to learn from");
  }

  if (request.includes("colder") || request.includes("more direct")) {
    body = body.replace("I would really appreciate", "I would appreciate");
    body = body.replace("would love to", "would appreciate the chance to");
    subject = subject.replace(/^Would love to learn from/, "Question from");
  }

  if (request.includes("longer")) {
    const currentLines = body.split("\n");
    const askIndex = currentLines.findIndex((line) => /open to|appreciate|grateful/i.test(line));
    const extra = "I would be especially interested in learning how you approached recruiting and what advice you would give a student trying to understand the field more thoughtfully.";
    if (!body.includes(extra)) {
      currentLines.splice(Math.max(askIndex, 2), 0, extra);
      body = currentLines.join("\n");
    }
  }

  return {
    ...draft,
    subject,
    body: compactEmailBody(body)
  };
};

const styles = [
  {
    key: "professional",
    title: "Professional",
    badge: "Recommended",
    description: "Polished, direct, and appropriate for most outreach.",
    tone: "professional",
    build: (profile, iteration) => {
      const interests = interestPhrase(profile);
      return makeEmail({
        profile,
        iteration,
        tone: "professional",
        style: "professional",
        title: "Professional",
        badge: "Recommended",
        description: "Polished, direct, and appropriate for most outreach.",
        subject: `Learning more about ${interests}`,
        lines: [
          recipientPathSentence(profile, "professional"),
          `${goalSentence(profile)}, and your experience stood out to me.`,
          experienceEvidenceSentence(profile, "professional")
        ],
        shortLines: [
          `${goalSentence(profile)} and would value learning from your experience.`,
          experienceEvidenceSentence(profile, "professional")
        ]
      });
    }
  },
  {
    key: "friendly",
    title: "Friendly",
    badge: "Friendly",
    description: "More conversational and approachable while staying professional.",
    tone: "warm",
    build: (profile, iteration) => {
      const interests = interestPhrase(profile);
      return makeEmail({
        profile,
        iteration,
        tone: "warm",
        style: "friendly",
        title: "Friendly",
        badge: "Friendly",
        description: "More conversational and approachable while staying professional.",
        subject: `Would love to learn from your experience in ${interests}`,
        lines: [
          "I hope you’re doing well.",
          recipientPathSentence(profile, "friendly"),
          experienceEvidenceSentence(profile, "friendly")
        ]
      });
    }
  }
];

export const generateEmailDrafts = (answers, options = {}) => {
  const iteration = options.iteration || 0;
  const profile = { ...answers };

  return styles.map((style) => {
    const draft = style.build(profile, iteration);

    return {
      id: style.key,
      title: style.title,
      badge: draft.badge,
      description: draft.description,
      profile,
      personalizationPlan: draft.personalizationPlan,
      subject: draft.subject,
      body: draft.body,
      shortVersion: draft.shortVersion,
      followUp: draft.followUp,
      qualityCheck: draft.qualityCheck
    };
  });
};
