const titleCaseName = (value) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((piece) => (piece ? piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase() : piece))
        .join("-")
    )
    .join(" ");

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

export const cleanProfileAnswer = (questionId, value) => {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  if (questionId === "name") {
    const cleaned = raw
      .replace(/^(hi|hello|hey)[,!.\s]+/i, "")
      .replace(/^(my name is|my name's|i am|i'm|im|this is|it's|its)\s+/i, "")
      .replace(/[.!]+$/g, "")
      .trim();
    return titleCaseName(cleaned || raw);
  }

  if (questionId === "school") {
    return raw.replace(/^(i go to|i attend|i'm at|im at|at)\s+/i, "").replace(/[.!]+$/g, "").trim();
  }

  return raw;
};

export const cleanProfileAnswers = (answers = {}) =>
  Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [key, cleanProfileAnswer(key, value)])
  );
