const interventions = {
  RETRIEVAL_MISS: "RETRIEVAL_RERANKER",
  RERANKING_ERROR: "RETRIEVAL_RERANKER",
  CONTEXT_ERROR: "CONTEXT_COMPRESSION",
  MEMORY_ERROR: "MEMORY_PIPELINE",
  REFERENCE_ERROR: "REFERENCE_RESOLUTION",
  TOOL_SELECTION_ERROR: "TOOL_ROUTING",
  TOOL_EXECUTION_ERROR: "TOOL_VALIDATION",
  PLANNER_ERROR: "PLANNER_BOUNDS",
  VERIFICATION_ERROR: "VERIFIER_PROMPT",
  PROMPT_ERROR: "PROMPT_EXPERIMENT",
  MODEL_KNOWLEDGE: "RAG_OR_TRAINING_CANDIDATE",
  MODEL_REASONING: "TRAINING_CANDIDATE",
  DATA_ERROR: "DATASET_VALIDATION",
  UNKNOWN: "INVESTIGATE",
};

export function recommendIntervention(category) { return interventions[category] || interventions.UNKNOWN; }
export function planImprovements(failures = []) { return failures.map((failure) => ({ ...failure, intervention: recommendIntervention(failure.category) })); }
