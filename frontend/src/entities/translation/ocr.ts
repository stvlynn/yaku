const ocrLanguages: Record<string, string> = {
  zh: "chi_sim+eng",
  "zh-Hant": "chi_tra+eng",
  ja: "jpn+eng",
  ko: "kor+eng",
  fr: "fra",
  de: "deu",
  es: "spa",
  ru: "rus",
  ar: "ara",
};
export function ocrLanguageFor(language: string) {
  return ocrLanguages[language] ?? "eng";
}
