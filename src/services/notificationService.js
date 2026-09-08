import { EventEmitter } from 'events';

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.recentNotifications = [];
  }

  notifyNewWithdrawal(withdrawalData) {
    // Lưu lại 20 thông báo gần nhất trong bộ nhớ
    this.recentNotifications.unshift({
      ...withdrawalData,
      id: withdrawalData.id || Date.now().toString(),
      timestamp: new Date().toISOString(),
    });
    if (this.recentNotifications.length > 20) {
      this.recentNotifications.pop();
    }

    this.emit('new_withdrawal', withdrawalData);
  }

  getRecentNotifications() {
    return this.recentNotifications;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
