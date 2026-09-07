import crypto from 'crypto';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import RewardTransaction from '../models/RewardTransaction.js';

const REFERRAL_REWARD_AMOUNT = parseFloat(process.env.REFERRAL_REWARD_AMOUNT || '1.00');
const REQUIRED_ADS_COUNT = parseInt(process.env.REFERRAL_REQUIRED_ADS || '5', 10);

/**
 * Sinh mã giới thiệu duy nhất có tiền tố V2EARN-
 */
export const generateUniqueReferralCode = async () => {
  let isUnique = false;
  let code = '';

  while (!isUnique) {
    const randomChars = crypto.randomBytes(3).toString('hex').toUpperCase();
    code = `V2EARN-${randomChars}`;

    const existing = await User.findOne({ referralCode: code }).select('_id').lean();
    if (!existing) {
      isUnique = true;
    }
  }

  return code;
};

/**
 * Xử lý nhập mã giới thiệu (Claim Referral)
 */
export const claimReferralCode = async ({ referredUserId, referralCode }) => {
  if (!referralCode || !referralCode.trim()) {
    throw new Error('Mã giới thiệu không được để trống');
  }

  const cleanCode = referralCode.trim().toUpperCase();

  // 1. Tìm thông tin người giới thiệu từ mã referralCode
  const referrer = await User.findOne({ referralCode: cleanCode }).select('_id username').lean();
  if (!referrer) {
    const err = new Error('Mã giới thiệu không tồn tại');
    err.statusCode = 400;
    throw err;
  }

  // 2. Chống Self-Referral: Không cho phép tự nhập mã của chính mình
  if (referrer._id.toString() === referredUserId.toString()) {
    const err = new Error('Bạn không thể sử dụng mã giới thiệu của chính mình');
    err.statusCode = 400;
    throw err;
  }

  // 3. Chống Multiple Referrers / Duplicate Claim
  const existingReferral = await Referral.findOne({ referredUserId }).select('_id').lean();
  if (existingReferral) {
    const err = new Error('Tài khoản của bạn đã được liên kết mã giới thiệu trước đó');
    err.statusCode = 400;
    throw err;
  }

  // 4. Tạo bản ghi Referral trong DB và thưởng +$1.00 trực tiếp
  const now = new Date();
  const rewardAmount = REFERRAL_REWARD_AMOUNT;

  const referral = await Referral.create({
    referrerId: referrer._id,
    referredUserId,
    referralCode: cleanCode,
    status: 'REWARDED',
    requiredAds: 0,
    completedAds: 0,
    rewardAmount,
    qualifiedAt: now,
    rewardedAt: now,
  });

  // 5. Cập nhật thông tin referredBy trên User
  await User.findByIdAndUpdate(referredUserId, { referredBy: referrer._id });

  // 6. Cộng +$1.00 TRỰC TIẾP vào tài khoản người giới thiệu
  await User.findByIdAndUpdate(referrer._id, {
    $inc: { balance: rewardAmount, totalEarned: rewardAmount },
    $set: { lastRewardAt: now },
  });

  // 7. Ghi nhận giao dịch thưởng Mời bạn bè
  const transaction = await RewardTransaction.create({
    userId: referrer._id,
    amount: rewardAmount,
    type: 'REFERRAL_REWARD',
    status: 'COMPLETED',
    metadata: {
      note: `Thưởng mời bạn bè +$1.00 từ người dùng ID ${referredUserId}`,
      referralId: referral._id,
    },
  });

  referral.rewardTransactionId = transaction._id;
  await referral.save();

  return referral;
};

/**
 * Kiểm tra và kích hoạt phần thưởng Referral sau khi người được giới thiệu xem quảng cáo
 */
export const checkAndQualifyReferral = async (referredUserId) => {
  try {
    // Tìm referral record đang ở trạng thái REGISTERED của user này
    const referral = await Referral.findOne({
      referredUserId,
      status: 'REGISTERED',
    });

    if (!referral) {
      return null;
    }

    // Tăng số quảng cáo đã xem lên 1
    referral.completedAds += 1;

    // Kiểm tra nếu chưa đủ điều kiện
    if (referral.completedAds < referral.requiredAds) {
      await referral.save();
      return referral;
    }

    // Đã đủ số quảng cáo xem tối thiểu -> Tiến hành chuyển trạng thái QUALIFIED Atomic
    // Sử dụng findOneAndUpdate với điều kiện status: 'REGISTERED' để đảm bảo Concurrency Safety khi có nhiều request đồng thời
    const now = new Date();
    const qualifiedReferral = await Referral.findOneAndUpdate(
      { _id: referral._id, status: 'REGISTERED' },
      {
        $set: {
          completedAds: referral.completedAds,
          status: 'QUALIFIED',
          qualifiedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!qualifiedReferral) {
      // Đã có request khác chuyển trạng thái trước đó
      return null;
    }

    // Ghi sổ Ledger Transaction cho người giới thiệu (referrerId)
    // Dùng unique idempotencyKey để chống nhân bản giao dịch ở mức database constraint
    const idempotencyKey = `referral_reward_${qualifiedReferral._id}`;
    const rewardAmount = qualifiedReferral.rewardAmount || REFERRAL_REWARD_AMOUNT;

    let transaction = null;
    try {
      transaction = await RewardTransaction.create({
        userId: qualifiedReferral.referrerId,
        amount: rewardAmount,
        type: 'REFERRAL_REWARD',
        idempotencyKey,
        status: 'COMPLETED',
        metadata: {
          note: `Phần thưởng mời bạn bè từ người dùng ID ${referredUserId}`,
          referralId: qualifiedReferral._id,
        },
      });
    } catch (err) {
      // Nếu đã tạo transaction trước đó (Duplicate Key Error code 11000)
      if (err.code === 11000) {
        return qualifiedReferral;
      }
      throw err;
    }

    // Atomic update cộng tiền cho người giới thiệu
    await User.findByIdAndUpdate(qualifiedReferral.referrerId, {
      $inc: { balance: rewardAmount, totalEarned: rewardAmount },
      $set: { lastRewardAt: now },
    });

    // Cập nhật trạng thái Referral sang REWARDED
    qualifiedReferral.status = 'REWARDED';
    qualifiedReferral.rewardTransactionId = transaction._id;
    qualifiedReferral.rewardedAt = now;
    await qualifiedReferral.save();

    return qualifiedReferral;
  } catch (error) {
    console.error(`[Referral Qualification Error] User ${referredUserId}:`, error);
    return null;
  }
};
