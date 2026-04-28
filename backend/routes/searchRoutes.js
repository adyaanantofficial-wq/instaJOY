const express = require('express');

const searchController = require('../controllers/searchController');
const { optionalAuth, protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, searchController.searchAll);
router.get('/users', optionalAuth, searchController.searchUsers);
router.get('/posts', optionalAuth, searchController.searchPosts);

module.exports = router;
