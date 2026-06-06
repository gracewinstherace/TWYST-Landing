import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { locallyRefineDraft } from "./src/utils/emailGenerator.js";
import { cleanProfileAnswers, isClarificationLike, normalizeAnswer } from "./src/utils/profileCleaner.js";

const root = fileURLToPath(new URL(".", import.meta.url));

const loadDotEnv = async () => {
  try {
    const envText = await readFile(join(root, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional local config. Environment variables still work without this file.
  }
};

await loadDotEnv();

const port = Number(process.env.PORT || 4173);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
};

const extractResponseText = (data) => {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
};

const parseJsonText = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("OpenAI response was not valid JSON.");
  }
};

const draftSchemaDescription = `Return strict JSON with this shape:
{
  "drafts": [
    {
      "id": "professional",
      "title": "Professional",
      "badge": "Recommended",
      "description": "Polished, direct, and appropriate for most outreach.",
      "profile": {},
      "personalizationPlan": {
        "positioning": "",
        "recipient_relevance": "",
        "credibility_point": "",
        "ask": "",
        "outreach_logic": ""
      },
      "subject": "Subject text only",
      "body": "120 to 170 word email body without subject",
      "shortVersion": "concise version under 90 words",
      "followUp": "follow-up email body",
      "qualityCheck": {
        "specific_user_experience_included": true,
        "specific_recipient_reason_included": true,
        "clear_ask_included": true,
        "generic_language_removed": true
      }
    }
  ]
}
Include exactly two drafts with ids: professional and friendly.`;

const singleDraftSchemaDescription = `Return strict JSON with this shape:
{
  "draft": {
    "id": "same id as the input draft",
    "title": "same title as the input draft",
    "badge": "short label for the revised draft",
    "subject": "revised subject text only",
    "body": "revised email body without subject"
  }
}`;

const compactEmailBody = (body = "") => String(body || "").replace(/\s*\n+\s*/g, "\n").trim();

const normalizeDraftPayload = (draft = {}) => ({
  ...draft,
  personalizationPlan: draft.personalizationPlan || draft.personalization_plan,
  shortVersion: draft.shortVersion || draft.short_version || draft.email?.short_version,
  followUp: draft.followUp || draft.follow_up || draft.email?.follow_up,
  subject: draft.subject || draft.email?.subject || "",
  body: compactEmailBody(draft.body || draft.email?.body || ""),
  qualityCheck: draft.qualityCheck || draft.quality_check,
  profile: draft.profile || {}
});

const buildPrompt = ({ answers = {}, refineTone = "", iteration = 0 }) => {
  const toneInstruction = refineTone
    ? `The user specifically requested the drafts be ${refineTone}.`
    : `The user's preferred tone is: ${answers.tone || "polished, warm, and concise"}.`;

  return [
    "You are TWYST, a cold outreach strategist for students and early-career candidates.",
    "Do not write immediately. First convert the chat history into a structured outreach profile, then create a personalization plan, then write the email.",
    "Generate networking emails for a student seeking an informational conversation in finance.",
    "Never repeat raw field values verbatim or dump data into the email. Integrate facts into complete, natural sentences.",
    "Do not use placeholders of any kind. Avoid bracketed text, fake names, fake firms, fake teams, and invented recipient details.",
    "If a field is missing, omit it naturally. Do not mention that information is missing.",
    "Mention previous experience only if it is relevant to the student's stated field. Paraphrase it instead of copying it. For example, an RBC Capital Markets Internship can become a prior capital markets internship; Debate Coach should usually be omitted for investment banking unless framed very lightly as communication experience.",
    "The emails should sound like a real student reaching out for an informational conversation, not a cover letter or a data template.",
    "Each draft must include a subject line, greeting, short intro, reason for reaching out, relevant background if any, clear ask for a quick call or coffee chat, and polished closing.",
    "Before each email, generate a personalization plan with: user-positioning sentence, recipient/company relevance sentence, credibility proof point, clear ask, and one-line reason this outreach makes sense.",
    "Generate a 120 to 170 word email, a concise version under 90 words, a follow-up email, and an explanation through the personalization plan of what was personalized.",
    "Reject generic output. The email must include at least one specific user experience when available, one specific career goal, one specific reason for contacting the recipient/company or role, one clear ask, and no vague unsupported phrases.",
    "Do not add blank lines between paragraphs. Use single line breaks only.",
    "The two drafts must be professional and friendly.",
    "Professional template structure: Hi [Name], then a concise profile/profile-path observation, then current student and career goal, then relevant experience evidence, then a low-friction 15-minute chat ask, then Best and the student's name.",
    "Friendly template structure: Hi [Name], then a warm opening, then a profile/path observation close to the student's goal, then current student and experience evidence, then a quick 15-minute chat ask, then Best and the student's name.",
    "Avoid exaggeration, fake specificity, and generic filler.",
    toneInstruction,
    `Regeneration pass: ${iteration}. If this is above zero, vary phrasing and the ask meaningfully.`,
    draftSchemaDescription,
    "",
    "Student profile:",
    JSON.stringify(cleanProfileAnswers(answers), null, 2)
  ].join("\n");
};

const buildDraftRefinePrompt = ({ answers = {}, draft = {}, instruction = "" }) => {
  return [
    "You are TWYST, an expert finance recruiting outreach editor.",
    "Revise one networking email draft according to the user's instruction.",
    "Keep it sounding like a student asking for an informational conversation.",
    "Use the chat profile to keep the email related to the student's actual context.",
    "Never use placeholders, fake names, fake companies, or bracketed text.",
    "Do not repeat raw profile fields verbatim. Integrate facts naturally.",
    "Mention previous experience only if relevant, and weave it in seamlessly.",
    "Do not add blank lines between paragraphs. Use single line breaks only.",
    singleDraftSchemaDescription,
    "",
    "Student profile:",
    JSON.stringify(cleanProfileAnswers(answers), null, 2),
    "",
    "Current draft:",
    JSON.stringify({ ...draft, body: compactEmailBody(draft.body) }, null, 2),
    "",
    `User instruction: ${instruction || "Improve this draft while preserving its style."}`
  ].join("\n");
};

const clarificationFallbacks = {
  name: "I just need the name you want signed at the bottom of the template.",
  school: "Your school helps personalize the intro, for example: Western University, Queen's, UofT, McGill, or Ivey.",
  program: "This is your year and program, like second-year finance student, BCom, economics major, or Ivey AEO.",
  interests: "Tell me the finance paths you care about. Examples: investment banking, private equity, equity research, asset management, corporate banking, or consulting.",
  experience: "Share anything credible I can weave in: internships, clubs, competitions, coursework, research, projects, or leadership."
};

const localChatStep = ({ question = {}, userMessage = "" }) => {
  if (isClarificationLike(userMessage)) {
    return {
      ok: true,
      source: "local",
      action: "clarify",
      value: "",
      reply: clarificationFallbacks[question.id] || "Say it in your own words, and I will turn it into a polished recruiting profile detail."
    };
  }

  return {
    ok: true,
    source: "local",
    action: "answer",
    value: normalizeAnswer(question.id, userMessage),
    reply: "Got it."
  };
};

const buildChatStepPrompt = ({ question = {}, answers = {}, userMessage = "" }) => {
  return [
    "You are TWYST, a smart finance recruiting outreach assistant for students.",
    "You are running a one-question-at-a-time chat. Decide whether the user's latest message answers the current question or asks for clarification.",
    "If the user is confused, asks what you mean, asks for examples, says they do not know, or gives a non-answer, do not advance. Explain the current question briefly with finance-recruiting examples.",
    "If the user provides an answer, return the cleaned answer and a brief natural acknowledgement.",
    "Never ask who the user wants to write to. The product generates reusable templates, not one specific recipient email.",
    "Return only JSON with this shape: {\"action\":\"answer|clarify\",\"value\":\"cleaned answer or empty string\",\"reply\":\"short conversational response\"}.",
    "",
    "Current question:",
    JSON.stringify(question, null, 2),
    "",
    "Profile so far:",
    JSON.stringify(cleanProfileAnswers(answers), null, 2),
    "",
    `User message: ${userMessage}`
  ].join("\n");
};

const chatStepWithOpenAI = async (payload) => {
  if (isClarificationLike(payload.userMessage)) {
    return localChatStep(payload);
  }

  if (!process.env.OPENAI_API_KEY) {
    return localChatStep(payload);
  }

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: buildChatStepPrompt(payload),
      temperature: 0.35
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    return {
      ...localChatStep(payload),
      message: data.error?.message || "OpenAI chat step failed."
    };
  }

  const parsed = parseJsonText(extractResponseText(data));
  const action = parsed.action === "clarify" ? "clarify" : "answer";
  const cleanedValue = normalizeAnswer(payload.question?.id, parsed.value || payload.userMessage || "");

  if (action === "clarify" || isClarificationLike(cleanedValue)) {
    return {
      ok: true,
      source: "openai",
      model,
      action: "clarify",
      value: "",
      reply: String(parsed.reply || clarificationFallbacks[payload.question?.id] || "Let me clarify that.").trim()
    };
  }

  return {
    ok: true,
    source: "openai",
    model,
    action: "answer",
    value: cleanedValue,
    reply: String(parsed.reply || (action === "answer" ? "Got it." : clarificationFallbacks[payload.question?.id] || "Let me clarify that.")).trim()
  };
};

const generateWithOpenAI = async (payload) => {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      status: 401,
      code: "missing_api_key",
      message: "OPENAI_API_KEY is not set on the local server."
    };
  }

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(payload),
      temperature: 0.8
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    return {
      ok: false,
      status: apiResponse.status,
      code: data.error?.code || "openai_error",
      message: data.error?.message || "OpenAI request failed."
    };
  }

  const text = extractResponseText(data);
  const parsed = parseJsonText(text);
  if (!Array.isArray(parsed.drafts) || parsed.drafts.length === 0) {
    throw new Error("OpenAI response did not include drafts.");
  }

  return {
    ok: true,
    source: "openai",
    model,
    drafts: parsed.drafts.map(normalizeDraftPayload)
  };
};

const refineDraftWithOpenAI = async (payload) => {
  const fallback = {
    ok: true,
    source: "local",
    draft: locallyRefineDraft(payload)
  };

  if (!process.env.OPENAI_API_KEY) return fallback;

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: buildDraftRefinePrompt(payload),
      temperature: 0.65
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    return {
      ...fallback,
      message: data.error?.message || "OpenAI draft refinement failed."
    };
  }

  const parsed = parseJsonText(extractResponseText(data));
  return {
    ok: true,
    source: "openai",
    model,
    draft: {
      ...payload.draft,
      ...normalizeDraftPayload(parsed.draft),
      body: compactEmailBody(parsed.draft?.body || parsed.draft?.email?.body || payload.draft?.body || "")
    }
  };
};

const handleRefineDraft = async (request, response) => {
  let payload = {};
  try {
    payload = await readJsonBody(request);
    const result = await refineDraftWithOpenAI(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 200, {
      ok: true,
      source: "local",
      draft: locallyRefineDraft(payload),
      message: error instanceof Error ? error.message : "Draft refinement failed."
    });
  }
};

const handleChatStep = async (request, response) => {
  try {
    const payload = await readJsonBody(request);
    const result = await chatStepWithOpenAI(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 200, {
      ok: true,
      source: "local",
      action: "clarify",
      value: "",
      reply: "I can clarify that. Try answering with a few words or a short sentence, and I will shape it into the template.",
      message: error instanceof Error ? error.message : "Chat step failed."
    });
  }
};

const handleGenerate = async (request, response) => {
  try {
    const payload = await readJsonBody(request);
    const result = await generateWithOpenAI(payload);
    sendJson(response, result.ok ? 200 : result.status || 500, result);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      code: "generation_failed",
      message: error instanceof Error ? error.message : "Generation failed."
    });
  }
};

const safeFilePath = (pathname) => {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  return join(root, normalized);
};

const serveStatic = async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let filePath = safeFilePath(url.pathname);
  const isAssetRequest = Boolean(extname(url.pathname));

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    if (isAssetRequest) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    filePath = join(root, "index.html");
  }

  try {
    await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

createServer((request, response) => {
  if (request.method === "POST" && request.url?.startsWith("/api/refine-draft")) {
    handleRefineDraft(request, response);
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/api/chat-step")) {
    handleChatStep(request, response);
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/api/generate-email")) {
    handleGenerate(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
}).listen(port, () => {
  console.log(`TWYST server running at http://localhost:${port}/`);
  console.log(process.env.OPENAI_API_KEY ? `OpenAI enabled with ${model}` : "OpenAI disabled: set OPENAI_API_KEY to enable AI drafts.");
});
