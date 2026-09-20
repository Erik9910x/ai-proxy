// ==UserScript==
// @name         AI Helper V14 (Direct GROQ + MCQ + TF + WordForm)
// @namespace    ai-helper
// @version      14.0
// @description  Stealth button + MCQ + True/False + auto detect - GROQ direct
// @match        *://*/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // GROQ API config — via Vercel proxy (keys stored server-side)
  const GROQ_ENDPOINT = 'https://aiproxymax.vercel.app/api/ask';

  // Model priority
  const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

  // System prompt from output-rule.md
  const SYSTEM_PROMPT = `ROLE: You are a highly accurate educational question-solving assistant.

CORE BEHAVIOR:
- Read and understand the ENTIRE input before answering.
- Identify the question type automatically.
- Think and solve internally.
- DO NOT output reasoning.
- DO NOT output chain-of-thought.
- DO NOT output analysis.
- DO NOT describe your solving process.
- Output ONLY the final answer required by the question.
- Accuracy is more important than speed.
- Never guess when the information is genuinely insufficient.
- If the question is unreadable or fundamentally ambiguous, output exactly: UNCERTAIN

OUTPUT RULES:
- Never repeat the question.
- Never write an introduction.
- Never write a conclusion.
- Never write "The answer is..."
- Never write "Answer:"
- Never write "Đáp án:"
- Never write explanations unless explicitly requested.
- Never output emojis.
- Never use markdown.
- Never use bullet points.
- Never use quotation marks around the answer.
- Never append commentary after the final answer.
- Never append confidence statements.
- Never append extra whitespace.
- Preserve the original order of answers.

MCQ FORMAT: Return ONLY the option letter (A/B/C/D). Multiple: letters separated by space.
TRUE/FALSE FORMAT: Use ONLY: Đ = ĐÚNG, S = SAI. Multiple: separated by space.
WORD FORM FORMAT: Return ONLY the completed word. No punctuation, no explanation.
VERB FORM FORMAT: Return ONLY the required verb form.

FINAL COMMAND: THINK INTERNALLY. SOLVE CAREFULLY. OUTPUT ONLY THE FINAL ANSWER. NO REASONING. NO EXPLANATION. NO EXTRA TEXT.`;

  let selectedText = '';
  let visible = true;
  let lastModel = '';

  // ================= API CALL =================
  async function groqCall(promptText) {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: SYSTEM_PROMPT + '\n\n' + promptText,
        model: 'openai/gpt-oss-120b',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    let content = data.answer || '';
    if (content.includes('===ANSWER===')) {
      content = content.split('===ANSWER===')[1].trim();
    }
    return { content: content, model: data.model || MODELS[0] };
  }

  // ================= ROOT =================
  const host = document.createElement('div');
  host.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  // ================= PANEL =================
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed;
    bottom: 70px;
    right: 12px;
    width: 240px;
    max-height: 220px;
    background: rgba(255,255,255,0.95);
    color: #222;
    font: 13px/1.4 system-ui,-apple-system,sans-serif;
    border-radius: 12px;
    padding: 10px 12px;
    overflow-y: auto;
    display: none;
    pointer-events: none;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    word-break: break-word;
    white-space: pre-wrap;
    -webkit-overflow-scrolling: touch;
  `;
  shadow.appendChild(panel);

  // ================= BUTTON (stealth) =================
  const btn = document.createElement('div');
  btn.style.cssText = `
    position: fixed;
    bottom: 18px;
    right: 18px;
    width: 60px;
    height: 60px;
    background: rgba(255,255,255,0.6);
    color: rgba(0,0,0,0.35);
    font: 700 18px system-ui;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    border: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: opacity 0.2s;
  `;
  shadow.appendChild(btn);

  // ================= UI =================
  function show(text, timeout) {
    panel.textContent = text;
    panel.style.display = visible ? 'block' : 'none';
    if (timeout) {
      setTimeout(() => {
        if (panel.textContent === text) panel.style.display = 'none';
      }, timeout);
    }
  }

  // ================= SELECTION =================
  document.addEventListener('selectionchange', () => {
    try { selectedText = window.getSelection().toString().trim(); } catch (e) {}
  }, { passive: true });

  // ================= DETECT QUESTION TYPE =================
  function isMCQ(text) {
    return /A[\.\)]\s/i.test(text) && /B[\.\)]\s/i.test(text);
  }

  function countMCQ(text) {
    var groups = text.split(/(?=A[\.\)]\s)/i);
    var count = 0;
    for (var i = 0; i < groups.length; i++) {
      if (/A[\.\)]\s.*B[\.\)]\s.*C[\.\)]\s/is.test(groups[i])) count++;
    }
    return Math.max(count, 1);
  }

  function isWordform(text) {
    if (/([\(\[][\w\s]+[\[\)\]])/i.test(text) && (text.includes('___') || text.includes('...'))) return true;
    if (/(dạng đúng|chia động từ|word form|correct form|bracket)/i.test(text)) return true;
    return false;
  }

  function isTrueFalse(text) {
    if (isMCQ(text)) return false;
    if (/đúng\s*(hay|hoặc|\/)\s*sai|đúng.*sai|true.*false|T\s*\/\s*F|✓.*✗|☑|☐/i.test(text)) return true;
    if (/(xác|nhận|phát biểu|câu).*(đúng|sai)/i.test(text)) return true;
    var markers = text.match(/^\s*([\d]+[\.\.\)]\s|[a-d][\.\.\)]\s|-\s|•\s|[✓✗]\s)/gmi);
    if (markers && markers.length >= 2) return true;
    if (text.includes('Câu trả lời của bạn:')) {
      var parts = text.split('Câu trả lời của bạn:');
      if (parts[1] && parts[1].trim().split('\n').filter(l => l.length > 15).length >= 2) return true;
    }
    return false;
  }

  function countStatements(text) {
    var m = text.match(/^\s*([\d]+[\.\.\)]\s|[a-d][\.\.\)]\s|-\s|•\s)/gmi);
    if (m && m.length >= 2) return m.length;
    var lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20);
    if (lines.length > 4) return 4;
    return Math.max(lines.length, 1);
  }

  // ================= CLEAN ANSWER =================
  function cleanMCQ(ans, count) {
    if (count <= 1) {
      var m = ans.match(/\b([ABCD])\b/i);
      return m ? m[1].toUpperCase() : ans.trim().substring(0, 30);
    }
    return ans.trim().substring(0, 100);
  }

  function cleanTF(ans) {
    var clean = ans.trim();
    clean = clean.replace(/\bđúng\b/gi, 'Đ').replace(/\bsai\b/gi, 'S');
    clean = clean.replace(/\btrue\b/gi, 'Đ').replace(/\bfalse\b/gi, 'S');
    clean = clean.replace(/\bcorrect\b/gi, 'Đ').replace(/\bincorrect\b|\bwrong\b/gi, 'S');
    return clean;
  }

  // ================= BUILD PROMPT =================
  function buildPrompt(text) {
    if (isMCQ(text)) {
      var mcqCount = countMCQ(text);
      if (mcqCount > 1) {
        return {
          type: 'mcq',
          count: mcqCount,
          prompt: `Có ${mcqCount} câu trắc nghiệm. Với MỖI câu, chọn 1 đáp án A/B/C/D.\nVí dụ: B D D B\n\n${text}`
        };
      }
      return {
        type: 'mcq',
        count: 1,
        prompt: `LUẬT: Chỉ trả lời 1 ký tự A/B/C/D. KHÔNG giải thích.\n\n${text}`
      };
    }

    if (isWordform(text)) {
      return {
        type: 'mcq',
        count: 1,
        prompt: `Đây là bài tập Word Form hoặc chia động từ. Hãy đưa ra đáp án đúng nhất.\nKHÔNG giải thích.\n\n${text}`
      };
    }

    if (isTrueFalse(text)) {
      var n = countStatements(text);
      return {
        type: 'tf',
        count: n,
        prompt: `PHÂN TÍCH LOGIC CỰC KỲ CẨN THẬN. Đọc đoạn văn và xác định ${n} phát biễu là ĐÚNG hay SAI.\nLƯU Ý: Cảnh giác với các bẫy trạng từ (chỉ, luôn luôn, duy nhất) và bẫy tráo đổi chủ ngữ.\nTrả lời: Đ S Đ S\nKHÔNG giải thích.\n\n${text}`
      };
    }

    return {
      type: 'other',
      count: 0,
      prompt: text
    };
  }

  // ================= ASK =================
  async function ask(text) {
    if (!text || text.length < 5) {
      show('⚠️ Chọn nội dung trước', 2000);
      return;
    }

    const { type, prompt: promptText, count } = buildPrompt(text);

    let label = '⏳';
    if (type === 'mcq') label = count > 1 ? `⏳ [${count} câu ABCD]` : '⏳ [ABCD]';
    else if (type === 'tf') label = `⏳ [${count} câu Đ/S]`;
    show(label + '...');

    try {
      const d = await groqCall(promptText);
      let ans = d.content;
      let icon = '';

      if (type === 'mcq') {
        ans = cleanMCQ(ans, count);
        icon = '👉';
      } else if (type === 'tf') {
        ans = cleanTF(ans);
        icon = '📝';
      }

      const tag = d.model ? '\n[' + d.model + ']' : '';
      if (d.model && d.model !== lastModel) lastModel = d.model;

      show(icon + ' ' + ans + tag, 12000);
    } catch (e) {
      show('❌ Lỗi: ' + (e.message || 'Unknown error'), 3000);
    }
  }

  // ================= TAP EVENTS =================
  let ltap = 0;

  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - ltap < 300) {
      visible = !visible;
      panel.style.display = (visible && panel.textContent) ? 'block' : 'none';
      ltap = 0;
      return;
    }
    ltap = now;
    setTimeout(() => {
      if (ltap === 0) return;
      if (selectedText && selectedText.length >= 5) ask(selectedText);
      else show('👆 Bôi đen câu hỏi', 2000);
    }, 310);
  }, { passive: false });

  // Desktop
  btn.addEventListener('click', () => {
    if ('ontouchend' in window) return;
    if (selectedText && selectedText.length >= 5) ask(selectedText);
    else show('👆 Bôi đen câu hỏi', 2000);
  });
  btn.addEventListener('dblclick', () => {
    if ('ontouchend' in window) return;
    visible = !visible;
    panel.style.display = (visible && panel.textContent) ? 'block' : 'none';
  });

  // ================= INIT: check model =================
  (async function init() {
    try {
      const d = await groqCall('test: 1+1');
      lastModel = d.model || MODELS[0];
      show('✅ ' + lastModel, 3000);
    } catch (e) {
      show('❌ ' + (e.message || 'Offline'), 3000);
    }
  })();

})();
