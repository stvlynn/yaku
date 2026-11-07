import { createElement, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const state = window as unknown as {
  reactErrors: string[];
  reactReady: boolean;
};
state.reactErrors = [];
function ReadingFixture() {
  const [show, setShow] = useState(true);
  useLayoutEffect(() => {
    state.reactReady = true;
  }, []);
  return createElement(
    "main",
    null,
    createElement(
      "p",
      { id: "react-reading" },
      show ? "Hello " : null,
      createElement("strong", null, "world"),
    ),
    createElement(
      "p",
      { id: "protected-code" },
      "Run ",
      createElement("code", null, "npm install"),
      " now.",
    ),
    createElement(
      "p",
      { id: "protected-math" },
      "Evaluate ",
      createElement(
        "math",
        { xmlns: "http://www.w3.org/1998/Math/MathML" },
        createElement(
          "mfrac",
          null,
          createElement("mi", null, "a"),
          createElement("mi", null, "b"),
        ),
      ),
      " carefully.",
    ),
    createElement(
      "button",
      { id: "react-toggle", onClick: () => setShow((value) => !value) },
      "Toggle conditional text",
    ),
  );
}
createRoot(document.querySelector("#root")!, {
  onUncaughtError: (error) => state.reactErrors.push(String(error)),
}).render(createElement(ReadingFixture));
