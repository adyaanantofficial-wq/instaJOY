const express = require('express');

const searchController = require('../controllers/searchController');
const { optionalAuth, protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, searchController.searchAll);
router.get('/users', protect, searchController.searchUsers);
router.get('/posts', optionalAuth, searchController.searchPosts);

module.exports = router;
