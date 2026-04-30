/** Remove cercas tipo \`\`\`json ... \`\`\` que alguns modelos ainda devolvem. */
export function parseJsonObjectFromModelText(raw: string): unknown {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  return JSON.parse(s) as unknown;
}
