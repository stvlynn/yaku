import tokens from "./tokens.css?inline";

const hostTokens = tokens.replace(
  /:root((?:\[[^\]]+\]|:not\([^)]*\))*)/g,
  (_match, condition: string) => (condition ? `:host(${condition})` : ":host"),
);
export const contentThemeCss = `:host{all:initial}${hostTokens}
:host{background:transparent}*,*::before,*::after{box-sizing:border-box}button{font:inherit;cursor:pointer;color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);min-height:40px;padding:8px 12px;box-shadow:var(--shadow-1);font-size:13px}button:disabled{opacity:.6;cursor:default}button:focus-visible{outline:2px solid var(--ring);outline-offset:3px}button:not(:disabled):hover{background:var(--muted)}button.primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}button.primary:not(:disabled):hover{background:var(--primary)}button.ghost{border-color:transparent;box-shadow:none;background:transparent}p{margin:0;overflow-wrap:anywhere}small{color:var(--muted-foreground);font-size:12px}`;
