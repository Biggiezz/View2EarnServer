import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'referrerId là bắt buộc'],
      index: true,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'referredUserId là bắt buộc'],
      unique: true,
      index: true,
    },
    referralCode: {
      type: String,
      required: [true, 'referralCode là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'REGISTERED', 'QUALIFIED', 'REWARDED', 'REJECTED', 'EXPIRED'],
      default: 'REGISTERED',
      index: true,
    },
    requiredAds: {
      type: Number,
      default: 5,
    },
    completedAds: {
      type: Number,
      default: 0,
    },
    rewardAmount: {
      type: Number,
      default: 1.00,
    },
    rewardTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RewardTransaction',
      default: null,
    },
    qualifiedAt: {
      type: Date,
      default: null,
    },
    rewardedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Index cho query danh sách referral của người giới thiệu
referralSchema.index({ referrerId: 1, createdAt: -1 });
referralSchema.index({ referrerId: 1, status: 1 });

const Referral = mongoose.model('Referral', referralSchema);

export default Referral;
