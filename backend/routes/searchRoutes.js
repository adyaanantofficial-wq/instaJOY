/**
 * Search Routes
 */

const express = require('express');
const searchController = require('../controllers/searchController');

const router = express.Router();

router.get('/users', searchController.searchUsers);
router.get('/posts', searchController.searchPosts);

module.exports = router;
