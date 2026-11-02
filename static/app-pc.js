// PC Display Application Logic
let ws = null;
let qrCodeInstance = null;
let countdownInterval = null;

// ── Live Clock ──────────────────────────────────────
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const el = document.getElementById('liveClock');
  if (el) el.textContent = `${hh}:${mm}:${ss}`;
}
updateClock();
setInterval(updateClock, 1000);

const qrSection = document.getElementById('qrSection');
const contentSection = document.getElementById('contentSection');
const displayImage = document.getElementById('displayImage');
const displayMessage = document.getElementById('displayMessage');
const displayIg = document.getElementById('displayIg');
const displayFb = document.getElementById('displayFb');
const mobileUrlText = document.getElementById('mobileUrlText');
const incomingToast = document.getElementById('incomingToast');
const toastMessage = document.getElementById('toastMessage');
const btnReset = document.getElementById('btnReset');
const btnFullscreen = document.getElementById('btnFullscreen');

// Overlay Badges
const displayAmountNum = document.getElementById('displayAmountNum');
const timerCountdown = document.getElementById('timerCountdown');

// Top 3 Podium Elements
const rank1Card = document.getElementById('rank1Card');
const rank1Img = document.getElementById('rank1Img');
const rank1Amount = document.getElementById('rank1Amount');
const rank1Social = document.getElementById('rank1Social');

const rank2Card = document.getElementById('rank2Card');
const rank2Img = document.getElementById('rank2Img');
const rank2Amount = document.getElementById('rank2Amount');
const rank2Social = document.getElementById('rank2Social');

const rank3Card = document.getElementById('rank3Card');
const rank3Img = document.getElementById('rank3Img');
const rank3Amount = document.getElementById('rank3Amount');
const rank3Social = document.getElementById('rank3Social');

// Web Audio API Synthesizer
function playArrivalChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + idx * 0.1;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.9);
    });
  } catch (e) {
    console.log("Audio play error:", e);
  }
}

// Particle Canvas Animation
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const particleCount = 45;
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.5 + 1,
      speedX: (Math.random() - 0.5) * 0.8,
      speedY: (Math.random() - 0.5) * 0.8,
      opacity: Math.random() * 0.5 + 0.2
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    for (let p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 242, 254, ${p.opacity})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00f2fe';
      ctx.fill();
    }
    requestAnimationFrame(render);
  }
  render();
}

// Generate QR Code for Mobile connection
function renderQRCode(url) {
  const container = document.getElementById('qrcode');
  container.innerHTML = '';
  qrCodeInstance = new QRCode(container, {
    text: url,
    width: 310,
    height: 310,
    colorDark: "#0b0e1b",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  mobileUrlText.textContent = url;
}

// Render Top 3 Ranking
function renderRankingPodium(ranking) {
  const cards = [
    { card: rank1Card, img: rank1Img, amount: rank1Amount, social: rank1Social },
    { card: rank2Card, img: rank2Img, amount: rank2Amount, social: rank2Social },
    { card: rank3Card, img: rank3Img, amount: rank3Amount, social: rank3Social }
  ];

  cards.forEach((slot, idx) => {
    const item = ranking && ranking[idx];
    if (item) {
      slot.card.classList.remove('empty');
      slot.img.src = item.image_url;
      slot.amount.textContent = `฿${Number(item.amount).toLocaleString()}`;
      const igText = item.ig ? (item.ig.startsWith('@') ? item.ig : `@${item.ig}`) : '';
      const fbText = item.facebook || '';
      slot.social.textContent = [igText, fbText].filter(Boolean).join(' | ') || 'VIP Spender';
    } else {
      slot.card.classList.add('empty');
      slot.img.src = '/static/placeholder_user.png';
      slot.amount.textContent = '฿0';
      slot.social.textContent = 'ยังไม่มีอันดับ';
    }
  });
}

// Start 5-Minute Countdown
function startCountdown(expiresAt) {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    const now = Date.now() / 1000;
    const remaining = Math.max(0, Math.floor(expiresAt - now));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerCountdown.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      showQRCodeView();
    }
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

// Update View to Uploaded Content
function showUploadedContent(data) {
  if (!data || !data.image_url) return;

  displayImage.src = data.image_url;
  displayMessage.textContent = data.message || "ไม่มีข้อความ";
  displayIg.textContent = data.ig ? (data.ig.startsWith('@') ? data.ig : `@${data.ig}`) : "-";
  displayFb.textContent = data.facebook || "-";
  displayAmountNum.textContent = `฿${Number(data.amount || 0).toLocaleString()} บาท`;

  if (data.expires_at) {
    startCountdown(data.expires_at);
  } else {
    startCountdown((Date.now() / 1000) + 300);
  }

  qrSection.classList.remove('active');
  setTimeout(() => {
    contentSection.classList.add('active');
  }, 200);

  playArrivalChime();
  showToast(`ยอดเงิน ฿${Number(data.amount || 0).toLocaleString()} ขึ้นจอเรียบร้อยแล้ว!`);
}

// Reset View back to QR Code
function showQRCodeView() {
  if (countdownInterval) clearInterval(countdownInterval);
  contentSection.classList.remove('active');
  setTimeout(() => {
    qrSection.classList.add('active');
  }, 200);
}

function showToast(msg) {
  if (msg) toastMessage.textContent = msg;
  incomingToast.classList.add('show');
  setTimeout(() => {
    incomingToast.classList.remove('show');
  }, 4000);
}

// Initialize Application
async function init() {
  initParticles();

  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    renderQRCode(info.mobile_url);

    if (info.top_ranking) {
      renderRankingPodium(info.top_ranking);
    }

    if (info.latest_data && info.latest_data.status === 'active') {
      showUploadedContent(info.latest_data);
    }
  } catch (err) {
    console.error("Failed to fetch info:", err);
    renderQRCode(window.location.origin + '/mobile');
  }

  setupWebSocket();
}

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected to PC display");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'NEW_SUBMISSION') {
        showUploadedContent(msg.data);
        if (msg.ranking) renderRankingPodium(msg.ranking);
      } else if (msg.type === 'RESET') {
        showQRCodeView();
        if (msg.ranking) renderRankingPodium(msg.ranking);
      } else if (msg.type === 'RANKING_UPDATE') {
        if (msg.ranking) renderRankingPodium(msg.ranking);
      } else if (msg.type === 'STATE_UPDATE') {
        if (msg.ranking) renderRankingPodium(msg.ranking);
        if (msg.data && msg.data.status === 'active') {
          showUploadedContent(msg.data);
        }
      }
    } catch (e) {
      console.error("Error parsing WS message:", e);
    }
  };

  ws.onclose = () => {
    setTimeout(setupWebSocket, 2000);
  };
}

// Button Events
btnReset.addEventListener('click', async () => {
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (err) {
    showQRCodeView();
  }
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

window.addEventListener('DOMContentLoaded', init);
