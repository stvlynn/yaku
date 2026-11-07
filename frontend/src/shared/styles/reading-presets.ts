// Persisted user reading preferences, separate from application theme colors.
export const readingTextColors = [
  { value: "", label: "pageDefault" },
  { value: "#14120e", label: "readingInk" },
  { value: "#5e554c", label: "readingMuted" },
  { value: "#1c5d99", label: "readingBlue" },
  { value: "#23643f", label: "readingGreen" },
] as const;
export const readingBackgroundColors = [
  { value: "", label: "pageDefault" },
  { value: "#faf8f5", label: "readingPaper" },
  { value: "#fff3c2", label: "readingYellow" },
  { value: "#e7efe8", label: "readingSage" },
  { value: "#e8eef6", label: "readingMist" },
] as const;
