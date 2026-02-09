import { mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';

/**
 * File Uploads
 *
 * Handles file and image uploads for multimodal chat support.
 * Uses Convex file storage for secure, scalable storage.
 */

// Generate a presigned URL for file upload
export const generateUploadUrl = mutation({
  args: {
    fileType: v.string(),
    fileName: v.optional(v.string()),
  },
  returns: v.object({
    uploadUrl: v.string(),
    uploadToken: v.string(),
  }),
  handler: async (ctx, args) => {
    // Generate presigned URL for upload
    const uploadUrl = await ctx.storage.generateUploadUrl();

    // Extract token from URL for tracking (not the storage ID yet)
    const tokenMatch = uploadUrl.match(/token=([^&]+)/);
    const uploadToken = tokenMatch ? tokenMatch[1] : uploadUrl;

    // Store file metadata with token (will be updated with actual storageId after upload)
    await ctx.db.insert('fileUploads', {
      uploadToken: uploadToken,
      fileType: args.fileType,
      fileName: args.fileName,
      uploadedAt: Date.now(),
      status: 'pending',
    });

    return { uploadUrl, uploadToken };
  },
});

// Mark file upload as complete
export const markComplete = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query('fileUploads')
      .withIndex('by_token', (q) => q.eq('uploadToken', args.uploadToken))
      .first();

    if (file) {
      const updateData: any = {
        status: 'complete',
        updatedAt: Date.now(),
      };
      if (args.storageId) {
        updateData.storageId = args.storageId;
      }
      await ctx.db.patch(file._id, updateData);
    }
  },
});

// Get file URL by upload token
export const getFileUrlByToken = mutation({
  args: {
    uploadToken: v.string(),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query('fileUploads')
      .withIndex('by_token', (q) => q.eq('uploadToken', args.uploadToken))
      .first();
    
    if (!file?.storageId) {
      return null;
    }
    
    try {
      return await ctx.storage.getUrl(file.storageId);
    } catch {
      return null;
    }
  },
});

// Get file URL by storage ID
export const getFileUrl = mutation({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    try {
      return await ctx.storage.getUrl(args.storageId);
    } catch {
      return null;
    }
  },
});

// Get file metadata
export const getMetadata = mutation({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('fileUploads')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .first();
  },
});

// Delete file
export const remove = mutation({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    // Delete from storage
    await ctx.storage.delete(args.storageId);
    
    // Delete metadata record
    const file = await ctx.db
      .query('fileUploads')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .first();
    
    if (file) {
      await ctx.db.delete(file._id);
    }
  },
});

// Cleanup old pending uploads (called by cron)
export const cleanupPending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const pendingFiles = await ctx.db
      .query('fileUploads')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .filter((q) => q.lt(q.field('uploadedAt'), oneHourAgo))
      .take(100);

    for (const file of pendingFiles) {
      // Delete from storage if it exists and has storageId
      if (file.storageId) {
        try {
          await ctx.storage.delete(file.storageId);
        } catch {
          // Ignore errors (file might not exist)
        }
      }

      // Delete metadata
      await ctx.db.delete(file._id);
    }

    return { cleaned: pendingFiles.length };
  },
});
