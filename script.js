// Header scroll style
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');
navToggle.addEventListener('click', () => {
  nav.classList.toggle('open');
});
nav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => nav.classList.remove('open'));
});

// Contact form -> mailto
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('cfName').value.trim();
    const email = document.getElementById('cfEmail').value.trim();
    const service = document.getElementById('cfService').value;
    const message = document.getElementById('cfMessage').value.trim();

    const subject = `【HIRAMEKIへのお問い合わせ】${service}`;
    const body =
      `お名前: ${name}\n` +
      `メールアドレス: ${email}\n` +
      `ご相談内容: ${service}\n` +
      `\nメッセージ:\n${message}`;

    const mailto =
      'mailto:h.morino93@gmail.com' +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  });
}

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

// ---- Script Studio mini demo (簡易版: 日本語のみ、script-studio/src/lib の値を移植) ----
const JA_PACK = {
  rate: 6.2,          // かな1文字がほぼ1モーラ、約6.2文字/秒
  actionRate: 9.0,
  commaPause: 0.15,
  periodPause: 0.35,
  commaChars: '、,',
  periodChars: '。.!?！？',
  dialogueWidth: 20,
  actionWidth: 40,
  linesPerPage: 40,
};
const SCENE_KEYWORDS = ['INT.', 'EXT.', '○', '◯', '柱'];

function countUnitsJA(text) {
  const stripped = text.replace(/[(（][^)）]*[)）]/g, ' ');
  const chars = stripped.replace(/\s/g, '').replace(/[、。．，,.!?！？「」『』…—・:：;；]/g, '');
  return [...chars].length;
}

function pauseSecondsJA(text) {
  let total = 0;
  for (const ch of text) {
    if (JA_PACK.commaChars.includes(ch)) total += JA_PACK.commaPause;
    else if (JA_PACK.periodChars.includes(ch)) total += JA_PACK.periodPause;
  }
  return total;
}

function isSceneHeading(line) {
  const t = line.trim().toLocaleUpperCase();
  return SCENE_KEYWORDS.some((k) => t.startsWith(k.toLocaleUpperCase()));
}

function parseMiniScript(text) {
  const blocks = [];
  let current = [];
  text.split(/\r?\n/).forEach((line) => {
    if (line.trim() === '') {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  });
  if (current.length) blocks.push(current);

  const elements = [];
  let sceneCount = 0;
  const castSet = new Set();

  blocks.forEach((block) => {
    const head = block[0].trim();

    if (block.length === 1 && isSceneHeading(head)) {
      elements.push({ type: 'scene_heading' });
      sceneCount++;
      return;
    }

    const m = head.match(/^([^\s：:]{1,20})[：:]\s*(.*)$/);
    if (m) {
      const name = m[1].trim();
      castSet.add(name);
      elements.push({ type: 'character' });
      if (m[2].trim()) elements.push({ type: 'dialogue', text: m[2].trim() });
      block.slice(1).forEach((l) => {
        if (l.trim()) elements.push({ type: 'dialogue', text: l.trim() });
      });
      return;
    }

    elements.push({ type: 'action', text: block.join('\n') });
  });

  return { elements, sceneCount, castCount: castSet.size };
}

// 2026-07時点の公開価格（script-studio/src/lib/pricing.ts の DEFAULT_COST_OPTIONS と同じ値）
const COST_PACK = {
  stillUsd: 0.067,     // gemini-3.1-flash-image-1k（標準）
  ttsUsdPerMinute: 0.015,
  retryFactor: 1.5,    // 生成の失敗・リテイクを見込んだ倍率
  usdToJpy: 155,
  maxShotSeconds: 6,   // 1ショットの最長秒（これを超えるト書きは分割）
};

function estimateMiniTiming(elements) {
  let totalSeconds = 0;
  let dialogueSeconds = 0;
  let dialogueLines = 0;
  let pageLines = 0;
  let stillShotCount = 0;

  elements.forEach((el) => {
    if (el.type === 'dialogue') {
      dialogueLines++;
      const units = countUnitsJA(el.text);
      const sec = units / JA_PACK.rate + pauseSecondsJA(el.text);
      totalSeconds += sec;
      dialogueSeconds += sec;
      pageLines += Math.max(1, Math.ceil(units / JA_PACK.dialogueWidth)) + 1;
      stillShotCount += 1; // セリフ1行 ≒ ショット1つ（buildShotPlanのベースライン挙動）
    } else if (el.type === 'action') {
      const units = countUnitsJA(el.text);
      const sec = Math.max(1.2, units / JA_PACK.actionRate);
      totalSeconds += sec;
      pageLines += Math.max(1, Math.ceil(units / JA_PACK.actionWidth)) + 1;
      // 長いト書きは複数ショットに分割される（最長6秒/ショット）
      stillShotCount += Math.max(1, Math.ceil(sec / COST_PACK.maxShotSeconds));
    } else if (el.type === 'scene_heading') {
      pageLines += 2;
    } else if (el.type === 'character') {
      pageLines += 1;
    }
  });

  const pageCount = pageLines / JA_PACK.linesPerPage;
  return { totalSeconds, dialogueSeconds, pageSeconds: pageCount * 60, dialogueLines, stillShotCount };
}

function estimateMiniCost({ dialogueSeconds, stillShotCount }) {
  const stillCountWithRetry = Math.ceil(stillShotCount * COST_PACK.retryFactor);
  const imageCostUsd = stillCountWithRetry * COST_PACK.stillUsd;
  const audioCostUsd = (dialogueSeconds / 60) * COST_PACK.ttsUsdPerMinute;
  const totalUsd = imageCostUsd + audioCostUsd;
  return { totalUsd, totalJpy: totalUsd * COST_PACK.usdToJpy };
}

function formatSecondsMini(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

function formatJpyMini(jpy) {
  return `約${Math.round(jpy).toLocaleString('ja-JP')}円`;
}

const demoRunBtn = document.getElementById('demoRun');
if (demoRunBtn) {
  const demoScript = document.getElementById('demoScript');
  const demoReset = document.getElementById('demoReset');
  const demoResult = document.getElementById('demoResult');
  const SAMPLE_SCRIPT = demoScript.value;

  const runDemo = () => {
    const text = demoScript.value.trim();
    if (!text) return;
    const { elements, sceneCount, castCount } = parseMiniScript(text);
    const timing = estimateMiniTiming(elements);
    const cost = estimateMiniCost(timing);

    document.getElementById('statScenes').textContent = String(sceneCount);
    document.getElementById('statLines').textContent = String(timing.dialogueLines);
    document.getElementById('statCast').textContent = String(castCount);
    document.getElementById('statSpeech').textContent = formatSecondsMini(timing.totalSeconds);
    document.getElementById('statPage').textContent = formatSecondsMini(timing.pageSeconds);
    document.getElementById('statShots').textContent = String(timing.stillShotCount);
    document.getElementById('statCost').textContent = formatJpyMini(cost.totalJpy);
    demoResult.hidden = false;
  };

  demoRunBtn.addEventListener('click', runDemo);
  demoReset.addEventListener('click', () => {
    demoScript.value = SAMPLE_SCRIPT;
    demoResult.hidden = true;
  });
}
