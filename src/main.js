import React from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client?deps=react@18.2.0";
import { ChatModal } from "./components/ChatModal.js";
import { LandingPage } from "./components/LandingPage.js";

const h = React.createElement;

function App() {
  const [isChatOpen, setIsChatOpen] = React.useState(false);

  return h(
    React.Fragment,
    null,
    h(LandingPage, { onBegin: () => setIsChatOpen(true) }),
    h(ChatModal, { isOpen: isChatOpen, onClose: () => setIsChatOpen(false) })
  );
}

createRoot(document.getElementById("root")).render(h(App));
