import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizer for tiptap-generated annotation HTML.
 * Allows formatting + inline images + links, blocks scripts/iframes/etc.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "ul", "ol", "li", "blockquote",
  "h1", "h2", "h3", "h4",
  "a", "img", "span", "div",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class"];

export function sanitizeAnnotationHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp));|\/|#)/i,
    ADD_ATTR: ["target"],
  });
}
