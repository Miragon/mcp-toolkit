/** The texts of a result's text content blocks (`{ type: "text", text }`), in order. */
export function textBlocks(content: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(content)) return []
  const texts: string[] = []
  for (const block of content as readonly unknown[]) {
    if (isTextBlock(block)) texts.push(block.text)
  }
  return texts
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  // A primitive destructures to undefined fields; only null and undefined would throw.
  const { type, text } = (block ?? {}) as { type?: unknown; text?: unknown }
  return type === "text" && typeof text === "string"
}
