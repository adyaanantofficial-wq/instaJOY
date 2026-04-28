/**
 * Post Model
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        text: {
            type: String,
            required: [true, 'Comment cannot be empty'],
            maxlength: 500,
            trim: true,
        },
    },
    { timestamps: true }
);

const postSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        caption: {
            type: String,
            maxlength: 2200,
            default: '',
        },
        image: {
            type: String,
            required: [true, 'Post must have an image or caption'],
        },
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        comments: [commentSchema],
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    }
);

// Index for faster queries
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ likes: 1 });
postSchema.index({ 'comments.author': 1 });

// Virtual for like count
postSchema.virtual('likeCount').get(function () {
    return this.likes.length;
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function () {
    return this.comments.length;
});

// Populate author on find
postSchema.pre(/^find/, function () {
    this.populate({
        path: 'author',
        select: 'username profileImage bio',
    }).populate({
        path: 'likes',
        select: '_id',
    }).populate({
        path: 'comments.author',
        select: 'username profileImage',
    });
});

module.exports = mongoose.model('Post', postSchema);
