import mongoose from 'mongoose';

const adSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId là bắt buộc'],
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId là bắt buộc'],
      index: true,
    },
    placementId: {
      type: String,
      default: 'rewarded_video_default',
    },
    rewardAmount: {
      type: Number,
      required: true,
      default: 0.5,
    },
    status: {
      type: String,
      enum: ['STARTED', 'COMPLETED', 'REWARDED', 'EXPIRED', 'INVALID'],
      default: 'STARTED',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    ip: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Tự động xóa các session cũ sau 48 giờ để tiết kiệm dung lượng database
adSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

// Compound index phục vụ kiểm tra trạng thái active session của user
adSessionSchema.index({ userId: 1, status: 1 });

const AdSession = mongoose.model('AdSession', adSessionSchema);

export default AdSession;
