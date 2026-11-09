export const inputPunctuation = ["/", "=", ";", ",", ".", ":"] as const;
export type InputPrefixKey = (typeof inputPunctuation)[number] | "none";
export type InputTrailingKey = (typeof inputPunctuation)[number] | "space";
export const inputTriggerPresses = 3;

const keyCharacters: Record<Exclude<InputPrefixKey, "none"> | "space", string> =
  {
    "/": "/、",
    "=": "=",
    ";": ";；",
    ",": ",，",
    ".": ".。",
    ":": ":：",
    space: " \u00a0",
  };

export function inputKeyCharacters(key: InputPrefixKey | InputTrailingKey) {
  return key === "none" ? "" : keyCharacters[key];
}
