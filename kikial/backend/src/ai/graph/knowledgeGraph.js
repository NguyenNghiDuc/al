import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const path = join(fileURLToPath(new URL("../../../data/", import.meta.url)), "knowledgeGraph.json");
let graph = { entities: [], relations: [] };
let loaded = false;
const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

export async function initializeGraph(items = []) {
  if (loaded) return graph;
  try { graph = JSON.parse(await readFile(path, "utf8")); } catch { graph = { entities: [], relations: [] }; }
  graph.relations = [...new Map((graph.relations || []).map((item) => [`${item.subject}:${item.predicate}:${item.object}`, item])).values()];
  if (!graph.relations.length && items.length) {
    const relations = [];
    for (const item of items) {
      const question = normalize(item.question); const answer = item.answer || "";
      if (question.includes("flutter") && normalize(answer).includes("dart")) relations.push({ subject: "Flutter", predicate: "uses_language", object: "Dart", source: item.id, confidence: 0.9 });
      if (question.includes("node") && normalize(answer).includes("javascript")) relations.push({ subject: "Node.js", predicate: "uses", object: "JavaScript", source: item.id, confidence: 0.9 });
      if (question.includes("react") && normalize(answer).includes("frontend")) relations.push({ subject: "React", predicate: "type", object: "Frontend Library", source: item.id, confidence: 0.8 });
    }
    const uniqueRelations = [...new Map(relations.map((item) => [`${item.subject}:${item.predicate}:${item.object}`, item])).values()];
    graph = { entities: [...new Set(uniqueRelations.flatMap((item) => [item.subject, item.object]))], relations: uniqueRelations };
    await mkdir(join(fileURLToPath(new URL("../../../data/", import.meta.url))), { recursive: true });
    await writeFile(path, JSON.stringify(graph, null, 2));
  }
  loaded = true; return graph;
}

export function searchGraph(query, limit = 5) {
  const text = normalize(query);
  return graph.relations.filter((relation) => [relation.subject, relation.predicate, relation.object].some((value) => text.includes(normalize(value)))).slice(0, limit).map((relation) => ({ ...relation, sourceType: "GRAPH", score: relation.confidence }));
}
export function graphCount() { return graph.relations.length; }
