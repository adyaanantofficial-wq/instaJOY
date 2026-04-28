/**
 * Message Routes
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

const router = express.Router();

router.post('/send', protect, messageController.sendMessage);
router.get('/:userId', protect, messageController.getMessages);
router.get('/list/all', protect, messageController.getConversations);

module.exports = router;
