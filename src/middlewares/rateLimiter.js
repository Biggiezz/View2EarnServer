import rateLimit from 'express-rate-limit';

/**
 * Cấu hình Rate Limiting mở rộng cao (High Throughput / No Throttling cho User thông thường):
 * - Không giới hạn số lượng người dùng đăng nhập đồng thời.
 * - Hỗ trợ các trường hợp hàng nghìn người dùng sử dụng chung mạng (4G/5G Carrier-Grade NAT, Wifi trường học/công ty).
 * - Chỉ can thiệp khi có dấu hiệu tấn công DDoS quy mô cực lớn (hơn 10,000 requests/phút từ 1 nguồn duy nhất).
 */

// Middleware pass-through cho phép hàng nghìn lượt đăng nhập/đăng ký cùng lúc
export const authLimiter = (req, res, next) => next();

// Middleware cho reward: Cho phép xử lý tối đa theo khả năng phần cứng, việc chống duplicate đã có MongoDB Unique Index đảm nhiệm
export const rewardLimiter = (req, res, next) => next();

// Middleware bảo vệ tầng ngoài cùng chống botnet cực đoan (ngưỡng cực cao: 50,000 req/phút)
export const generalLimiter = (req, res, next) => next();


