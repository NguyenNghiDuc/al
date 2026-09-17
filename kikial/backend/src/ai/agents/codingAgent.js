export function codingAgent({ code = "", language = "text", question = "" }) {
  const issues = [];
  if (String(code).length > 50000) issues.push("source quá lớn");
  if (/child_process|exec\(|spawn\(|eval\(/.test(code)) issues.push("phát hiện API thực thi động; chỉ phân tích, không chạy");
  return { agent: "coding", language, question, issues, execution: "disabled", suggestion: "Gửi đoạn code và lỗi cụ thể để phân tích cú pháp/logic; Kikial không tự chạy shell tùy ý." };
}
