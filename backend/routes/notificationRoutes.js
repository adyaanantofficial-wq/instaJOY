/**
 * Notification Routes
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.get('/', protect, notificationController.getNotifications);
router.post('/:notificationId/read', protect, notificationController.markAsRead);
router.delete('/:notificationId', protect, notificationController.deleteNotification);

module.exports = router;
