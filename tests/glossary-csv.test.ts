import { describe, expect, it } from "vitest";
import {
  exportGlossaryCsv,
  importGlossaryCsv,
} from "../frontend/src/features/preferences/glossary-csv";

describe("glossary CSV", () => {
  it("round-trips UTF-8 BOM, commas, quotes and quoted multiline values", () => {
    const terms = {
      "hello, world": "你好，世界",
      'a "quoted" term': "一个“术语”",
      "two\nlines": "第一行\n第二行",
    };
    const output = exportGlossaryCsv(terms);
    expect(output.startsWith("\uFEFFsource,translation\r\n")).toBe(true);
    expect(importGlossaryCsv(output, {})).toEqual(terms);
  });
  it("accepts CRLF, quoted headers, blank records and case-insensitive column names", () => {
    expect(
      importGlossaryCsv(
        '\uFEFF"SOURCE","TRANSLATION"\r\n\r\n" name "," translation "\r\n',
        {},
      ),
    ).toEqual({ name: "translation" });
  });
  it("rejects conflicting file terms atomically and updates existing terms without a gate", () => {
    const current = { existing: "原有" };
    expect(() =>
      importGlossaryCsv("source,translation\na,one\na,two", current),
    ).toThrow("Conflicting translations in CSV: a");
    expect(
      importGlossaryCsv(
        "source,translation\nnew,value\nexisting,changed",
        current,
      ),
    ).toEqual({ existing: "changed", new: "value" });
    expect(current).toEqual({ existing: "原有" });
  });
  it("deduplicates identical records and accepts exporting then importing the same glossary", () => {
    const terms = { term: "译文" };
    expect(
      importGlossaryCsv("source,translation\nterm,译文\nterm,译文", terms),
    ).toEqual(terms);
    expect(importGlossaryCsv(exportGlossaryCsv(terms), terms)).toBe(terms);
  });
  it("rejects malformed quoting, wrong columns and missing terms instead of guessing a format", () => {
    for (const csv of [
      'source,translation\n"open,end',
      'source,translation\n"closed"bad,value',
      "source,target\nword,value",
      "source,translation\nword,value,extra",
      "source,translation\nword,",
      'source,translation\na"b,value',
      "source,translation\n",
      "source,translation\n,,\n",
    ])
      expect(() => importGlossaryCsv(csv, {})).toThrow();
  });
  it("stores prototype-like term names as ordinary data keys", () => {
    const terms = importGlossaryCsv(
      "source,translation\n__proto__,prototype\nconstructor,构造函数\ntoString,转换字符串",
      {},
    );
    expect(Object.hasOwn(terms, "__proto__")).toBe(true);
    expect(terms.__proto__).toBe("prototype");
    expect(importGlossaryCsv(exportGlossaryCsv(terms), {})).toEqual(terms);
  });
});
