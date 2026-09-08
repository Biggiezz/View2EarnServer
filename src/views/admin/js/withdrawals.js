// QUẢN LÝ YÊU CẦU RÚT TIỀN (WITHDRAWALS)
    // ==========================================
    let currentVietQrRawVND = 0;
    let currentViewingTxId = null;
    let currentRejectingTxId = null;
    let withdrawalsCurrentPage = 1;
    let withdrawSearchDebounceTimer = null;
    let soundAlertsEnabled = localStorage.getItem('v2e_sound_alerts') !== 'false';
    let sseEventSource = null;

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function resolveVietQrBankCode(bankName) {
      if (!bankName) return 'MB';
      const s = bankName.toUpperCase();
      if (s.includes('MB') || s.includes('QUÂN ĐỘI')) return 'MB';
      if (s.includes('VCB') || s.includes('VIETCOMBANK') || s.includes('NGOẠI THƯƠNG')) return 'VCB';
      if (s.includes('ICB') || s.includes('VIETINBANK') || s.includes('CÔNG THƯƠNG')) return 'ICB';
      if (s.includes('BIDV') || s.includes('ĐẦU TƯ')) return 'BIDV';
      if (s.includes('TCB') || s.includes('TECHCOMBANK') || s.includes('KỸ THƯƠNG')) return 'TCB';
      if (s.includes('ACB') || s.includes('Á CHÂU')) return 'ACB';
      if (s.includes('VPB') || s.includes('VPBANK') || s.includes('THỊNH VƯỢNG')) return 'VPB';
      if (s.includes('TPB') || s.includes('TIENPHONG') || s.includes('TIÊN PHONG')) return 'TPB';
      if (s.includes('STB') || s.includes('SACOMBANK') || s.includes('SÀI GÒN THƯƠNG TÍN')) return 'STB';
      if (s.includes('HDB') || s.includes('HDBANK') || s.includes('PHÁT TRIỂN')) return 'HDB';
      if (s.includes('VIB') || s.includes('QUỐC TẾ')) return 'VIB';
      if (s.includes('SHB') || s.includes('SÀI GÒN HÀ NỘI')) return 'SHB';
      if (s.includes('MSB') || s.includes('HÀNG HẢI')) return 'MSB';
      if (s.includes('OCB') || s.includes('PHƯƠNG ĐÔNG')) return 'OCB';
      if (s.includes('SEAB') || s.includes('SEABANK')) return 'SEAB';
      if (s.includes('LPB') || s.includes('LIENVIET') || s.includes('BƯU ĐIỆN')) return 'LPB';
      if (s.includes('ABB') || s.includes('ABBANK') || s.includes('AN BÌNH')) return 'ABB';
      if (s.includes('NAB') || s.includes('NAM A') || s.includes('NAM Á')) return 'NAB';
      if (s.includes('BVB') || s.includes('BAOVIET') || s.includes('BẢO VIỆT')) return 'BVB';
      if (s.includes('VIETBANK') || s.includes('VIỆT NAM THƯƠNG TÍN')) return 'VBB';
      if (s.includes('AGRIBANK') || s.includes('NÔNG NGHIỆP')) return 'VBA';
      const match = bankName.match(/[A-Za-z]{2,6}/);
      return match ? match[0].toUpperCase() : 'MB';
    }

    async function loadWithdrawalsData(page = 1) {
      withdrawalsCurrentPage = page;
      const status = document.getElementById('withdrawStatusSelect')?.value || 'all';
      const search = document.getElementById('withdrawSearchInput')?.value?.trim() || '';
      const tbody = document.getElementById('tableWithdrawalsList');
      if (!tbody) return;

      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#94A3B8;">Đang tải danh sách yêu cầu rút tiền...</td></tr>`;

      try {
        const res = await fetch(`/api/admin/withdrawals?page=${page}&limit=10&status=${status}&q=${encodeURIComponent(search)}&search=${encodeURIComponent(search)}`);
        const json = await res.json();
        if (!json.success || !json.data) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Không thể tải dữ liệu: ${(json && json.message) || 'Lỗi'}</td></tr>`;
          return;
        }

        // Cập nhật thẻ thống kê
        if (json.data.stats) {
          const s = json.data.stats;
          const statPendingEl = document.getElementById('statPendingWithdrawCount');
          if (statPendingEl) statPendingEl.textContent = s.pendingCount || 0;
          const statPendingAmtEl = document.getElementById('statPendingWithdrawAmount');
          if (statPendingAmtEl) {
            const vnd = Math.round((s.pendingAmount || 0) * 25000);
            statPendingAmtEl.textContent = `Tổng: $${(s.pendingAmount || 0).toFixed(3)} (~${vnd.toLocaleString('vi-VN')} đ)`;
          }
          const statCompEl = document.getElementById('statCompletedWithdrawCount');
          if (statCompEl) statCompEl.textContent = s.completedCount || 0;
          const statRejEl = document.getElementById('statRejectedWithdrawCount');
          if (statRejEl) statRejEl.textContent = s.rejectedCount || 0;

          // Cập nhật số badge trên sidebar
          updateNavWithdrawBadge(s.pendingCount);
        }

        const transactions = json.data.withdrawals || json.data.transactions || [];
        const pagination = json.data.pagination || { total: transactions.length, page: 1, totalPages: 1 };
        if (!transactions || transactions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:#94A3B8;">Không tìm thấy yêu cầu rút tiền nào phù hợp</td></tr>`;
          renderWithdrawPagination(pagination);
          return;
        }

        tbody.innerHTML = transactions.map(tx => {
          const u = tx.userId || {};
          const meta = tx.metadata || {};
          const amountUSD = Number(tx.amount || 0);
          const amountVND = Math.round(amountUSD * 25000);
          const isPending = tx.status === 'PENDING';
          const txDataEscaped = encodeURIComponent(JSON.stringify(tx));

          return `
            <tr>
              <td><code title="${tx._id}">#${tx._id.substring(18)}</code></td>
              <td>
                <strong>${escapeHtml(u.username || 'N/A')}</strong>
                <div style="font-size:11px; color:#64748B;">${escapeHtml(u.email || '')}</div>
              </td>
              <td>
                <div style="font-weight:700; color:#EF4444; font-size:14px;">-$${amountUSD.toFixed(3)}</div>
                <div style="font-size:11px; color:#10B981; font-weight:600;">~${amountVND.toLocaleString('vi-VN')} đ</div>
              </td>
              <td>
                <div style="font-weight:600; color:#1E293B; max-width:260px; white-space:normal; line-height:1.3;">${escapeHtml(meta.bankName || 'Ngân hàng')}</div>
                <div style="font-family:monospace; color:#2563EB; font-weight:600; font-size:13px; margin-top:2px;">${escapeHtml(meta.accountNumber || 'Chưa cập nhật')}</div>
              </td>
              <td>
                <strong style="color:#0F172A; text-transform:uppercase;">${escapeHtml(meta.accountHolder || 'N/A')}</strong>
                ${meta.userNote ? `<div style="font-size:11px; color:#64748B; font-style:italic; max-width:240px; white-space:normal; line-height:1.3;" title="Ghi chú người dùng: ${escapeHtml(meta.userNote)}">"${escapeHtml(meta.userNote)}"</div>` : ''}
                ${meta.rejectReason ? `<div style="font-size:11px; color:#EF4444; max-width:240px; white-space:normal; line-height:1.3;" title="Lý do từ chối: ${escapeHtml(meta.rejectReason)}">Lý do: ${escapeHtml(meta.rejectReason)}</div>` : ''}
              </td>
              <td style="font-size:12px; color:#64748B;">
                ${new Date(tx.createdAt).toLocaleString('vi-VN')}
              </td>
              <td>
                <span class="badge ${getBadgeStatusClass(tx.status)}">${tx.status === 'PENDING' ? '⏳ Chờ duyệt' : (tx.status === 'COMPLETED' ? '✓ Hoàn tất' : '✕ Từ chối')}</span>
              </td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:nowrap; align-items:center;">
                  <button class="btn-action btn-outline" style="padding:4px 8px; font-size:12px; white-space:nowrap;" onclick="openVietQrModal('${txDataEscaped}')" title="Xem thông tin và quét mã VietQR">
                    📱 VietQR
                  </button>
                  ${isPending ? `
                    <button class="btn-action btn-success" style="padding:4px 8px; font-size:12px; white-space:nowrap;" onclick="approveWithdrawal('${tx._id}')" title="Duyệt lệnh rút tiền (Đã chuyển khoản)">
                      ✓ Duyệt
                    </button>
                    <button class="btn-action btn-danger" style="padding:4px 8px; font-size:12px; white-space:nowrap;" onclick="openRejectModal('${tx._id}', '${escapeHtml(u.username || 'N/A')}', '${amountUSD.toFixed(3)}')" title="Từ chối lệnh và tự động hoàn tiền vào ví">
                      ✕ Từ chối
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');

        renderWithdrawPagination(pagination);
        tabLoaded.withdrawals = true;
      } catch (err) {
        console.error('Error loadWithdrawalsData:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Lỗi kết nối khi tải danh sách rút tiền</td></tr>`;
      }
    }

    function renderWithdrawPagination(p) {
      const el = document.getElementById('withdrawPagination');
      if (!el || !p) return;
      el.innerHTML = `
        <div style="font-size:13px; color:#64748B;">
          Trang <strong>${p.page}</strong> / <strong>${p.totalPages || 1}</strong> (Tổng cộng <strong>${p.total}</strong> yêu cầu)
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-action btn-outline" ${p.page <= 1 ? 'disabled' : ''} onclick="loadWithdrawalsData(${p.page - 1})">« Trang trước</button>
          <button class="btn-action btn-outline" ${p.page >= p.totalPages ? 'disabled' : ''} onclick="loadWithdrawalsData(${p.page + 1})">Trang sau »</button>
        </div>
      `;
    }

    function debounceWithdrawSearch() {
      clearTimeout(withdrawSearchDebounceTimer);
      withdrawSearchDebounceTimer = setTimeout(() => {
        loadWithdrawalsData(1);
      }, 350);
    }

    function updateNavWithdrawBadge(count) {
      const badge = document.getElementById('navWithdrawBadge');
      if (!badge) return;
      if (count && count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Modal VietQR
    function openVietQrModal(txDataEscaped) {
      try {
        const tx = JSON.parse(decodeURIComponent(txDataEscaped));
        currentViewingTxId = tx._id;
        const meta = tx.metadata || {};
        const amountUSD = Number(tx.amount || 0);
        const amountVND = Math.round(amountUSD * 25000);
        currentVietQrRawVND = amountVND;

        const bankName = meta.bankName || 'MBBank';
        const accNum = meta.accountNumber || '';
        const accHolder = meta.accountHolder || (tx.userId ? tx.userId.username : 'KHACH HANG');
        const content = meta.userNote || `V2E RUT ${tx._id.substring(18)}`;

        const bankCode = resolveVietQrBankCode(bankName);
        const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accNum}-compact2.png?amount=${amountVND}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accHolder)}`;

        document.getElementById('vietqrImage').src = qrUrl;
        document.getElementById('vietqrBankName').textContent = `${bankName} (${bankCode})`;
        document.getElementById('vietqrAccNum').textContent = accNum || 'Chưa cập nhật';
        document.getElementById('vietqrAccHolder').textContent = accHolder;
        document.getElementById('vietqrAmountVND').textContent = `${amountVND.toLocaleString('vi-VN')} đ ($${amountUSD.toFixed(3)})`;
        document.getElementById('vietqrContent').textContent = content;

        const btnConfirm = document.getElementById('btnConfirmQrTransfer');
        if (btnConfirm) {
          if (tx.status === 'PENDING') {
            btnConfirm.style.display = 'inline-block';
          } else {
            btnConfirm.style.display = 'none';
          }
        }

        document.getElementById('vietqrModal').classList.add('show');
      } catch (err) {
        console.error('Error openVietQrModal:', err);
      }
    }

    function closeVietQrModal() {
      document.getElementById('vietqrModal').classList.remove('show');
      currentViewingTxId = null;
    }

    async function confirmFromQrModal() {
      if (!currentViewingTxId) return;
      const ok = await approveWithdrawal(currentViewingTxId);
      if (ok) {
        closeVietQrModal();
      }
    }

    // Modal Từ chối & Hoàn tiền
    function openRejectModal(txId, username, amountUSD) {
      currentRejectingTxId = txId;
      document.getElementById('rejectModalUsername').textContent = username;
      document.getElementById('rejectModalAmount').textContent = `$${amountUSD}`;
      document.getElementById('rejectReasonInput').value = '';
      document.getElementById('rejectWithdrawModal').classList.add('show');
    }

    function closeRejectModal() {
      document.getElementById('rejectWithdrawModal').classList.remove('show');
      currentRejectingTxId = null;
    }

    async function submitRejectWithdrawal() {
      if (!currentRejectingTxId) return;
      const reason = document.getElementById('rejectReasonInput').value.trim();

      try {
        const res = await fetch(`/api/admin/transactions/${currentRejectingTxId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'REJECTED',
            rejectReason: reason || 'Admin từ chối yêu cầu rút tiền'
          })
        });
        const json = await res.json();
        alert(json.message);
        if (json.success) {
          closeRejectModal();
          loadWithdrawalsData(withdrawalsCurrentPage);
          loadOverviewData();
        }
      } catch (err) {
        alert('Lỗi khi từ chối yêu cầu: ' + err.message);
      }
    }

    async function approveWithdrawal(txId) {
      if (!confirm('Xác nhận bạn đã chuyển khoản thành công và muốn DUYỆT yêu cầu rút tiền này?')) return false;

      try {
        const res = await fetch(`/api/admin/transactions/${txId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED' })
        });
        const json = await res.json();
        alert(json.message);
        if (json.success) {
          loadWithdrawalsData(withdrawalsCurrentPage);
          loadOverviewData();
          return true;
        }
      } catch (err) {
        alert('Lỗi duyệt lệnh rút: ' + err.message);
      }
      return false;
    }

    // Tiện ích Sao Chép & Mini Toast
    function copyFieldText(elementId, label) {
      const el = document.getElementById(elementId);
      if (!el) return;
      copyRawText(el.textContent.trim(), label);
    }

    function copyRawText(text, label) {
      if (!text) return;
      navigator.clipboard.writeText(String(text)).then(() => {
        showMiniToast(`Đã sao chép ${label || ''}: ${text}`);
      }).catch(() => {
        const temp = document.createElement('textarea');
        temp.value = String(text);
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showMiniToast(`Đã sao chép: ${text}`);
      });
    }

    function showMiniToast(msg) {
      let toast = document.getElementById('adminMiniToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'adminMiniToast';
        toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#1E293B; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; z-index:99999; box-shadow:0 8px 24px rgba(0,0,0,0.2); transition:opacity 0.3s; opacity:0; pointer-events:none;';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
      }, 2200);
    }