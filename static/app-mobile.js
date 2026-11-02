// Mobile App Logic (AI Slip Verified)
const form = document.getElementById('submissionForm');
const liveClock = document.getElementById('liveClock');

// Bank elements
const bankQrImg = document.getElementById('bankQrImg');
const bankNameText = document.getElementById('bankNameText');
const accNameText = document.getElementById('accNameText');
const accNumberText = document.getElementById('accNumberText');

// File inputs
const slipInput = document.getElementById('slipInput');
const slipPrompt = document.getElementById('slipPrompt');
const slipPreviewWrapper = document.getElementById('slipPreviewWrapper');
const slipPreview = document.getElementById('slipPreview');
const btnRemoveSlip = document.getElementById('btnRemoveSlip');
const slipWarning = document.getElementById('slipWarning');

const messageInput = document.getElementById('messageInput');
const wordCounter = document.getElementById('wordCounter');
const wordWarning = document.getElementById('wordWarning');

const imageInput = document.getElementById('imageInput');
const uploadPrompt = document.getElementById('uploadPrompt');
const previewWrapper = document.getElementById('previewWrapper');
const imagePreview = document.getElementById('imagePreview');
const btnRemoveImage = document.getElementById('btnRemoveImage');
const imageWarning = document.getElementById('imageWarning');

const igInput = document.getElementById('igInput');
const fbInput = document.getElementById('fbInput');

const btnSubmit = document.getElementById('btnSubmit');
const btnText = btnSubmit.querySelector('.btn-text');
const btnSpinner = btnSubmit.querySelector('.btn-spinner');

const successModal = document.getElementById('successModal');
const btnCloseModal = document.getElementById('btnCloseModal');

let selectedImageFile = null;
let selectedSlipFile = null;

// Real-time Live Clock
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  liveClock.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// Load Bank Config & QR
async function loadBankConfig() {
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    if (info.bank_config) {
      if (info.bank_config.bank_qr_url) {
        bankQrImg.src = info.bank_config.bank_qr_url;
      }
      bankNameText.textContent = info.bank_config.bank_name || 'พร้อมเพย์';
      accNameText.textContent = `ชื่อบัญชี: ${info.bank_config.account_name || '-'}`;
      accNumberText.textContent = `เลขบัญชี: ${info.bank_config.account_number || '-'}`;
    }
  } catch (e) {
    console.error("Failed to load bank config:", e);
  }
}
loadBankConfig();

// Word Counter
function countWords(str) {
  if (!str) return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    let count = 0;
    for (const segment of segmenter.segment(trimmed)) {
      if (segment.isWordLike) count++;
    }
    return count;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

messageInput.addEventListener('input', () => {
  const words = countWords(messageInput.value);
  wordCounter.textContent = `${words} / 30 คำ`;
  if (words > 30) {
    wordCounter.classList.add('warning');
    wordWarning.style.display = 'block';
  } else {
    wordCounter.classList.remove('warning');
    wordWarning.style.display = 'none';
  }
});

// Slip File Handling
slipInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  selectedSlipFile = file;
  slipWarning.style.display = 'none';

  if (window.URL && window.URL.createObjectURL) {
    slipPreview.src = window.URL.createObjectURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = (ev) => { slipPreview.src = ev.target.result; };
    reader.readAsDataURL(file);
  }
  slipPrompt.style.display = 'none';
  slipPreviewWrapper.style.display = 'block';
});

btnRemoveSlip.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  selectedSlipFile = null;
  slipInput.value = '';
  slipPreview.src = '';
  slipPreviewWrapper.style.display = 'none';
  slipPrompt.style.display = 'flex';
});

// User Profile Image Handling
imageInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  selectedImageFile = file;
  imageWarning.style.display = 'none';

  if (window.URL && window.URL.createObjectURL) {
    imagePreview.src = window.URL.createObjectURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = (ev) => { imagePreview.src = ev.target.result; };
    reader.readAsDataURL(file);
  }
  uploadPrompt.style.display = 'none';
  previewWrapper.style.display = 'block';
});

btnRemoveImage.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  selectedImageFile = null;
  imageInput.value = '';
  imagePreview.src = '';
  previewWrapper.style.display = 'none';
  uploadPrompt.style.display = 'flex';
});

// Image Compressor
async function compressImage(file, maxWidth = 1920, quality = 0.85) {
  if (file.size && file.size < 1024 * 1024) return file;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => { resolve(file); }, 3000);
    const img = new Image();
    const objectUrl = window.URL ? window.URL.createObjectURL(file) : null;

    img.onload = () => {
      clearTimeout(timeout);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (objectUrl) window.URL.revokeObjectURL(objectUrl);
          if (blob) {
            resolve(new File([blob], file.name ? file.name.replace(/\.[^/.]+$/, ".jpg") : "upload.jpg", { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
      } catch (err) {
        if (objectUrl) window.URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => { img.src = ev.target.result; };
      reader.onerror = () => { resolve(file); };
      reader.readAsDataURL(file);
    }
  });
}

// Form Submission (AI-Checked)
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedSlipFile) {
    slipWarning.style.display = 'block';
    slipUploadZone.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const words = countWords(messageInput.value);
  if (words > 30) {
    wordWarning.style.display = 'block';
    messageInput.focus();
    return;
  }

  if (!selectedImageFile) {
    imageWarning.style.display = 'block';
    imageInput.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // Loading state
  btnSubmit.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'block';

  try {
    const [compressedUserImg, compressedSlip] = await Promise.all([
      compressImage(selectedImageFile),
      compressImage(selectedSlipFile, 1400, 0.8)
    ]);

    const formData = new FormData();
    formData.append('slip', compressedSlip);
    formData.append('message', messageInput.value.trim());
    formData.append('ig', igInput.value.trim());
    formData.append('facebook', fbInput.value.trim());
    formData.append('image', compressedUserImg);

    const res = await fetch('/api/submit', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (res.ok && result.success) {
      showSuccessModal();
    } else {
      alert("❌ " + (result.message || "ไม่สามารถยืนยันสลิปโอนเงินได้ กรุณาลองใหม่อีกครั้ง"));
    }
  } catch (err) {
    console.error("Submission error:", err);
    alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ โปรดตรวจสอบการเชื่อมต่อ Wi-Fi");
  } finally {
    btnSubmit.disabled = false;
    btnText.style.display = 'block';
    btnSpinner.style.display = 'none';
  }
});

function showSuccessModal() {
  successModal.classList.add('active');
}

btnCloseModal.addEventListener('click', () => {
  successModal.classList.remove('active');
  btnRemoveSlip.click();
  messageInput.value = '';
  wordCounter.textContent = '0 / 30 คำ';
  igInput.value = '';
  fbInput.value = '';
  btnRemoveImage.click();
});
