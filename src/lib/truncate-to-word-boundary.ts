/**
 * Truncates a string to a specified maximum length without breaking words.
 * If no whitespace is found within the limit, it performs a hard cut.
 * Appends the Unicode character U+2026 (ellipsis) to indicate truncation.
 */
export function truncateToWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 1) {
    return "\u2026";
  }

  const sub = text.slice(0, maxLength);
  const lastWhitespaceIndex = sub.lastIndexOf(" ");

  if (lastWhitespaceIndex !== -1) {
    return text.slice(0, lastWhitespaceIndex).trimEnd() + "\u2026";
  }

  return text.slice(0, maxLength - 1) + "\u2026";
}