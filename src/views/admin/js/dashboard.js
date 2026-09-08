let currentTab = 'overview';
    let selectedUserId = null;
    let searchTimeout = null;
    const tabLoaded = { overview: false, users: false, withdrawals: false, transactions: false, settings: true };

    function toggleMobileMenu() {
      const sidebar = document.getElementById('sidebarNav');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sidebar && backdrop) {
        const isOpen = sidebar.classList.contains('mobile-open');
        if (isOpen) {
          closeMobileMenu();
        } else {
          sidebar.classList.add('mobile-open');
          backdrop.classList.add('active');
        }
      }
    }

    function closeMobileMenu() {
      const sidebar = document.getElementById('sidebarNav');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('active');
    }

    function switchTab(tabId) {
      currentTab = tabId;
      closeMobileMenu();
      document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      const currentBtn = Array.from(document.querySelectorAll('.nav-item button')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(tabId));
      if (currentBtn) currentBtn.classList.add('active');

      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) targetContent.classList.add('active');

      const titles = {
        overview: 'Tổng Quan Hệ Thống',
        users: 'Quản Lý Người Dùng',
        withdrawals: 'Quản Lý Yêu Cầu Rút Tiền',
        transactions: 'Lịch Sử Giao Dịch Hệ Thống',
        settings: 'Cấu Hình Hệ Thống'
      };
      document.getElementById('pageTitle').innerText = titles[tabId] || 'Admin Dashboard';

      // Lazy load: chỉ load dữ liệu lần đầu khi chuyển tab
      if (!tabLoaded[tabId]) {
        if (tabId === 'overview') loadOverviewData();
        else if (tabId === 'users') loadUsersData();
        else if (tabId === 'withdrawals') loadWithdrawalsData(1);
        else if (tabId === 'transactions') loadTransactionsData();
      }
    }

    async function loadOverviewData() {
      try {
        const res = await fetch('/api/admin/stats');
        const json = await res.json();
        if (!json.success) return;

        const data = json.data;
        document.getElementById('statTotalUsers').innerText = data.totalUsers.toLocaleString();
        document.getElementById('statActiveUsers').innerText = `${data.activeUsers} đang hoạt động`;
        document.getElementById('statTotalBalance').innerText = `$${(data.totalBalance || 0).toFixed(3)}`;
        document.getElementById('statTotalEarned').innerText = `Tổng thu nhập: $${(data.totalEarned || 0).toFixed(3)}`;
        document.getElementById('statAdsWatched').innerText = data.totalAdsWatched.toLocaleString();
        document.getElementById('statTotalReferrals').innerText = data.totalReferrals.toLocaleString();
        document.getElementById('statQualifiedReferrals').innerText = `${data.qualifiedReferrals} lượt đủ điều kiện`;

        // Render Recent Users
        const tbodyUsers = document.getElementById('tableRecentUsers');
        if (data.recentUsers && data.recentUsers.length > 0) {
          tbodyUsers.innerHTML = data.recentUsers.map(u => `
            <tr>
              <td>
                <div class="user-info-cell">
                  <div class="user-avatar-chip">${(u.username || 'U')[0].toUpperCase()}</div>
                  <strong>${u.username}</strong>
                </div>
              </td>
              <td>${u.email || 'N/A'}</td>
              <td>$${(u.balance || 0).toFixed(3)}</td>
              <td>${u.adsWatched || 0}</td>
              <td><span class="badge ${u.status === 'banned' ? 'badge-banned' : 'badge-active'}">${u.status === 'banned' ? 'Banned' : 'Active'}</span></td>
            </tr>
          `).join('');
        } else {
          tbodyUsers.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px;">Chưa có dữ liệu người dùng</td></tr>`;
        }

        // Render Recent Transactions
        const tbodyTx = document.getElementById('tableRecentTransactions');
        if (data.recentTransactions && data.recentTransactions.length > 0) {
          tbodyTx.innerHTML = data.recentTransactions.map(tx => `
            <tr>
              <td>${tx.userId ? tx.userId.username : 'N/A'}</td>
              <td><span style="font-weight:600;">${formatTxType(tx.type)}</span></td>
              <td style="font-weight:700; color:${tx.type === 'WITHDRAWAL' ? 'var(--danger)' : 'var(--success)'};">${tx.type === 'WITHDRAWAL' ? '-' : '+'}$${(tx.amount || 0).toFixed(3)}</td>
              <td><span class="badge ${getBadgeStatusClass(tx.status)}">${tx.status}</span></td>
            </tr>
          `).join('');
        } else {
          tbodyTx.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px;">Chưa có giao dịch gần đây</td></tr>`;
        }

        tabLoaded.overview = true;
      } catch (err) {
        console.error('Error loading overview stats:', err);
      }
    }

    async function loadUsersData() {
      const q = document.getElementById('userSearchInput').value;
      const status = document.getElementById('userStatusSelect').value;

      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&status=${status}`);
        const json = await res.json();
        if (!json.success) return;

        const users = json.data.users;
        const tbody = document.getElementById('tableUsersList');
        if (users.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94A3B8;">Không tìm thấy người dùng phù hợp</td></tr>`;
          return;
        }

        tbody.innerHTML = users.map(u => `
          <tr>
            <td>
              <div class="user-info-cell">
                <div class="user-avatar-chip">${(u.username || 'U')[0].toUpperCase()}</div>
                <div>
                  <strong>${u.username}</strong>
                </div>
              </div>
            </td>
            <td>${u.email || 'N/A'}</td>
            <td style="font-weight:700; color:var(--primary);">$${(u.balance || 0).toFixed(3)}</td>
            <td>${u.adsWatched || 0}</td>
            <td><code>${u.referralCode || 'N/A'}</code></td>
            <td><span class="badge ${u.status === 'banned' ? 'badge-banned' : 'badge-active'}">${u.status === 'banned' ? 'Đã khóa' : 'Hoạt động'}</span></td>
            <td>${new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
            <td>
              <button class="btn-action btn-outline" onclick="openUserModal('${u._id}')">Chi tiết & Sửa</button>
            </td>
          </tr>
        `).join('');

        tabLoaded.users = true;
      } catch (err) {
        console.error('Error loading users:', err);
      }
    }

    function handleUserSearch(e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadUsersData();
      }, 300);
    }

    async function openUserModal(userId) {
      selectedUserId = userId;
      try {
        const res = await fetch(`/api/admin/users/${userId}`);
        const json = await res.json();
        if (!json.success) return;

        const u = json.data.user;
        document.getElementById('modalUsername').innerText = `Chi tiết người dùng: ${u.username}`;
        document.getElementById('modalInputUsername').value = u.username;
        document.getElementById('modalInputEmail').value = u.email || '';
        document.getElementById('modalInputBalance').value = `$${(u.balance || 0).toFixed(3)}`;
        document.getElementById('modalInputTotalEarned').value = `$${(u.totalEarned || 0).toFixed(3)}`;
        document.getElementById('modalInputAdsWatched').value = u.adsWatched || 0;
        document.getElementById('modalInputReferralCode').value = u.referralCode || 'N/A';

        document.getElementById('inputAdjustAmount').value = '';
        document.getElementById('inputAdjustNote').value = '';

        document.getElementById('userModal').classList.add('open');
      } catch (err) {
        alert('Có lỗi xảy ra khi xem thông tin người dùng');
      }
    }

    function closeUserModal() {
      document.getElementById('userModal').classList.remove('open');
      selectedUserId = null;
    }

    async function submitBalanceAdjustment() {
      if (!selectedUserId) return;
      const amount = document.getElementById('inputAdjustAmount').value;
      const note = document.getElementById('inputAdjustNote').value;

      if (!amount || parseFloat(amount) === 0) {
        alert('Vui lòng nhập số tiền hợp lệ');
        return;
      }

      try {
        const res = await fetch(`/api/admin/users/${selectedUserId}/balance`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parseFloat(amount), note })
        });
        const json = await res.json();
        alert(json.message);
        if (json.success) {
          openUserModal(selectedUserId);
          refreshCurrentTab();
        }
      } catch (err) {
        alert('Cập nhật số dư thất bại');
      }
    }

    async function updateUserAccountStatus(newStatus) {
      if (!selectedUserId) return;
      if (!confirm(`Bạn có chắc chắn muốn chuyển trạng thái tài khoản thành ${newStatus === 'banned' ? 'Khóa (Banned)' : 'Hoạt động (Active)'}?`)) return;

      try {
        const res = await fetch(`/api/admin/users/${selectedUserId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        const json = await res.json();
        alert(json.message);
        if (json.success) {
          openUserModal(selectedUserId);
          refreshCurrentTab();
        }
      } catch (err) {
        alert('Cập nhật trạng thái thất bại');
      }
    }

    async function loadTransactionsData() {
      const type = document.getElementById('txTypeSelect').value;
      const status = document.getElementById('txStatusSelect').value;

      try {
        const res = await fetch(`/api/admin/transactions?type=${type}&status=${status}`);
        const json = await res.json();
        if (!json.success) return;

        const transactions = json.data.transactions;
        const tbody = document.getElementById('tableTransactionsList');
        if (transactions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#94A3B8;">Không có giao dịch nào phù hợp</td></tr>`;
          return;
        }

        tbody.innerHTML = transactions.map(tx => `
          <tr>
            <td><code>${tx._id.substring(18)}</code></td>
            <td>
              <strong>${tx.userId ? tx.userId.username : 'N/A'}</strong>
              <div style="font-size:12px; color:var(--text-muted);">${tx.userId ? tx.userId.email : ''}</div>
            </td>
            <td><span style="font-weight:600;">${formatTxType(tx.type)}</span></td>
            <td style="font-weight:700; color:${tx.type === 'WITHDRAWAL' ? 'var(--danger)' : 'var(--success)'};">${tx.type === 'WITHDRAWAL' ? '-' : '+'}$${(tx.amount || 0).toFixed(3)}</td>
            <td><span class="badge ${getBadgeStatusClass(tx.status)}">${tx.status}</span></td>
            <td>${new Date(tx.createdAt).toLocaleString('vi-VN')}</td>
            <td>
              ${tx.type === 'WITHDRAWAL' && tx.status === 'PENDING' ? `
                <button class="btn-action btn-success" onclick="updateTxStatus('${tx._id}', 'COMPLETED')">Duyệt</button>
                <button class="btn-action btn-danger" onclick="updateTxStatus('${tx._id}', 'REJECTED')">Từ chối</button>
              ` : `<span style="color:var(--text-muted); font-size:12px;">Chỉ xem</span>`}
            </td>
          </tr>
        `).join('');

        tabLoaded.transactions = true;
      } catch (err) {
        console.error('Error loading transactions:', err);
      }
    }

    async function updateTxStatus(txId, status) {
      if (!confirm(`Xác nhận ${status === 'COMPLETED' ? 'duyệt' : 'từ chối'} giao dịch này?`)) return;

      try {
        const res = await fetch(`/api/admin/transactions/${txId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const json = await res.json();
        alert(json.message);
        if (json.success) {
          loadTransactionsData();
        }
      } catch (err) {
        alert('Cập nhật trạng thái giao dịch thất bại');
      }
    }

    function formatTxType(type) {
      const map = {
        AD_REWARD: 'Thưởng xem QC',
        REFERRAL_REWARD: 'Thưởng giới thiệu',
        WITHDRAWAL: 'Rút tiền',
        ADMIN_ADJUSTMENT: 'Admin điều chỉnh',
        DAILY_BONUS: 'Thưởng điểm danh'
      };
      return map[type] || type;
    }

    function getBadgeStatusClass(status) {
      if (status === 'COMPLETED') return 'badge-completed';
      if (status === 'PENDING') return 'badge-pending';
      if (status === 'REJECTED' || status === 'FAILED') return 'badge-rejected';
      return 'badge-active';
    }

    // ==========================================

    // Login Handler
    function handleLogin(e) {
      e.preventDefault();
      const u = document.getElementById('loginUsername').value.trim();
      const p = document.getElementById('loginPassword').value;
      if (u === 'viewearnadmin' && p === '123456aA@') {
        sessionStorage.setItem('v2e_admin_auth', '1');
        document.getElementById('loginOverlay').classList.add('hidden');
        initDashboard();
      } else {
        document.getElementById('loginError').style.display = 'block';
      }
    }

    // Lazy init: load tab overview (tab mặc định) sau khi đăng nhập
    function initDashboard() {
      loadOverviewData();
      updateSoundButtonUI();
      initNotificationStream();
      syncPendingWithdrawalsCount();
      setInterval(syncPendingWithdrawalsCount, 20000);
    }

    // Check session on load
    if (sessionStorage.getItem('v2e_admin_auth') === '1') {
      document.getElementById('loginOverlay').classList.add('hidden');
      initDashboard();
    }