import { initializeMemory } from "./lib/learningMemory.js";
import { reindexKnowledge } from "./src/ai/retrieval/index.js";
import { initializeGraph } from "./src/ai/graph/index.js";
import { getKnowledge, getLearned } from "./lib/learningMemory.js";

await initializeMemory();
const count = await reindexKnowledge();
await initializeGraph([...getKnowledge(), ...getLearned().filter((item) => item.verified)]);
console.log(JSON.stringify({ ok: true, vectorItems: count }));
