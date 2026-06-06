import React from "https://esm.sh/react@18.2.0";
import { Copy, RefreshCw, RotateCcw, Wand2 } from "https://esm.sh/lucide-react@0.468.0?deps=react@18.2.0";
import { compactEmailBody, generateEmailDrafts, locallyRefineDraft } from "../utils/emailGenerator.js";

const h = React.createElement;
const styleOptions = [
  {
    id: "professional",
    label: "Professional",
    tag: "Recommended",
    description: "Polished, direct, and appropriate for most outreach."
  },
  {
    id: "friendly",
    label: "Friendly",
    description: "More conversational and approachable while staying professional."
  }
];

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

export function EmailResults({ answers, iteration, onRegenerate, onStartOver }) {
  const [copiedId, setCopiedId] = React.useState("");
  const [selectedStyle, setSelectedStyle] = React.useState("professional");
  const [drafts, setDrafts] = React.useState(() => generateEmailDrafts(answers, { iteration }));
  const [draftInstructions, setDraftInstructions] = React.useState({});
  const [draftStatuses, setDraftStatuses] = React.useState({});
  const [refiningId, setRefiningId] = React.useState("");
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
          body: JSON.stringify({ answers, iteration })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "OpenAI generation unavailable.");
        }

        if (!cancelled) {
          setDrafts(payload.drafts.map((draft) => ({ ...draft, body: compactEmailBody(draft.body) })));
          setGenerationStatus({
            source: "openai",
            message: `Generated with OpenAI${payload.model ? ` (${payload.model})` : ""}`
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDrafts(generateEmailDrafts(answers, { iteration }));
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
  }, [answers, iteration]);

  const activeDraft = drafts.find((draft) => draft.id === selectedStyle) || drafts[0];

  const copyDraft = async (draft) => {
    const text = [
      `Subject: ${draft.subject}`,
      compactEmailBody(draft.body),
      draft.shortVersion ? `Concise version:\n${compactEmailBody(draft.shortVersion)}` : "",
      draft.followUp ? `Follow-up:\n${compactEmailBody(draft.followUp)}` : ""
    ].filter(Boolean).join("\n\n");
    if (await writeToClipboard(text)) {
      setCopiedId(draft.id);
      window.setTimeout(() => setCopiedId(""), 1400);
    }
  };

  const updateDraft = (id, patch) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch, body: patch.body !== undefined ? compactEmailBody(patch.body) : draft.body } : draft))
    );
  };

  const improveDraft = async (draft) => {
    const instruction = draftInstructions[draft.id] || "Make this version stronger while preserving the user's profile context.";
    setRefiningId(draft.id);
    setDraftStatuses((current) => ({ ...current, [draft.id]: "Asking OpenAI..." }));

    try {
      const response = await fetch("/api/refine-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, draft, instruction })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "AI refinement unavailable.");
      updateDraft(draft.id, { ...payload.draft, body: compactEmailBody(payload.draft.body) });
      setDraftStatuses((current) => ({
        ...current,
        [draft.id]:
          payload.source === "openai"
            ? "Improved with OpenAI"
            : payload.message
              ? "OpenAI quota blocked; local improvement applied"
              : "Local improvement applied"
      }));
    } catch {
      updateDraft(draft.id, locallyRefineDraft({ draft, instruction }));
      setDraftStatuses((current) => ({ ...current, [draft.id]: "Local improvement applied" }));
    } finally {
      setRefiningId("");
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
      { className: "style-selector", "aria-label": "Template style" },
      h(
        "div",
        { className: "style-selector-header" },
        h("div", { className: "tone-label" }, h(Wand2, { size: 16 }), "Template style")
      ),
      h(
        "div",
        { className: "style-options" },
        styleOptions.map((style) =>
          h(
            "button",
            {
              key: style.id,
              type: "button",
              className: selectedStyle === style.id ? "style-option active" : "style-option",
              onClick: () => setSelectedStyle(style.id),
              "aria-pressed": selectedStyle === style.id
            },
            h("span", { className: "style-option-title" }, style.label, style.tag ? h("em", null, style.tag) : null),
            h("span", { className: "style-option-description" }, style.description)
          )
        )
      )
    ),
    h(
      "div",
      { className: "draft-grid" },
      activeDraft
        ? h(
          "article",
          { className: "draft-card", key: activeDraft.id },
          h(
            "div",
            { className: "draft-card-header" },
            h("div", null, h("span", { className: "draft-badge" }, activeDraft.badge), h("h3", null, activeDraft.title)),
            h(
              "button",
              {
                className: "copy-button",
                type: "button",
                onClick: () => copyDraft(activeDraft),
                "aria-label": `Copy ${activeDraft.title}`
              },
              h(Copy, { size: 16 }),
              h("span", null, copiedId === activeDraft.id ? "Copied" : "Copy Email")
            )
          ),
          activeDraft.personalizationPlan
            ? h(
                "div",
                { className: "personalization-plan" },
                h("strong", null, "Personalization plan"),
                h("p", null, activeDraft.personalizationPlan.positioning),
                h("p", null, activeDraft.personalizationPlan.recipient_relevance),
                h("p", null, activeDraft.personalizationPlan.credibility_point),
                h("p", null, activeDraft.personalizationPlan.ask)
              )
            : null,
          h(
            "label",
            { className: "draft-field" },
            h("span", null, "Subject"),
            h("input", {
              value: activeDraft.subject,
              onChange: (event) => updateDraft(activeDraft.id, { subject: event.target.value }),
              "aria-label": `Edit subject for ${activeDraft.title}`
            })
          ),
          h(
            "label",
            { className: "draft-field" },
            h("span", null, "Email"),
            h("textarea", {
              className: "email-editor",
              value: activeDraft.body,
              rows: 8,
              onChange: (event) => updateDraft(activeDraft.id, { body: event.target.value }),
              "aria-label": `Edit email for ${activeDraft.title}`
            })
          ),
          h(
            "div",
            { className: "email-secondary-grid" },
            h(
              "label",
              { className: "draft-field" },
              h("span", null, "Concise version"),
              h("textarea", {
                className: "email-editor secondary",
                value: activeDraft.shortVersion || "",
                rows: 5,
                onChange: (event) => updateDraft(activeDraft.id, { shortVersion: event.target.value }),
                "aria-label": `Edit short version for ${activeDraft.title}`
              })
            ),
            h(
              "label",
              { className: "draft-field" },
              h("span", null, "Follow-up"),
              h("textarea", {
                className: "email-editor secondary",
                value: activeDraft.followUp || "",
                rows: 5,
                onChange: (event) => updateDraft(activeDraft.id, { followUp: event.target.value }),
                "aria-label": `Edit follow-up for ${activeDraft.title}`
              })
            )
          ),
          h(
            "div",
            { className: "draft-customizer" },
            h("input", {
              value: draftInstructions[activeDraft.id] || "",
              onChange: (event) =>
                setDraftInstructions((current) => ({ ...current, [activeDraft.id]: event.target.value })),
              placeholder: "Ask AI to improve this version...",
              "aria-label": `Instruction for ${activeDraft.title}`
            }),
            h(
              "button",
              {
                className: "icon-text-button",
                type: "button",
                onClick: () => improveDraft(activeDraft),
                disabled: refiningId === activeDraft.id
              },
              h(Wand2, { size: 16 }),
              h("span", null, refiningId === activeDraft.id ? "Improving" : "Improve")
            )
          ),
          draftStatuses[activeDraft.id]
            ? h("p", { className: "draft-status" }, draftStatuses[activeDraft.id])
            : null
        )
        : null
    )
  );
}
