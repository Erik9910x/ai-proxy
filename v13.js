// ==UserScript==
// @name         AI Helper V13 (Stealth + MCQ + TF)
// @namespace    ai-helper
// @version      13.0
// @description  Stealth button + MCQ + True/False + auto detect
// @match        *://*/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SERVER = 'https://ai-proxy-inky.vercel.app/api/ask';

  let selectedText = '';
  let visible = true;
  let lastModel = '';

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

  // ================= BUTTON (stealth: trắng, nhỏ, blend vào nền) =================
  const btn = document.createElement('div');
  btn.textContent = '';
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
    try { selectedText = window.getSelection().toString().trim(); } catch {}
  }, { passive: true });

  // ================= DETECT QUESTION TYPE =================

  // Trắc nghiệm ABCD
  function isMCQ(text) {
    // Phải có ít nhất 2 option (ví dụ A và B) để tránh nhận nhầm chữ cái đơn lẻ trong văn bản
    return /A[\.\)]\s/i.test(text) && /B[\.\)]\s/i.test(text);
  }

  // Đếm số câu MCQ (nhận diện câu hỏi có số thứ tự hoặc blank)
  function countMCQ(text) {
    // Đếm các câu có A. B. C. D. (mỗi nhóm ABCD = 1 câu)
    var groups = text.split(/(?=A[\.\)]\s)/i);
    var count = 0;
    for (var i = 0; i < groups.length; i++) {
      if (/A[\.\)]\s.*B[\.\)]\s.*C[\.\)]\s/is.test(groups[i])) count++;
    }
    return Math.max(count, 1);
  }

  // Wordform (English)
  function isWordform(text) {
    // Nhận diện ngoặc đơn/vuông chứa từ in hoa hoặc "___"
    if (/\([\w\s]+\)|\[[\w\s]+\]/i.test(text) && (text.includes('___') || text.includes('...'))) return true;
    // Nhận diện từ khóa
    if (/(dạng đúng|chia động từ|word form|correct form|bracket)/i.test(text)) return true;
    return false;
  }

  // Đúng/Sai
  function isTrueFalse(text) {
    // Nếu là trắc nghiệm ABCD thì không phải Đúng/Sai
    if (isMCQ(text)) return false;

    // 1. Keyword rõ ràng
    if (/đúng\s*(hay|hoặc|\/)\s*sai|đúng.*sai|true.*false|T\s*\/\s*F|✓.*✗|☑|☐/i.test(text)) return true;
    
    // 2. Từ khóa bài tập K12 (kèm điều kiện không phải ABCD)
    if (/(xác|nhận|phát biểu|câu).*(đúng|sai)/i.test(text)) return true;
    
    // 3. Có nhiều dòng bắt đầu bằng dấu gạch, số hoặc chữ cái a-d
    var markers = text.match(/^\s*([\d]+[\.\.\)]\s|[a-d][\.\.\)]\s|-\s|\u2022\s|[\u2713\u2717]\s)/gmi);
    if (markers && markers.length >= 2) return true;

    // 4. Nếu có "Câu trả lời của bạn:" và các dòng văn bản dài (đặc trưng bài tập TF ở K12)
    if (text.includes('Câu trả lời của bạn:')) {
      var parts = text.split('Câu trả lời của bạn:');
      if (parts[1] && parts[1].trim().split('\n').filter(l => l.length > 15).length >= 2) return true;
    }

    return false;
  }

  function countStatements(text) {
    // Ưu tiên đếm theo marker (1. 2. 3. hoặc a. b. c.)
    var m = text.match(/^\s*([\d]+[\.\.\)]\s|[a-d][\.\.\)]\s|-\s|\u2022\s)/gmi);
    if (m && m.length >= 2) return m.length;

    // Nếu không có marker, đếm các dòng dài (thường là câu khẳng định) sau text dẫn
    var lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20);
    // Nếu bôi đen cả đoạn văn thì lấy các câu ở cuối
    if (lines.length > 4) return 4; // K12 thường là 4 câu đúng sai
    return Math.max(lines.length, 1);
  }

  // ================= CLEAN ANSWER =================
  function cleanMCQ(ans, count) {
    if (count <= 1) {
      // 1 câu: lấy chữ đầu tiên
      var m = ans.match(/\b([ABCD])\b/i);
      return m ? m[1].toUpperCase() : ans.trim().substring(0, 30);
    }
    // Nhiều câu: giữ nguyên, chỉ clean
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
    // 1. Ưu tiên Trắc nghiệm ABCD nếu bôi đen có A và B
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

    // 2. Wordform (Dùng Llama Scout)
    if (isWordform(text)) {
      return {
        type: 'mcq',
        count: 1,
        prompt: `Đây là bài tập Word Form hoặc chia động từ. Hãy đưa ra đáp án đúng nhất.\nKHÔNG giải thích.\n\n${text}`
      };
    }

    // 3. Sau đó mới check Đúng/Sai
    if (isTrueFalse(text)) {
      var n = countStatements(text);
      return {
        type: 'tf',
        count: n,
        prompt: `PHÂN TÍCH LOGIC CỰC KỲ CẨN THẬN. Đọc đoạn văn và xác định ${n} phát biểu là ĐÚNG hay SAI.
LƯU Ý: Cảnh giác với các bẫy trạng từ (chỉ, luôn luôn, duy nhất) và bẫy tráo đổi chủ ngữ.
Trả lời: Đ S Đ S
KHÔNG giải thích.\n\n${text}`
      };
    }

    // 4. Còn lại
    return {
      type: 'other',
      count: 0,
      prompt: text
    };
  }

  // ================= ASK =================
  function ask(text) {
    if (!text || text.length < 5) {
      show('⚠️ Chọn nội dung trước', 2000);
      return;
    }

    const { type, prompt, count } = buildPrompt(text);

    let label = '⏳';
    if (type === 'mcq') label = count > 1 ? `⏳ [${count} câu ABCD]` : '⏳ [ABCD]';
    else if (type === 'tf') label = `⏳ [${count} câu Đ/S]`;
    show(label + '...');

    fetch(SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, type: type })
    })
    .then(r => r.json())
    .then(d => {
      if (d.error) { show('❌ ' + d.error, 3000); return; }
      if (!d.answer) { show('❌ Không có kết quả', 3000); return; }

      let ans = d.answer;
      // Lọc phần suy nghĩ (Chain of Thought), chỉ lấy đáp án cuối
      if (ans.includes('===ANSWER===')) {
        ans = ans.split('===ANSWER===')[1].trim();
      }

      let icon = '🤖';

      if (type === 'mcq') {
        ans = cleanMCQ(ans, count);
        icon = '👉';
      } else if (type === 'tf') {
        ans = cleanTF(ans);
        icon = '📝';
      }

      // Hiện model
      const tag = d.model ? '\n[' + d.model + ']' : '';
      if (d.model && d.model !== lastModel) lastModel = d.model;

      show(icon + ' ' + ans + tag, 12000);
    })
    .catch(() => show('❌ Lỗi server', 3000));
  }

  // ================= TAP EVENTS =================
  let ltap = 0;

  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - ltap < 300) {
      // Double tap → toggle panel
      visible = !visible;
      panel.style.display = (visible && panel.textContent) ? 'block' : 'none';
      ltap = 0;
      return;
    }
    ltap = now;
    setTimeout(() => {
      if (ltap === 0) return;
      // Single tap → ask
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
  fetch(SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'test: 1+1' })
  })
  .then(r => r.json())
  .then(d => {
    if (d.model) {
      lastModel = d.model;
      show('✅ ' + d.model, 3000);
    } else if (d.error) {
      show('❌ ' + d.error, 3000);
    }
  })
  .catch(() => show('❌ Offline', 3000));

})();
