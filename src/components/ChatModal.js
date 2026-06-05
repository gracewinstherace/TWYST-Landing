import React from "https://esm.sh/react@18.2.0";
import { Send, Sparkles, X } from "https://esm.sh/lucide-react@0.468.0?deps=react@18.2.0";
import { questions } from "../data/questions.js";
import { cleanProfileAnswer, isClarificationLike } from "../utils/profileCleaner.js";
import { EmailResults } from "./EmailResults.js";
import { MessageBubble, TypingIndicator } from "./MessageBubble.js";

const h = React.createElement;

const firstMessage = {
  id: "intro",
  role: "ai",
  text: questions[0].prompt
};

const clarifyLocally = (question) => {
  const map = {
    name: "I just need the name you want me to use in the email signoff.",
    school: "Your school helps personalize the opener. For example: Western University, Queen's, UofT, McGill, or Ivey.",
    program: "This means your year and program, like second-year finance student, BCom, economics major, or Ivey AEO.",
    interests: "Tell me which paths interest you, like investment banking, private equity, equity research, asset management, corporate banking, or consulting.",
    experience: "Share credible points I can weave in: internships, clubs, stock pitches, coursework, projects, or leadership."
  };
  return map[question.id] || "Answer however you would say it naturally, and I will shape it for recruiting outreach.";
};

const interpretChatStep = async ({ question, answers, userMessage }) => {
  if (isClarificationLike(userMessage)) {
    return { action: "clarify", reply: clarifyLocally(question), value: "" };
  }

  try {
    const response = await fetch("/api/chat-step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, answers, userMessage })
    });
    if (!response.ok) throw new Error("Chat step unavailable.");
    const step = await response.json();
    const returnedValue = String(step.value || userMessage || "");

    if (step.action === "clarify" || isClarificationLike(returnedValue)) {
      return { action: "clarify", reply: step.reply || clarifyLocally(question), value: "" };
    }

    return {
      ...step,
      action: "answer",
      value: cleanProfileAnswer(question.id, returnedValue)
    };
  } catch {
    return isClarificationLike(userMessage)
      ? { action: "clarify", reply: clarifyLocally(question), value: "" }
      : { action: "answer", reply: "Got it.", value: cleanProfileAnswer(question.id, userMessage) };
  }
};

function ProfilePanel({ answers, currentIndex, onChange, onBlur }) {
  return h(
    "aside",
    { className: "context-panel profile-panel" },
    h("p", { className: "section-kicker" }, "Editable profile"),
    h(
      "div",
      { className: "answer-stack" },
      questions.map((question, index) =>
        h(
          "div",
          {
            className:
              answers[question.id] || index <= currentIndex
                ? "answer-row filled editable"
                : "answer-row editable",
            key: question.id
          },
          h("span", null, question.label),
          h("textarea", {
            "aria-label": `Edit ${question.label}`,
            value: answers[question.id] || "",
            placeholder: index <= currentIndex ? question.placeholder : "Optional for the template",
            rows: question.id === "experience" ? 3 : 2,
            onChange: (event) => onChange(question.id, event.target.value),
            onBlur: (event) => onBlur(question.id, event.target.value)
          })
        )
      )
    )
  );
}

export function ChatModal({ isOpen, onClose }) {
  const [messages, setMessages] = React.useState([firstMessage]);
  const [answers, setAnswers] = React.useState({});
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [value, setValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);
  const [iteration, setIteration] = React.useState(0);
  const [refineTone, setRefineTone] = React.useState("");
  const threadRef = React.useRef(null);

  React.useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, isTyping, isComplete]);

  const reset = () => {
    setMessages([firstMessage]);
    setAnswers({});
    setQuestionIndex(0);
    setValue("");
    setIsTyping(false);
    setIsComplete(false);
    setIteration(0);
    setRefineTone("");
  };

  const updateAnswer = (id, nextValue) => {
    setAnswers((current) => ({ ...current, [id]: nextValue }));
  };

  const normalizeAnswer = (id, nextValue) => {
    setAnswers((current) => ({ ...current, [id]: cleanProfileAnswer(id, nextValue) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const activeQuestion = questions[questionIndex];
    const trimmed = value.trim() || String(answers[activeQuestion.id] || "").trim();
    if (!trimmed || isTyping || isComplete) return;

    setMessages((current) => [
      ...current,
      { id: `user-${activeQuestion.id}`, role: "user", text: trimmed }
    ]);
    setValue("");
    setIsTyping(true);

    const step = await interpretChatStep({
      question: activeQuestion,
      answers,
      userMessage: trimmed
    });

    window.setTimeout(() => {
      if (step.action === "clarify") {
        setMessages((current) => [
          ...current,
          {
            id: `ai-clarify-${activeQuestion.id}-${Date.now()}`,
            role: "ai",
            text: step.reply || clarifyLocally(activeQuestion)
          }
        ]);
        setIsTyping(false);
        return;
      }

      const acceptedValue = cleanProfileAnswer(activeQuestion.id, step.value || trimmed);
      setAnswers((current) => ({ ...current, [activeQuestion.id]: acceptedValue }));
      const nextIndex = questionIndex + 1;
      if (nextIndex < questions.length) {
        setMessages((current) => [
          ...current,
          step.reply && step.reply !== "Got it."
            ? { id: `ai-ack-${activeQuestion.id}-${Date.now()}`, role: "ai", text: step.reply }
            : null,
          { id: `ai-${questions[nextIndex].id}`, role: "ai", text: questions[nextIndex].prompt }
        ].filter(Boolean));
        setQuestionIndex(nextIndex);
      } else {
        setMessages((current) => [
          ...current,
          step.reply && step.reply !== "Got it."
            ? { id: `ai-ack-${activeQuestion.id}-${Date.now()}`, role: "ai", text: step.reply }
            : null,
          {
            id: "ai-complete",
            role: "ai",
            text: "Perfect. I have enough context to draft a few polished outreach options."
          }
        ].filter(Boolean));
        setIsComplete(true);
      }
      setIsTyping(false);
    }, 680);
  };

  if (!isOpen) return null;

  const currentQuestion = questions[questionIndex] || questions[questions.length - 1];
  const progress = Math.round((Object.keys(answers).length / questions.length) * 100);

  return h(
    "div",
    { className: "modal-layer", role: "dialog", "aria-modal": "true", "aria-label": "TWYST chat" },
    h("button", { className: "modal-scrim", type: "button", "aria-label": "Close TWYST chat", onClick: onClose }),
    h(
      "div",
      { className: "chat-workspace" },
      h(
        "section",
        { className: "chat-phone" },
        h(
          "header",
          { className: "chat-header" },
          h("div", { className: "assistant-avatar" }, h(Sparkles, { size: 18 })),
          h("div", null, h("strong", null, "TWYST"), h("span", null, isComplete ? "Drafting complete" : "Online now")),
          h("button", { className: "close-button", type: "button", onClick: onClose, "aria-label": "Close chat" }, h(X, { size: 18 }))
        ),
        h(
          "div",
          { className: "progress-rail", "aria-label": `${progress}% complete` },
          h("span", { style: { width: `${progress}%` } })
        ),
        h(
          "div",
          { className: "message-thread", ref: threadRef },
          messages.map((message) =>
            h(MessageBubble, { key: message.id, role: message.role }, message.text)
          ),
          isTyping ? h(TypingIndicator, null) : null
        ),
        h(
          "form",
          { className: "composer", onSubmit: submit },
          h("input", {
            value,
            disabled: isTyping || isComplete,
            onChange: (event) => setValue(event.target.value),
            placeholder: isComplete ? "Drafts are ready" : currentQuestion.placeholder,
            "aria-label": currentQuestion.label
          }),
          h(
            "button",
            {
              type: "submit",
              disabled: !(value.trim() || String(answers[currentQuestion.id] || "").trim()) || isTyping || isComplete,
              "aria-label": "Send answer"
            },
            h(Send, { size: 18 })
          )
        )
      ),
      isComplete
        ? h(
            "div",
            { className: "completion-column" },
            h(ProfilePanel, { answers, currentIndex: questions.length - 1, onChange: updateAnswer, onBlur: normalizeAnswer }),
            h(EmailResults, {
              answers,
              iteration,
              refineTone,
              onRegenerate: () => setIteration((current) => current + 1),
              onRefineTone: setRefineTone,
              onStartOver: reset
            })
          )
        : h(ProfilePanel, { answers, currentIndex: questionIndex, onChange: updateAnswer, onBlur: normalizeAnswer })
    )
  );
}
