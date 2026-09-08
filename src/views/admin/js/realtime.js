// Âm thanh thông báo Web Audio API (không cần file âm thanh ngoài)
    function toggleSoundAlert() {
      soundAlertsEnabled = !soundAlertsEnabled;
      localStorage.setItem('v2e_sound_alerts', soundAlertsEnabled ? 'true' : 'false');
      updateSoundButtonUI();
      if (soundAlertsEnabled) {
        playNotificationChime();
        showMiniToast('🔔 Âm thanh thông báo: ĐÃ BẬT');
      } else {
        showMiniToast('🔕 Âm thanh thông báo: ĐÃ TẮT');
      }
    }

    function updateSoundButtonUI() {
      const btn = document.getElementById('btnSoundToggle');
      if (!btn) return;
      if (soundAlertsEnabled) {
        btn.innerHTML = '🔔 Chuông: Bật';
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-outline');
      } else {
        btn.innerHTML = '🔕 Chuông: Tắt';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
      }
    }

    function playNotificationChime() {
      if (!soundAlertsEnabled) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;

        // Âm 1: 587.33 Hz (nốt D5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.22);

        // Âm 2: 880.00 Hz (nốt A5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.14);
        gain2.gain.setValueAtTime(0.24, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.14);
        osc2.stop(now + 0.55);
      } catch (err) {
        console.warn('AudioContext không khả dụng:', err);
      }
    }

    // Realtime SSE Stream & Push Toast
    function initNotificationStream() {
      if (sseEventSource) {
        sseEventSource.close();
      }

      const badge = document.getElementById('sseStatusBadge');
      if (badge) {
        badge.textContent = '🟡 Đang kết nối...';
        badge.style.color = '#D97706';
      }

      try {
        sseEventSource = new EventSource('/api/admin/notifications/stream');

        sseEventSource.onopen = () => {
          if (badge) {
            badge.textContent = '🟢 Realtime';
            badge.style.color = '#059669';
          }
        };

        sseEventSource.addEventListener('new_withdrawal', (e) => {
          try {
            const data = JSON.parse(e.data);
            handleIncomingWithdrawal(data);
          } catch (err) {
            console.error('Lỗi phân tích new_withdrawal:', err);
          }
        });

        sseEventSource.onerror = () => {
          if (badge) {
            badge.textContent = '🟠 Tự kết nối lại...';
            badge.style.color = '#EA580C';
          }
        };
      } catch (e) {
        console.error('Không thể khởi tạo EventSource:', e);
      }
    }

    function handleIncomingWithdrawal(tx) {
      playNotificationChime();
      showWithdrawPushToast(tx);

      if (currentTab === 'withdrawals') {
        loadWithdrawalsData(withdrawalsCurrentPage);
      }
      syncPendingWithdrawalsCount();
    }

    function showWithdrawPushToast(tx) {
      const container = getOrCreateToastContainer();
      const toast = document.createElement('div');
      toast.className = 'push-toast-alert';
      toast.style.cssText = 'background:#1E293B; color:#FFFFFF; border-left:4px solid #F59E0B; border-radius:10px; padding:14px 16px; margin-bottom:10px; box-shadow:0 10px 25px rgba(0,0,0,0.25); display:flex; align-items:center; justify-content:space-between; gap:12px; animation:slideInRight 0.35s ease-out; min-width:320px; max-width:400px;';

      const amountUSD = Number(tx.amount || 0).toFixed(3);
      const amountVND = Math.round((tx.amount || 0) * 25000).toLocaleString('vi-VN');
      const u = tx.userId || {};
      const meta = tx.metadata || {};

      toast.innerHTML = `
        <div style="font-size:24px;">💸</div>
        <div style="flex:1;">
          <div style="font-weight:700; color:#F59E0B; font-size:14px;">Yêu Cầu Rút Tiền Mới!</div>
          <div style="font-size:13px; color:#F8FAFC; margin-top:2px;">
            <strong>${escapeHtml(u.username || 'Người dùng')}</strong> vừa yêu cầu rút <strong>$${amountUSD}</strong> (~${amountVND} đ)
          </div>
          <div style="font-size:11px; color:#94A3B8; margin-top:3px;">
            ${escapeHtml(meta.bankName || 'Ngân hàng')}: <code>${escapeHtml(meta.accountNumber || '')}</code>
          </div>
        </div>
        <button style="background:#F59E0B; border:none; color:#1E293B; font-weight:700; border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer;" onclick="switchTab('withdrawals'); this.parentElement.remove();">
          Xem ngay
        </button>
      `;

      container.appendChild(toast);
      setTimeout(() => {
        toast.style.transition = 'opacity 0.5s, transform 0.5s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 500);
      }, 8000);
    }

    function getOrCreateToastContainer() {
      let c = document.getElementById('pushToastContainer');
      if (!c) {
        c = document.createElement('div');
        c.id = 'pushToastContainer';
        c.style.cssText = 'position:fixed; top:20px; right:20px; z-index:999999; display:flex; flex-direction:column; align-items:flex-end;';
        document.body.appendChild(c);
      }
      return c;
    }

    async function syncPendingWithdrawalsCount() {
      try {
        const res = await fetch('/api/admin/withdrawals?limit=1&status=PENDING');
        const json = await res.json();
        if (json.success && json.data && json.data.stats) {
          updateNavWithdrawBadge(json.data.stats.pendingCount);
          const statPendingEl = document.getElementById('statPendingWithdrawCount');
          if (statPendingEl) statPendingEl.textContent = json.data.stats.pendingCount || 0;
        }
      } catch (err) {
        // Silent catch
      }
    }