import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = join(fileURLToPath(new URL("../data/", import.meta.url)));
const knowledgePath = join(dataDirectory, "learned.json");
let knowledge = [];

const words = (text) => new Set(
  text.toLocaleLowerCase("vi").match(/[\p{L}\p{N}]{3,}/gu) || [],
);

export async function loadKnowledge() {
  try {
    const stored = JSON.parse(await readFile(knowledgePath, "utf8"));
    knowledge = Array.isArray(stored) ? stored : [];
  } catch {
    knowledge = [];
    await saveKnowledge();
  }

  return knowledge;
}

export async function saveKnowledge(nextKnowledge = knowledge) {
  const items = Array.isArray(nextKnowledge) ? nextKnowledge : knowledge;
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(knowledgePath, JSON.stringify(items.slice(-500), null, 2));
  knowledge = items.slice(-500);
  return knowledge;
}

export function findRelevantKnowledge(question, limit = 4) {
  const questionWords = words(question);
  return knowledge
    .map((item) => {
      const itemWords = words(`${item.question} ${item.answer}`);
      const score = [...questionWords].filter((word) => itemWords.has(word)).length;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

export async function learn(question, answer) {
  knowledge.push({
    question,
    answer,
    learnedAt: new Date().toISOString(),
  });
  await saveKnowledge();
}

export function knowledgeCount() {
  return knowledge.length;
}
