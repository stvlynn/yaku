import { createRoot } from "react-dom/client";
import { ExtensionApp } from "../../app/ExtensionApp";
createRoot(document.getElementById("root")!).render(
  <ExtensionApp surface="welcome" />,
);
