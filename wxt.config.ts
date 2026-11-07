import { defineConfig } from "wxt";
import { copy } from "./frontend/src/shared/i18n";

export default defineConfig({
  srcDir: "frontend/src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    resolve: {
      conditions: [
        "onnxruntime-web-use-extern-wasm",
        "module",
        "browser",
        "development|production",
      ],
    },
  }),
  manifest: {
    name: copy.app,
    description: copy.appDescription,
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    permissions: [
      "storage",
      "unlimitedStorage",
      "activeTab",
      "contextMenus",
      "offscreen",
      "sidePanel",
      "scripting",
    ],
    commands: {
      "toggle-page": {
        suggested_key: { default: "Alt+A" },
        description: copy.shortcutTogglePage,
      },
      "translate-whole-page": {
        suggested_key: { default: "Alt+W" },
        description: copy.shortcutWholePage,
      },
      "translate-input": {
        suggested_key: { default: "Alt+I" },
        description: copy.shortcutInput,
      },
      "open-sidepanel": {
        suggested_key: { default: "Alt+S" },
        description: copy.shortcutSidePanel,
      },
    },
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
