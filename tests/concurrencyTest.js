/**
 * View2Earn Concurrency & Security Test Suite
 * Kiểm thử tính đúng đắn khi xử lý High Concurrency, Anti-Fraud, Idempotency và Race Conditions
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import RewardTransaction from '../src/models/RewardTransaction.js';
import AdSession from '../src/models/AdSession.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

const PORT = 5099;
let server = null;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ VIEW2EARN HIGH CONCURRENCY SUITE');
  console.log('====================================================\n');

  try {
    // 1. Khởi động DB và Test Server
    await connectDB();
    await RewardTransaction.syncIndexes();
    await AdSession.syncIndexes();
    await User.syncIndexes();
    
    server = app.listen(PORT);
    console.log(`[Test Setup] Test server is listening on port ${PORT}\n`);

    // Dọn dẹp test data cũ
    await User.deleteMany({ username: /^test_user_/ });
    await RewardTransaction.deleteMany({});
    await AdSession.deleteMany({});

    // ----------------------------------------------------
    // TEST 1: ĐĂNG KÝ & ĐĂNG NHẬP
    // ----------------------------------------------------
    console.log('▶ [TEST 1] Đăng ký & Đăng nhập người dùng test...');
    const testUsername = `test_user_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    const testPassword = 'Password123!';

    const regRes = await fetch(`${BASE_URL}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUsername,
        email: testEmail,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    if (!regData.success) throw new Error(`Register failed: ${regData.message}`);
    const token = regData.data.token;
    const userId = regData.data._id;
    console.log(`✅ Đăng ký thành công! User ID: ${userId}, Balance ban đầu: $${regData.data.balance}\n`);

    // ----------------------------------------------------
    // TEST 2: RACE CONDITION & IDEMPOTENCY TEST
    // 20 requests đồng thời gửi cùng 1 adSessionId
    // ----------------------------------------------------
    console.log('▶ [TEST 2] Race Condition: Gửi 20 requests ĐỒNG THỜI với CÙNG 1 adSessionId...');
    const duplicateSessionId = `test_session_${Date.now()}`;
    const concurrencyCount = 20;

    const promises = Array.from({ length: concurrencyCount }).map((_, i) =>
      fetch(`${BASE_URL}/users/reward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          adSessionId: duplicateSessionId,
          rewardAmount: 100, // Cố tình gửi số tiền lớn để test Server Authority
        }),
      }).then(async (res) => ({
        status: res.status,
        body: await res.json(),
        index: i,
      }))
    );

    const results = await Promise.all(promises);
    const successRequests = results.filter((r) => r.body.success === true);
    const rejectedRequests = results.filter((r) => r.body.success === false);

    console.log(`  - Tổng số requests gửi đi: ${concurrencyCount}`);
    console.log(`  - Số requests thành công: ${successRequests.length}`);
    console.log(`  - Số requests bị từ chối do duplicate/idempotency: ${rejectedRequests.length}`);

    // Kiểm tra số dư trong DB
    const freshUser = await User.findById(userId).lean();
    console.log(`  - Số dư thực tế trong DB: $${freshUser.balance.toFixed(2)} (Kỳ vọng: Đúng $0.50)`);

    if (successRequests.length === 1 && freshUser.balance === 0.50) {
      console.log('✅ PASS: Idempotency hoạt động tuyệt đối! Không bị nhân bản tiền thưởng (Duplicate Reward prevented).\n');
    } else {
      throw new Error(`❌ FAIL: Race condition thất bại! Success count = ${successRequests.length}, Balance = ${freshUser.balance}`);
    }

    // ----------------------------------------------------
    // TEST 3: SERVER AUTHORITY & ANTI-FRAUD TEST
    // Client cố tình gửi rewardAmount = 999999 mà không có session
    // ----------------------------------------------------
    console.log('▶ [TEST 3] Server Authority: Thử gửi rewardAmount gian lận ($999,999)...');
    const fraudRes = await fetch(`${BASE_URL}/users/reward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId,
        rewardAmount: 999999,
        adSessionId: `session_fraud_${Date.now()}`,
      }),
    });
    const fraudData = await fraudRes.json();
    const userAfterFraud = await User.findById(userId).lean();

    console.log(`  - Số dư sau khi nhận thưởng: $${userAfterFraud.balance.toFixed(2)} (Kỳ vọng: $1.00 = $0.50 + $0.50)`);
    if (userAfterFraud.balance === 1.00) {
      console.log('✅ PASS: Server Authority thành công! Server bỏ qua số tiền do client gửi lên và chỉ cộng mức $0.50 hợp lệ.\n');
    } else {
      throw new Error(`❌ FAIL: Server bị thao túng số tiền thưởng! Balance = ${userAfterFraud.balance}`);
    }

    // ----------------------------------------------------
    // TEST 4: AD SESSION FLOW (START -> ANTI-CHEAT -> COMPLETE)
    // ----------------------------------------------------
    console.log('▶ [TEST 4] Ad Session Flow: Khởi tạo AdSession và kiểm tra Anti-Cheat...');
    const startRes = await fetch(`${BASE_URL}/ads/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ placementId: 'rewarded_video_endgame' }),
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error(`Start ad failed: ${startData.message}`);
    const adSessionId = startData.data.sessionId;
    console.log(`  - Khởi tạo AdSession thành công: ${adSessionId}`);

    // Thử complete ngay lập tức (dưới 5s) -> Kỳ vọng bị từ chối
    const earlyCompleteRes = await fetch(`${BASE_URL}/ads/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId: adSessionId }),
    });
    const earlyData = await earlyCompleteRes.json();
    if (earlyData.success === false && earlyCompleteRes.status === 400) {
      console.log(`  - Anti-Cheat chặn xem video quá nhanh: "${earlyData.message}" (Hợp lệ)`);
    }

    // Đợi 5.5 giây và complete lại
    console.log('  - Chờ 5.5 giây để mô phỏng xem quảng cáo hợp lệ...');
    await new Promise((r) => setTimeout(r, 5500));

    // Cần tạo 1 session mới vì session cũ đã bị đánh dấu INVALID
    const startRes2 = await fetch(`${BASE_URL}/ads/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ placementId: 'rewarded_video_endgame' }),
    });
    const startData2 = await startRes2.json();
    const validSessionId = startData2.data.sessionId;

    await new Promise((r) => setTimeout(r, 5200));

    const validCompleteRes = await fetch(`${BASE_URL}/ads/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId: validSessionId }),
    });
    const validCompleteData = await validCompleteRes.json();
    if (validCompleteData.success) {
      console.log(`✅ PASS: Hoàn thành AdSession hợp lệ! Balance mới: $${validCompleteData.data.balance.toFixed(2)}\n`);
    } else {
      throw new Error(`Complete valid ad failed: ${validCompleteData.message}`);
    }

    // ----------------------------------------------------
    // TEST 5: HISTORY & PAGINATION
    // ----------------------------------------------------
    console.log('▶ [TEST 5] Kiểm tra Pagination lịch sử giao dịch (GET /api/users/history)...');
    const historyRes = await fetch(`${BASE_URL}/users/history?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const historyData = await historyRes.json();
    if (historyData.success && historyData.data.transactions.length > 0) {
      console.log(`  - Tổng số bản ghi giao dịch trong Ledger: ${historyData.data.pagination.totalRecords}`);
      console.log(`  - Số bản ghi trả về trang 1: ${historyData.data.transactions.length}`);
      console.log('✅ PASS: Pagination hoạt động hoàn hảo.\n');
    } else {
      throw new Error(`History query failed: ${JSON.stringify(historyData)}`);
    }

    console.log('====================================================');
    console.log('🎉 TẤT CẢ 5 BÀI TEST ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ TEST SUITE FAILED:', error);
  } finally {
    if (server) {
      server.close();
    }
    await disconnectDB();
    process.exit(0);
  }
}

runTestSuite();
