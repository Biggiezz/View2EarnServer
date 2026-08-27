import mongoose from 'mongoose';

const rewardTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId là bắt buộc'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Số tiền thưởng là bắt buộc'],
      min: [0.0001, 'Số tiền thưởng phải lớn hơn 0'],
    },
    type: {
      type: String,
      enum: ['AD_REWARD', 'DAILY_BONUS', 'REFERRAL_REWARD', 'PROMO_CODE', 'ADMIN_ADJUSTMENT'],
      default: 'AD_REWARD',
      index: true,
    },
    adSessionId: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'FAILED', 'REVERSED'],
      default: 'COMPLETED',
      index: true,
    },
    balanceBefore: {
      type: Number,
      default: 0,
    },
    balanceAfter: {
      type: Number,
      default: 0,
    },
    metadata: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
      placementId: { type: String, default: '' },
      note: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Compound Index cho pagination nhanh chóng theo user và thời gian
rewardTransactionSchema.index({ userId: 1, createdAt: -1 });

// Unique Index với PartialFilterExpression trên adSessionId (chỉ index khi là string)
rewardTransactionSchema.index(
  { adSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { adSessionId: { $type: 'string' } },
    name: 'unique_adSessionId_idx',
  }
);

// Unique Index với PartialFilterExpression trên idempotencyKey (chỉ index khi là string)
rewardTransactionSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    name: 'unique_idempotencyKey_idx',
  }
);

const RewardTransaction = mongoose.model('RewardTransaction', rewardTransactionSchema);

export default RewardTransaction;

