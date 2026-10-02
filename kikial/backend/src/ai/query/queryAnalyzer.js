const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/[đĐ]/g, "d")
  .toLowerCase()
  .trim();

const GREETING_RE = /^(?:xin chao|chao|hello|hi|hey|alo|cam on|thanks|thank you|ok|okay|uh|u|ừ|ừm|hmm)[!.?\s]*$/i;
const QUESTION_RE = /(?:\?|\b(?:la gi|tai sao|vi sao|the nao|nhu the nao|khi nao|o dau|ai la|bao nhieu|khac gi|so sanh|co nen|lam sao|cach nao|what|why|how|when|where|who|which)\b)/i;
const FRESH_RE = /(?:moi nhat|hom nay|hien tai|bay gio|gan day|cap nhat|phien ban moi|gia hien tai|tin moi|latest|today|current|recent|update|news|internet|web)/i;
const FOLLOW_UP_RE = /(?:\bno\b|\bdo\b|\bvay\b|\btiep\b|vi du cho|cai nay|cai do|phan kia|lam tiep|noi tiep|giai thich them|them nua)/i;
const STUDY_TOPIC_RE = /(?:ke toan|tai chinh|thue|excel|misa|toeic|ielts|tieng anh|tieng trung|mang may tinh|tcp|udp|dns|nat|cidr|aws|ec2|alb|asg|cloud|he dieu hanh|co so du lieu|database|sql|lap lich|cau truc du lieu|giai thuat|flutter|android|react|javascript|typescript|python|dart|java|c\+\+|node(?:\.js)?|express|html|css|github|git\b)/i;

export function analyzeQuery(message, history = []) {
  const text = normalize(message);
  const words = text.split(/\s+/).filter(Boolean);
  const hasHistory = Array.isArray(history) && history.length > 0;
  const math = /(?:\d\s*[+*/%^×÷]|\b(?:mu|can|sqrt|%\s*(?:cua)|giam|tang)\b)/i.test(text);
  const memory = /(?:nho|ghi nho|ten toi|toi dang|minh dang|toi thich|(?:muc tieu.*(?:toi|minh)|(?:toi|minh).*muc tieu)|dao nay)/i.test(text);
  const coding = /(?:code|lap trinh|javascript|typescript|python|dart|flutter|bug|debug|ham|chuong trinh|api|sql|html|css|react|node(?:\.js)?|express|java|c\+\+|github|git\b)/i.test(text);
  const document = /(?:tai lieu|file|van ban|document|pdf|csv|md|txt|docx|xlsx|noi dung file|doc file)/i.test(text);
  const planning = /(?:ke hoach|lap ke hoach|tung buoc|roadmap|du an|xay dung|kien truc|thiet ke he thong|trien khai)/i.test(text);
  const fresh = FRESH_RE.test(text);
  const research = /(?:tim kiem|nghien cuu|nguon|tra cuu|kiem tra thong tin)/i.test(text) || fresh;
  const followUp = hasHistory && FOLLOW_UP_RE.test(text);
  const greeting = GREETING_RE.test(text);
  const looksLikeQuestion = QUESTION_RE.test(text);
  const studyTopic = STUDY_TOPIC_RE.test(text);
  const topicOnly = words.length <= 2 && (coding || studyTopic);

  let intent = "SIMPLE_CHAT";
  if (math) intent = "MATH";
  else if (memory) intent = "MEMORY";
  else if (document) intent = "DOCUMENT";
  else if (planning) intent = "PLANNING";
  else if (coding) intent = "CODING";
  else if (research) intent = "RESEARCH";
  else if (followUp) intent = "MULTI_STEP";
  else if (studyTopic || (!greeting && (looksLikeQuestion || words.length > 3))) intent = "FACTUAL";

  const complexity = planning || research || words.length > 25
    ? "HIGH"
    : followUp || coding || words.length > 8
      ? "MEDIUM"
      : "LOW";

  const needsKnowledge = !["MATH", "SIMPLE_CHAT", "MEMORY"].includes(intent);
  const needsRetrieval = !["MATH", "SIMPLE_CHAT", "MEMORY"].includes(intent);

  return {
    intent,
    topic: words.slice(0, 10).join(" "),
    entities: words.filter((word) => word.length > 3).slice(0, 16),
    references: FOLLOW_UP_RE.test(text) ? ["contextual"] : [],
    constraints: [],
    complexity,
    ambiguity: FOLLOW_UP_RE.test(text) && !hasHistory
      ? "HIGH"
      : topicOnly
        ? "MEDIUM"
        : /\b(no|do|cai nay|cai do|phan kia)\b/i.test(text)
          ? "HIGH"
          : "LOW",
    needsKnowledge,
    needsRetrieval,
    // Semantic memory is cheap and useful for factual/coding/planning follow-ups too,
    // not only when the user explicitly says "remember".
    needsMemory: memory || followUp || ["FACTUAL", "CODING", "PLANNING", "DOCUMENT", "RESEARCH", "MULTI_STEP"].includes(intent),
    needsTools: math,
    needsFreshInformation: fresh || research,
    topicOnly,
  };
}
