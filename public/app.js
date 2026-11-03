// Cebu Marathon 2027 Tacloban Leg - Client App

document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  setupForm();
});

// ── Live Countdown Timer to Next Leg (Nov 15, 2026) ──
function initCountdown() {
  const targetDate = new Date('2026-11-15T04:30:00+08:00').getTime();

  function update() {
    const now = new Date().getTime();
    let distance = targetDate - now;

    if (distance < 0) {
      // If past date, set countdown to 0
      distance = 0;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');

    if (dEl) dEl.innerText = String(days).padStart(2, '0');
    if (hEl) hEl.innerText = String(hours).padStart(2, '0');
    if (mEl) mEl.innerText = String(minutes).padStart(2, '0');
    if (sEl) sEl.innerText = String(seconds).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// ── Category selection helpers ──
function selectCategory(catId) {
  const radio = document.querySelector(`input[name="category"][value="${catId}"]`);
  if (radio) {
    radio.checked = true;
    const registerSection = document.getElementById('register');
    if (registerSection) {
      registerSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

// ── Club preselect helper ──
function preselectClub(clubName) {
  const select = document.getElementById('runningClub');
  if (select) {
    select.value = clubName;
    checkClubOption(select);
    const registerSection = document.getElementById('register');
    if (registerSection) {
      registerSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

function checkClubOption(select) {
  const customRow = document.getElementById('custom-club-row');
  if (select.value === 'Other / Individual Runner') {
    customRow.style.display = 'block';
  } else {
    customRow.style.display = 'none';
  }
}

// ── Form submission handling ──
function setupForm() {
  const form = document.getElementById('marathon-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    // Submit to server

    try {
      submitBtn.disabled = true;
      btnText.innerText = 'Issuing Race E-Bib...';
      btnSpinner.style.display = 'inline-block';

      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Registration failed');
      }

      // Display the E-Bib
      displayBibModal(result.registration);

      // Reset form
      form.reset();
      document.getElementById('custom-club-row').style.display = 'none';

    } catch (err) {
      alert('Error during registration: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      btnText.innerText = 'Submit Registration & Generate E-Bib';
      btnSpinner.style.display = 'none';
    }
  });
}

// ── Display E-Bib Modal ──
function displayBibModal(reg) {
  document.getElementById('bibDisplayNumber').innerText = reg.bibNumber || 'TBN-0000';
  document.getElementById('bibDisplayName').innerText = (reg.fullName || 'RUNNER').toUpperCase();
  document.getElementById('bibDisplayClub').innerText = reg.runningClub || 'Independent Runner';
  document.getElementById('bibDisplayDistance').innerText = reg.category === 'ALL_LEGS' ? 'ALL 4 LEGS (95K)' : reg.category;
  document.getElementById('bibDisplayDate').innerText = reg.categoryDate || 'Race Day';
  
  const qrImg = document.getElementById('bibDisplayQr');
  if (qrImg && reg.qrCodeDataUrl) {
    qrImg.src = reg.qrCodeDataUrl;
  }

  const modal = document.getElementById('bibModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeBibModal() {
  const modal = document.getElementById('bibModal');
  if (modal) modal.style.display = 'none';
}

// ── Download E-Bib Image (PNG) ──
async function downloadBibImage() {
  const element = document.getElementById('printable-bib');
  if (!element) return;

  try {
    const bibNumber = document.getElementById('bibDisplayNumber').innerText;
    const canvas = await html2canvas(element, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true
    });

    const link = document.createElement('a');
    link.download = `CEBU_MARATHON_BIB_${bibNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Error generating image: ' + err.message);
  }
}

// ── Print Race Ticket ──
function printBibTicket() {
  window.print();
}

// ── Search / Lookup Bib ──
async function lookupBib() {
  const input = document.getElementById('bibSearchInput');
  const resultArea = document.getElementById('searchResultArea');
  const query = input.value.trim();

  if (!query) {
    alert('Please enter a Bib Number, Full Name, or Mobile Number.');
    return;
  }

  try {
    resultArea.style.display = 'block';
    resultArea.innerHTML = '<p style="color:#94a3b8;">Searching registrations database...</p>';

    const res = await fetch(`/api/registrations?search=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success || data.registrations.length === 0) {
      resultArea.innerHTML = `
        <div style="color: #f87171; padding: 10px;">
          ❌ No runner found matching "<strong>${escapeHtml(query)}</strong>". Please double check your spelling or register above.
        </div>
      `;
      return;
    }

    let html = `<div style="font-size: 0.9rem; margin-bottom: 10px; color: #38bdf8;">Found ${data.registrations.length} runner(s):</div>`;

    data.registrations.forEach(r => {
      html += `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #fff;">${escapeHtml(r.fullName)}</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">Bib: <strong style="color:#00d2c4;">${r.bibNumber}</strong> | Distance: <strong>${r.category}</strong> | Club: ${escapeHtml(r.runningClub)}</div>
            <div style="font-size: 0.78rem; color: ${r.claimed ? '#4ade80' : '#fbbf24'};">Status: ${r.claimed ? '✅ Kit Claimed' : '⏳ Ready for Kit Pick-up'}</div>
          </div>
          <button class="btn btn-primary" style="padding: 6px 14px; font-size: 0.82rem;" onclick='displayBibModal(${JSON.stringify(r)})'>
            View E-Bib
          </button>
        </div>
      `;
    });

    resultArea.innerHTML = html;

  } catch (err) {
    resultArea.innerHTML = `<div style="color: #f87171;">Error looking up runner: ${err.message}</div>`;
  }
}

// ── Modals Handling ──
function openPosterModal() {
  const modal = document.getElementById('posterModal');
  if (modal) modal.style.display = 'flex';
}

function closePosterModal() {
  const modal = document.getElementById('posterModal');
  if (modal) modal.style.display = 'none';
}

function openSizeChartModal() {
  const modal = document.getElementById('sizeChartModal');
  if (modal) modal.style.display = 'flex';
}

function closeSizeChartModal() {
  const modal = document.getElementById('sizeChartModal');
  if (modal) modal.style.display = 'none';
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Close modals when clicking overlay
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});

