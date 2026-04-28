const express = require('express');

const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, notificationController.getNotifications);
router.post('/read-all', protect, notificationController.markAllAsRead);
router.post('/:notificationId/read', protect, notificationController.markAsRead);
router.delete('/:notificationId', protect, notificationController.deleteNotification);

module.exports = router;
