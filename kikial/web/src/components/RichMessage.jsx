import { useMemo } from "react";

function inlineParts(text) {
  const parts = String(text || "").split(/(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    return <span key={index}>{part}</span>;
  });
}

function renderBlocks(content) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let code = [];
  let language = "";
  let list = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push(<p key={`p-${blocks.length}`}>{inlineParts(text)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`l-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inlineParts(item)}</li>)}</ul>);
    list = [];
  };
  const flushCode = () => {
    blocks.push(<pre key={`c-${blocks.length}`}><div className="ki-code-head"><span>{language || "code"}</span></div><code>{code.join("\n")}</code></pre>);
    code = [];
    language = "";
  };

  let inCode = false;
  for (const line of lines) {
    const fence = line.match(/^```\s*([\w.+-]*)/);
    if (fence) {
      if (inCode) flushCode();
      else { flushParagraph(); flushList(); language = fence[1] || ""; }
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      flushParagraph(); flushList();
      const Tag = `h${Math.min(4, heading[1].length + 2)}`;
      blocks.push(<Tag key={`h-${blocks.length}`}>{inlineParts(heading[2])}</Tag>);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.+)/);
    if (bullet) { flushParagraph(); list.push(bullet[1]); continue; }
    paragraph.push(line.trim());
  }
  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return blocks;
}

export default function RichMessage({ content, sources = [] }) {
  const blocks = useMemo(() => renderBlocks(content), [content]);
  const usableSources = useMemo(() => (Array.isArray(sources) ? sources : [])
    .filter((source) => source?.url || source?.title)
    .slice(0, 8), [sources]);

  return (
    <>
      <div className="ki-rich-message">{blocks}</div>
      {usableSources.length > 0 && (
        <div className="ki-source-grid">
          {usableSources.map((source, index) => (
            <a key={`${source.url || source.title}-${index}`} href={source.url || undefined} target={source.url ? "_blank" : undefined} rel="noreferrer" className="ki-source-card">
              <span>[{index + 1}]</span>
              <div><strong>{source.title || source.domain || "Nguồn"}</strong><small>{source.domain || source.url || source.sourceType || ""}</small></div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
