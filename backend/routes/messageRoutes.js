const express = require('express');

const messageController = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', protect, messageController.getConversations);
router.get('/:userId', protect, messageController.getMessages);
router.post('/', protect, messageController.sendMessage);

module.exports = router;
