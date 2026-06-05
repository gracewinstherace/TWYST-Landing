import React from "https://esm.sh/react@18.2.0";
import { ArrowRight, Mail, Network, Sparkles } from "https://esm.sh/lucide-react@0.468.0?deps=react@18.2.0";

const h = React.createElement;

export function LandingPage({ onBegin }) {
  return h(
    "main",
    { className: "landing-page" },
    h("div", { className: "ambient-grid", "aria-hidden": "true" }),
    h(
      "section",
      { className: "hero-shell" },
      h(
        "nav",
        { className: "top-nav", "aria-label": "TWYST navigation" },
        h("div", { className: "brand-lockup" }, h("span", { className: "brand-mark" }, "T"), h("span", null, "TWYST")),
        h("div", { className: "nav-signal" }, "Finance outreach, drafted in minutes")
      ),
      h(
        "div",
        { className: "hero-content" },
        h(
          "div",
          { className: "hero-copy" },
          h("div", { className: "eyebrow" }, h(Sparkles, { size: 16 }), "AI networking assistant"),
          h("h1", null, "TWYST"),
          h(
            "p",
            { className: "subheadline" },
            "TWYST helps students generate personalized outreach emails for finance recruiting, from alumni coffee chats to polished analyst introductions."
          ),
          h(
            "div",
            { className: "hero-actions" },
            h(
              "button",
              { className: "primary-cta", type: "button", onClick: onBegin, "aria-label": "Start Chat" },
              h("span", null, "Begin"),
              h(ArrowRight, { size: 18 })
            )
          )
        ),
        h(
          "div",
          { className: "hero-visual", "aria-label": "Example TWYST conversation and email draft preview" },
          h(
            "div",
            { className: "signal-card signal-card-top" },
            h("span", { className: "mini-icon" }, h(Network, { size: 16 })),
            h("div", null, h("strong", null, "Target"), h("span", null, "Alumni in investment banking"))
          ),
          h(
            "div",
            { className: "phone-preview" },
            h("div", { className: "phone-bar" }, h("span", null), h("span", null), h("span", null)),
            h("div", { className: "preview-thread" },
              h("div", { className: "bubble ai" }, "What finance paths are you exploring?"),
              h("div", { className: "bubble user" }, "IB and asset management"),
              h("div", { className: "bubble ai typing-preview" }, h("i", null), h("i", null), h("i", null))
            ),
            h(
              "div",
              { className: "preview-email" },
              h("span", null, "Subject: Coffee chat request"),
              h("p", null, "I am a student exploring finance and would value 15 minutes to learn from your path...")
            )
          ),
          h(
            "div",
            { className: "signal-card signal-card-bottom" },
            h("span", { className: "mini-icon" }, h(Mail, { size: 16 })),
            h("div", null, h("strong", null, "Output"), h("span", null, "5 tailored draft styles"))
          )
        )
      )
    )
  );
}
