/**
 * Post Controller
 */

const Post = require('../models/Post');
const User = require('../models/User');

/**
 * Create new post
 * POST /api/posts/create
 */
exports.createPost = async (req, res, next) => {
    try {
        const { caption, image } = req.body;
        const userId = req.user.userId;

        if (!image && !caption) {
            return res.status(400).json({
                success: false,
                message: 'Post must have either image or caption',
            });
        }

        if (caption && caption.length > 2200) {
            return res.status(400).json({
                success: false,
                message: 'Caption too long (max 2200 characters)',
            });
        }

        // Validate image size if provided
        if (image && image.length > 5242880) {
            return res.status(400).json({
                success: false,
                message: 'Image too large (max 5MB)',
            });
        }

        const post = new Post({
            author: userId,
            caption,
            image,
        });

        await post.save();

        // Increment user's post count
        await User.findByIdAndUpdate(userId, {
            $inc: { postsCount: 1 },
        });

        // Populate author before responding
        await post.populate('author', 'username profileImage bio');

        res.status(201).json({
            success: true,
            message: 'Post created',
            post,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get feed (posts from followed users)
 * GET /api/posts/feed?page=1&limit=10
 */
exports.getFeed = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const user = await User.findById(userId);

        // Get posts from followed users and own posts
        const posts = await Post.find({
            $or: [
                { author: userId },
                { author: { $in: user.following } },
            ],
            isActive: true,
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            posts,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get posts by user
 * GET /api/posts/user/:username
 */
exports.getPostsByUser = async (req, res, next) => {
    try {
        const { username } = req.params;

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const posts = await Post.find({
            author: user._id,
            isActive: true,
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            posts,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete post
 * DELETE /api/posts/:postId
 */
exports.deletePost = async (req, res, next) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        // Check authorization
        if (post.author.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this post',
            });
        }

        await Post.findByIdAndDelete(postId);

        // Decrement user's post count
        await User.findByIdAndUpdate(userId, {
            $inc: { postsCount: -1 },
        });

        res.status(200).json({
            success: true,
            message: 'Post deleted',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Like post
 * POST /api/posts/:postId/like
 */
exports.likePost = async (req, res, next) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;

        const post = await Post.findByIdAndUpdate(
            postId,
            { $addToSet: { likes: userId } },
            { new: true }
        );

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Post liked',
            likes: post.likes,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Unlike post
 * POST /api/posts/:postId/unlike
 */
exports.unlikePost = async (req, res, next) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;

        const post = await Post.findByIdAndUpdate(
            postId,
            { $pull: { likes: userId } },
            { new: true }
        );

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Post unliked',
            likes: post.likes,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get comments on post
 * GET /api/posts/:postId/comments
 */
exports.getComments = async (req, res, next) => {
    try {
        const { postId } = req.params;

        const post = await Post.findById(postId).populate('comments.author', 'username profileImage');

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        res.status(200).json({
            success: true,
            comments: post.comments,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Add comment to post
 * POST /api/posts/:postId/comment
 */
exports.addComment = async (req, res, next) => {
    try {
        const { postId } = req.params;
        const { text } = req.body;
        const userId = req.user.userId;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Comment cannot be empty',
            });
        }

        if (text.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Comment too long (max 500 characters)',
            });
        }

        const post = await Post.findByIdAndUpdate(
            postId,
            {
                $push: {
                    comments: {
                        author: userId,
                        text,
                    },
                },
            },
            { new: true }
        ).populate('comments.author', 'username profileImage');

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        res.status(201).json({
            success: true,
            message: 'Comment added',
            comments: post.comments,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete comment from post
 * DELETE /api/posts/:postId/comment/:commentId
 */
exports.deleteComment = async (req, res, next) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.user.userId;

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found',
            });
        }

        const comment = post.comments.id(commentId);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'Comment not found',
            });
        }

        // Check authorization
        if (comment.author.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this comment',
            });
        }

        post.comments.id(commentId).deleteOne();
        await post.save();

        res.status(200).json({
            success: true,
            message: 'Comment deleted',
        });
    } catch (error) {
        next(error);
    }
};
