function formatNumber(number) {
  if (!Number.isFinite(number)) {
    return String(number);
  }

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 10,
  }).format(number);
}

// Chuyển:
// 5 triệu   -> 5000000
// 2.5 triệu -> 2500000
// 500 nghìn -> 500000
// 20k       -> 20000
function parseVietnameseNumber(text) {
  if (!text) return null;

  let value = String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  const match = value.match(
    /(-?\d+(?:[.,]\d+)?)\s*(triệu|trieu|nghìn|nghin|ngàn|ngan|k)?/i,
  );

  if (!match) return null;

  let numberText = match[1];
  const unit = match[2]?.toLowerCase();

  // Với "1.5 triệu" hoặc "1,5 triệu"
  if (unit) {
    numberText = numberText.replace(",", ".");

    const number = Number(numberText);

    if (!Number.isFinite(number)) return null;

    if (unit === "triệu" || unit === "trieu") {
      return number * 1_000_000;
    }

    if (
      unit === "nghìn" ||
      unit === "nghin" ||
      unit === "ngàn" ||
      unit === "ngan" ||
      unit === "k"
    ) {
      return number * 1_000;
    }
  }

  // Số bình thường.
  // 1.250.000 -> 1250000
  // 1,250,000 -> 1250000
  if (
    /^\d{1,3}([.,]\d{3})+$/.test(numberText)
  ) {
    numberText = numberText.replace(/[.,]/g, "");
  } else {
    numberText = numberText.replace(",", ".");
  }

  const number = Number(numberText);

  return Number.isFinite(number)
    ? number
    : null;
}

function expandVietnameseUnits(text) {
  return String(text).replace(
    /(-?\d+(?:[.,]\d+)?)\s*(triệu|trieu|nghìn|nghin|ngàn|ngan|tỷ|ty|k)(?![\p{L}\p{N}])/giu,
    (full, numberText, unit) => {
      const number = Number(String(numberText).replace(",", "."));
      if (!Number.isFinite(number)) return full;

      const key = unit.toLowerCase();
      if (key === "tỷ" || key === "ty") return String(number * 1_000_000_000);
      if (key === "triệu" || key === "trieu") return String(number * 1_000_000);
      return String(number * 1_000);
    },
  );
}

function normalizeExpression(expression) {
  return expression
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/[×x]/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/\^/g, "**")
    .replace(/\s+/g, "");
}

// Tính biểu thức nhưng không dùng eval().
function evaluateExpression(expression) {
  const normalized = normalizeExpression(expression);

  // Chỉ cho số và toán tử an toàn.
  if (
    !/^[0-9+\-*/().%\s*]+$/.test(normalized)
  ) {
    return null;
  }

  const tokens =
    normalized.match(
      /\d+(?:\.\d+)?|\*\*|[()+\-*/%]/g,
    ) || [];

  if (tokens.join("") !== normalized) {
    return null;
  }

  let position = 0;

  function peek() {
    return tokens[position];
  }

  function consume() {
    return tokens[position++];
  }

  function parsePrimary() {
    const token = peek();

    if (token === "(") {
      consume();

      const value = parseAddSubtract();

      if (consume() !== ")") {
        throw new Error("Thiếu dấu đóng ngoặc.");
      }

      return value;
    }

    const number = Number(consume());

    if (!Number.isFinite(number)) {
      throw new Error("Số không hợp lệ.");
    }

    return number;
  }

  function parseUnary() {
    if (peek() === "+") {
      consume();
      return parseUnary();
    }

    if (peek() === "-") {
      consume();
      return -parseUnary();
    }

    return parsePrimary();
  }

  function parsePower() {
    let left = parseUnary();

    if (peek() === "**") {
      consume();

      const right = parsePower();

      left = left ** right;
    }

    return left;
  }

  function parseMultiplyDivide() {
    let left = parsePower();

    while (
      peek() === "*" ||
      peek() === "/" ||
      peek() === "%"
    ) {
      const operator = consume();
      const right = parsePower();

      if (operator === "*") {
        left *= right;
      }

      if (operator === "/") {
        if (right === 0) {
          throw new Error(
            "Không thể chia cho 0.",
          );
        }

        left /= right;
      }

      if (operator === "%") {
        if (right === 0) {
          throw new Error(
            "Không thể chia dư cho 0.",
          );
        }

        left %= right;
      }
    }

    return left;
  }

  function parseAddSubtract() {
    let left = parseMultiplyDivide();

    while (
      peek() === "+" ||
      peek() === "-"
    ) {
      const operator = consume();
      const right = parseMultiplyDivide();

      if (operator === "+") {
        left += right;
      } else {
        left -= right;
      }
    }

    return left;
  }

  try {
    const result = parseAddSubtract();

    if (position !== tokens.length) {
      return null;
    }

    if (!Number.isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function calculate(message) {
  if (!message) return null;

  const original = String(message).trim();

  const text = original
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // =========================
  // CĂN BẬC HAI
  // =========================

  let match = text.match(
    /(?:căn bậc hai|căn|sqrt)\s*(?:của)?\s*(-?\d+(?:[.,]\d+)?)/i,
  );

  if (match) {
    const number = Number(
      match[1].replace(",", "."),
    );

    if (number < 0) {
      return {
        type: "calculator",
        result: null,
        answer:
          "Không thể tính căn bậc hai thực của số âm.",
      };
    }

    const result = Math.sqrt(number);

    return {
      type: "calculator",
      result,
      answer: `√${formatNumber(number)} = ${formatNumber(result)}`,
    };
  }

  // =========================
  // X% CỦA Y
  // =========================

  match = text.match(
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:của|cua)\s*(.+)/i,
  );

  if (match) {
    const percent = Number(
      match[1].replace(",", "."),
    );

    const number =
      parseVietnameseNumber(match[2]);

    if (number !== null) {
      const result =
        (percent / 100) * number;

      return {
        type: "calculator",
        result,
        answer:
          `${formatNumber(percent)}% của ` +
          `${formatNumber(number)} = ` +
          `${formatNumber(result)}`,
      };
    }
  }

  // =========================
  // GIẢM X%
  // =========================

  match = text.match(
    /(.+?)\s+(?:giảm|giam)\s+(\d+(?:[.,]\d+)?)\s*%/i,
  );

  if (match) {
    const number =
      parseVietnameseNumber(match[1]);

    const percent = Number(
      match[2].replace(",", "."),
    );

    if (number !== null) {
      const discount =
        (number * percent) / 100;

      const result =
        number - discount;

      return {
        type: "calculator",
        result,
        answer:
          `${formatNumber(number)} giảm ` +
          `${formatNumber(percent)}% = ` +
          `${formatNumber(result)}\n` +
          `Số tiền giảm: ${formatNumber(discount)}`,
      };
    }
  }

  // =========================
  // TĂNG X%
  // =========================

  match = text.match(
    /(.+?)\s+(?:tăng|tang)\s+(\d+(?:[.,]\d+)?)\s*%/i,
  );

  if (match) {
    const number =
      parseVietnameseNumber(match[1]);

    const percent = Number(
      match[2].replace(",", "."),
    );

    if (number !== null) {
      const increase =
        (number * percent) / 100;

      const result =
        number + increase;

      return {
        type: "calculator",
        result,
        answer:
          `${formatNumber(number)} tăng ` +
          `${formatNumber(percent)}% = ` +
          `${formatNumber(result)}\n` +
          `Số tăng thêm: ${formatNumber(increase)}`,
      };
    }
  }

  // =========================
  // A MŨ B
  // =========================

  match = text.match(
    /(-?\d+(?:[.,]\d+)?)\s*(?:mũ|mu|\^)\s*(-?\d+(?:[.,]\d+)?)/i,
  );

  if (match) {
    const a = Number(
      match[1].replace(",", "."),
    );

    const b = Number(
      match[2].replace(",", "."),
    );

    const result = a ** b;

    if (!Number.isFinite(result)) {
      return null;
    }

    return {
      type: "calculator",
      result,
      answer:
        `${formatNumber(a)}^${formatNumber(b)} = ` +
        `${formatNumber(result)}`,
    };
  }

  // =========================
  // PHÉP TÍNH THÔNG THƯỜNG
  // =========================

  let expression = text
    .replace(/^(?:hãy tính giúp tôi|hay tinh giup toi|giúp tôi|giup toi|hãy tính|hay tinh|tính giúp tôi|tinh giup toi)\s*/i, "")
    .replace(/bằng bao nhiêu\??/gi, "")
    .replace(/bằng\??/gi, "")
    .replace(/tính/gi, "")
    .replace(/bao nhiêu\??/gi, "")
    .replace(/\?/g, "")
    .replace(/[.!]+$/g, "")
    .trim();

  // Chỉ coi là calculator nếu có toán tử.
  if (
    /[+\-*/×÷:^%]/.test(expression)
  ) {
    const expanded = expandVietnameseUnits(expression);
    const result =
      evaluateExpression(expanded);

    if (result !== null) {
      return {
        type: "calculator",
        result,
        answer:
          `${expression} = ` +
          `${formatNumber(result)}`,
      };
    }
  }

  // Không phải câu hỏi tính toán.
  return null;
}

export {
  calculate,
  evaluateExpression,
};