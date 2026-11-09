import { expect, it } from "vitest";
import { groundedTerminology } from "../frontend/src/features/local-model/terminology";

it("returns recurring grounded terms and preserves manual mappings", () => {
  const request = {
    id: "terms",
    text: "The dentist prepared the molar for a ceramic crown.",
    targetLanguage: "zh",
    glossary: { MOLAR: "大臼齿" },
    terminologyEvidence: {
      translation: "牙医为臼齿准备了陶瓷冠。",
      later: ["The crown and molar were checked."],
    },
  };
  expect(
    groundedTerminology(
      '{"crown":"陶瓷冠","molar":"臼齿","dentist":"牙医","ceramic crown":"陶瓷冠","tooth":"臼齿"}',
      request,
    ),
  ).toEqual({ crown: "陶瓷冠" });
  expect(groundedTerminology('{"crown":"皇冠"}', request)).toEqual({});
  expect(groundedTerminology("not JSON", request)).toEqual({});
});
