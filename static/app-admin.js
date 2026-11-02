let adminToken = localStorage.getItem('adminToken') || '';

const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginForm = document.getElementById('loginForm');
const adminPassword = document.getElementById('adminPassword');
const btnLogout = document.getElementById('btnLogout');

const configForm = document.getElementById('configForm');
const bankNameInput = document.getElementById('bankNameInput');
const accountNameInput = document.getElementById('accountNameInput');
const accountNumberInput = document.getElementById('accountNumberInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const bankQrInput = document.getElementById('bankQrInput');
const bankQrPreview = document.getElementById('bankQrPreview');

const rankingList = document.getElementById('rankingList');
const btnResetRanking = document.getElementById('btnResetRanking');
const submissionsTableBody = document.getElementById('submissionsTableBody');

const slipModal = document.getElementById('slipModal');
const slipModalImg = document.getElementById('slipModalImg');
const btnCloseSlipModal = document.getElementById('btnCloseSlipModal');

let selectedQrFile = null;

// Initialize
if (adminToken) {
  loadDashboard();
} else {
  showLogin();
}

function showLogin() {
  loginView.style.display = 'flex';
  dashboardView.style.display = 'none';
}

function showDashboard() {
  loginView.style.display = 'none';
  dashboardView.style.display = 'flex';
}

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append('password', adminPassword.value.trim());

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      adminToken = data.token;
      localStorage.setItem('adminToken', adminToken);
      loadDashboard();
    } else {
      alert("รหัสผ่านไม่ถูกต้อง");
    }
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  }
});

// Logout
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  adminToken = '';
  showLogin();
});

// QR Code Preview
bankQrInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedQrFile = file;
    bankQrPreview.src = URL.createObjectURL(file);
  }
});

// Load Dashboard Data
async function loadDashboard() {
  showDashboard();
  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.status === 401) {
      btnLogout.click();
      return;
    }
    const data = await res.json();
    renderConfig(data.config);
    renderRanking(data.ranking);
    renderSubmissions(data.submissions);
  } catch (err) {
    console.error("Failed to load admin data:", err);
  }
}

function renderConfig(config) {
  bankNameInput.value = config.bank_name || '';
  accountNameInput.value = config.account_name || '';
  accountNumberInput.value = config.account_number || '';
  if (config.bank_qr_url) {
    bankQrPreview.src = config.bank_qr_url;
  }
}

function renderRanking(ranking) {
  if (!ranking || ranking.length === 0) {
    rankingList.innerHTML = '<p style="color:#94a3b8; padding:12px; text-align:center;">ยังไม่มีข้อมูล Top 3 ในขณะนี้</p>';
    return;
  }

  const medals = ['👑 Top 1', '🥈 Top 2', '🥉 Top 3'];
  const classes = ['rank-gold', 'rank-silver', 'rank-bronze'];

  rankingList.innerHTML = ranking.map((item, idx) => `
    <div class="rank-item">
      <div class="rank-badge-icon ${classes[idx] || 'rank-bronze'}">
        ${medals[idx] || '#' + (idx + 1)}
      </div>
      <img src="${item.image_url}" class="rank-avatar" alt="Avatar">
      <div class="rank-details">
        <div class="rank-amount">฿${Number(item.amount).toLocaleString()} บาท</div>
        <div class="rank-social">IG: ${item.ig || '-'} | FB: ${item.facebook || '-'}</div>
      </div>
    </div>
  `).join('');
}

function renderSubmissions(submissions) {
  if (!submissions || submissions.length === 0) {
    submissionsTableBody.innerHTML = '<tr><td colspan="9" class="text-center" style="color:#94a3b8;">ยังไม่มีประวัติการส่งข้อมูล</td></tr>';
    return;
  }

  submissionsTableBody.innerHTML = submissions.map(item => {
    const ai = item.ai_report || {};
    const qrBadge = ai.qr_found ? 
      '<span style="color:#00ff88; font-size:0.75rem; background:rgba(0,255,136,0.15); padding:2px 8px; border-radius:10px;">✅ Mini-QR แท้</span>' : 
      '<span style="color:#fbc531; font-size:0.75rem; background:rgba(251,197,49,0.15); padding:2px 8px; border-radius:10px;">⚠️ สลิปภาพ</span>';
    
    const bankName = ai.bank_name || 'ธนาคารทั่วไป';

    return `
      <tr>
        <td style="font-size:0.8rem; color:#94a3b8;">${item.created_at || '-'}</td>
        <td>
          <div>${qrBadge}</div>
          <small style="color:#cbd5e1; font-size:0.75rem;">${bankName}</small>
        </td>
        <td style="color:#00ff88; font-weight:700; font-size:1.05rem;">
          ฿${Number(item.amount).toLocaleString()}
        </td>
        <td>
          <img src="${item.image_url}" class="table-img" onclick="viewImage('${item.image_url}')" title="คลิกดูภาพใหญ่">
        </td>
        <td>
          <button class="btn-view-slip" onclick="viewImage('${item.slip_url}')">ดูสลิป</button>
        </td>
        <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.message || '-'}</td>
        <td style="font-size:0.85rem;">${item.ig || '-'}</td>
        <td style="font-size:0.85rem;">${item.facebook || '-'}</td>
        <td>
          <button class="btn-edit-amount" onclick="promptAdjustAmount('${item.id}', ${item.amount})">✏️ แก้ไขยอด</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Adjust Amount Function
window.promptAdjustAmount = async function(submissionId, currentAmount) {
  const newAmountStr = prompt("ใส่ยอดเงินใหม่ (บาท) สำหรับรายการนี้:", currentAmount);
  if (newAmountStr === null) return;
  const newAmount = parseFloat(newAmountStr);
  if (isNaN(newAmount) || newAmount <= 0) {
    alert("กรุณาใส่ตัวเลขยอดเงินที่ถูกต้อง");
    return;
  }

  const formData = new FormData();
  formData.append('submission_id', submissionId);
  formData.append('amount', newAmount);

  try {
    const res = await fetch('/api/admin/adjust-submission', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: formData
    });
    if (res.ok) {
      alert("✅ อัปเดตยอดเงินและคำนวณ Top 3 ใหม่เรียบร้อยแล้ว");
      loadDashboard();
    } else {
      alert("เกิดข้อผิดพลาดในการอัปเดต");
    }
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  }
};

// Save Config Form
configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append('bank_name', bankNameInput.value.trim());
  formData.append('account_name', accountNameInput.value.trim());
  formData.append('account_number', accountNumberInput.value.trim());
  if (newPasswordInput.value.trim()) {
    formData.append('new_password', newPasswordInput.value.trim());
  }
  if (selectedQrFile) {
    formData.append('bank_qr', selectedQrFile);
  }

  try {
    const res = await fetch('/api/admin/update-config', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert("✅ บันทึกการตั้งค่าบัญชีเรียบร้อยแล้ว");
      newPasswordInput.value = '';
      selectedQrFile = null;
      loadDashboard();
    } else {
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  } catch (err) {
    alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
  }
});

// Reset Ranking
btnResetRanking.addEventListener('click', async () => {
  if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ต Top 3? (ข้อมูลจะเริ่มนับใหม่สำหรับรอบนี้)")) {
    return;
  }
  try {
    const res = await fetch('/api/admin/reset-ranking', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
      alert("✅ รีเซ็ต Top 3 เรียบร้อยแล้ว");
      loadDashboard();
    }
  } catch (err) {
    alert("เกิดข้อผิดพลาด");
  }
});

// Modal View
window.viewImage = function(url) {
  slipModalImg.src = url;
  slipModal.classList.add('active');
};

btnCloseSlipModal.addEventListener('click', () => {
  slipModal.classList.remove('active');
});

slipModal.addEventListener('click', (e) => {
  if (e.target === slipModal) {
    slipModal.classList.remove('active');
  }
});
