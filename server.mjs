import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanProfileAnswer, cleanProfileAnswers, isClarificationLike } from "./src/utils/profileCleaner.js";

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
      "id": "short",
      "title": "Short version",
      "badge": "Concise",
      "subject": "Subject text only",
      "body": "Greeting and full email body without subject"
    }
  ]
}
Include exactly five drafts with ids: warm, cold, short, longer, formal.`;

const buildPrompt = ({ answers = {}, refineTone = "", iteration = 0 }) => {
  const toneInstruction = refineTone
    ? `The user specifically requested the drafts be ${refineTone}.`
    : `The user's preferred tone is: ${answers.tone || "polished, warm, and concise"}.`;

  return [
    "You are TWYST, an expert finance recruiting outreach assistant for university students.",
    "Generate personalized but reusable networking email templates for finance recruiting.",
    "Do not require target companies from the user. Use placeholders like [Name], [Firm], [Team], or [Alum/Professional] where useful.",
    "The emails should feel polished, natural, and credible for students breaking into finance.",
    "Each draft must include a subject line, greeting, short intro, personalized reason for reaching out, relevant background, clear ask for a quick call or coffee chat, and polished closing.",
    "The five default drafts should be warm, colder, short, longer, and formal. If refineTone asks for warmer, colder, longer, shorter, formal, or casual, apply that across all drafts while preserving useful variety.",
    "Avoid exaggeration, fake specificity, and generic filler.",
    toneInstruction,
    `Regeneration pass: ${iteration}. If this is above zero, vary phrasing and the ask meaningfully.`,
    draftSchemaDescription,
    "",
    "Student profile:",
    JSON.stringify(cleanProfileAnswers(answers), null, 2)
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
    value: cleanProfileAnswer(question.id, userMessage),
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
  const cleanedValue = cleanProfileAnswer(payload.question?.id, parsed.value || payload.userMessage || "");

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
    drafts: parsed.drafts
  };
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

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
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
