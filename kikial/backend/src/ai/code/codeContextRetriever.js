const declaration = /\b(?:function|class|const|let|var|def|void|int|string|Future)\s+([A-Za-z_$][\w$]*)/g;

export function indexSource(text, filename = "source") {
  const source = String(text || ""); const symbols = []; let match;
  while ((match = declaration.exec(source))) symbols.push({ symbol: match[1], filename, start: match.index, text: source.slice(Math.max(0, match.index - 120), match.index + 900) });
  return { filename, symbols, imports: [...source.matchAll(/(?:import\s+(?:[^'"`]+?\s+from\s+)?|require\s*)[('"`]([^'"`)]+)/g)].map((item) => item[1]) };
}

export function retrieveCodeContext(index, symbol, limit = 5) {
  const query = String(symbol || "").toLowerCase();
  return (index?.symbols || []).filter((item) => item.symbol.toLowerCase().includes(query) || item.text.toLowerCase().includes(query)).slice(0, limit);
}
