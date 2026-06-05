import React from "https://esm.sh/react@18.2.0";
import { Copy, RefreshCw, RotateCcw, Wand2 } from "https://esm.sh/lucide-react@0.468.0?deps=react@18.2.0";
import { generateEmailDrafts } from "../utils/emailGenerator.js";

const h = React.createElement;
const toneOptions = ["warmer", "colder", "longer", "shorter", "more formal", "more casual"];

const writeToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "-1000px";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return copied;
  }
};

export function EmailResults({ answers, iteration, refineTone, onRegenerate, onRefineTone, onStartOver }) {
  const [copiedId, setCopiedId] = React.useState("");
  const [drafts, setDrafts] = React.useState(() => generateEmailDrafts(answers, { iteration, refineTone }));
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generationStatus, setGenerationStatus] = React.useState({
    source: "local",
    message: "Local template preview"
  });

  React.useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      setIsGenerating(true);
      setGenerationStatus({ source: "loading", message: "Thinking with OpenAI..." });

      try {
        const response = await fetch("/api/generate-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers, iteration, refineTone })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "OpenAI generation unavailable.");
        }

        if (!cancelled) {
          setDrafts(payload.drafts);
          setGenerationStatus({
            source: "openai",
            message: `Generated with OpenAI${payload.model ? ` (${payload.model})` : ""}`
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDrafts(generateEmailDrafts(answers, { iteration, refineTone }));
          setGenerationStatus({
            source: "local",
            message: error instanceof Error ? `Local fallback: ${error.message}` : "Local fallback active"
          });
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    };

    generate();

    return () => {
      cancelled = true;
    };
  }, [answers, iteration, refineTone]);

  const copyDraft = async (draft) => {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    if (await writeToClipboard(text)) {
      setCopiedId(draft.id);
      window.setTimeout(() => setCopiedId(""), 1400);
    }
  };

  return h(
    "section",
    { className: "results-panel", "aria-live": "polite" },
    h(
      "div",
      { className: "results-header" },
      h(
        "div",
        null,
        h("p", { className: "section-kicker" }, isGenerating ? "TWYST is thinking" : "Drafts ready"),
        h("h2", null, "Choose your template style"),
        h("p", { className: `generation-status ${generationStatus.source}` }, generationStatus.message)
      ),
      h(
        "div",
        { className: "results-actions" },
        h(
          "button",
          { className: "icon-text-button", type: "button", onClick: onRegenerate },
          h(RefreshCw, { size: 16 }),
          h("span", null, "Regenerate")
        ),
        h(
          "button",
          { className: "icon-text-button muted", type: "button", onClick: onStartOver },
          h(RotateCcw, { size: 16 }),
          h("span", null, "Start Over")
        )
      )
    ),
    h(
      "div",
      { className: "tone-refiner" },
      h("div", { className: "tone-label" }, h(Wand2, { size: 16 }), "Refine with AI"),
      h(
        "div",
        { className: "tone-options" },
        toneOptions.map((tone) =>
          h(
            "button",
            {
              key: tone,
              type: "button",
              className: refineTone === tone ? "tone-chip active" : "tone-chip",
              onClick: () => onRefineTone(tone)
            },
            tone
          )
        )
      )
    ),
    h(
      "div",
      { className: "draft-grid" },
      drafts.map((draft) =>
        h(
          "article",
          { className: "draft-card", key: draft.id },
          h(
            "div",
            { className: "draft-card-header" },
            h("div", null, h("span", { className: "draft-badge" }, draft.badge), h("h3", null, draft.title)),
            h(
              "button",
              {
                className: "copy-button",
                type: "button",
                onClick: () => copyDraft(draft),
                "aria-label": `Copy ${draft.title}`
              },
              h(Copy, { size: 16 }),
              h("span", null, copiedId === draft.id ? "Copied" : "Copy Email")
            )
          ),
          h("div", { className: "subject-line" }, h("strong", null, "Subject: "), draft.subject),
          h("pre", { className: "email-body" }, draft.body)
        )
      )
    )
  );
}
