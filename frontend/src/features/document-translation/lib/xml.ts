import { copy } from "../../../shared/i18n";

export function parseXml(source: string): Document {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error(copy.documentInvalidXml);
  return document;
}
