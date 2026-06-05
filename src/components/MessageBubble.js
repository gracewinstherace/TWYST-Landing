import React from "https://esm.sh/react@18.2.0";

const h = React.createElement;

export function MessageBubble({ role, children }) {
  return h("div", { className: `message-row ${role}` }, h("div", { className: `message-bubble ${role}` }, children));
}

export function TypingIndicator() {
  return h(
    "div",
    { className: "message-row ai" },
    h("div", { className: "message-bubble ai typing" }, h("span", null), h("span", null), h("span", null))
  );
}
