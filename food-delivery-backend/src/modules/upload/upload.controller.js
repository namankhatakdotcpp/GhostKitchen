import { logger } from "../../utils/logger.js";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.js";

// Cloudinary is optional — if credentials are missing, the upload endpoint
// returns a 503 so callers know to fall back gracefully (e.g. keep URL input).
function isCloudinaryConfigured() {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

/**
 * POST /api/upload/image
 * Accepts a multipart/form-data body with a `file` field.
 * Returns { url: string } — the Cloudinary CDN URL to store in the database.
 * Max file size: 5 MB. Allowed types: image/jpeg, image/png, image/webp.
 */
export const uploadImage = async (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ error: "Image upload is not configured on this server. Please provide an image URL instead." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file provided. Include a file field in your multipart/form-data request." });
  }

  const { mimetype, size, buffer } = req.file;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(mimetype)) {
    return res.status(400).json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed." });
  }
  if (size > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "Image must be under 5 MB." });
  }

  try {
    const folder = req.query.folder || "ghostkitchen";
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          format: "webp",
          quality: "auto",
          // Cap at 1200px wide — enough for all UI sizes, reduces storage+bandwidth
          transformation: [{ width: 1200, crop: "limit" }],
        },
        (err, result) => (err ? reject(err) : resolve(result)),
      );
      stream.end(buffer);
    });

    logger.info("Image uploaded to Cloudinary", { publicId: result.public_id, url: result.secure_url });
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    logger.error("Cloudinary upload failed", { error: err.message });
    res.status(500).json({ error: "Image upload failed. Please try again." });
  }
};

/**
 * DELETE /api/upload/image
 * Body: { publicId: string }
 * Deletes the image from Cloudinary. Called when the user replaces an existing
 * uploaded image so orphaned assets don't accumulate in storage.
 */
export const deleteImage = async (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ error: "Image upload is not configured on this server." });
  }

  const { publicId } = req.body;
  if (!publicId || typeof publicId !== "string") {
    return res.status(400).json({ error: "publicId is required." });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== "ok" && result.result !== "not found") {
      return res.status(500).json({ error: "Failed to delete image." });
    }
    logger.info("Image deleted from Cloudinary", { publicId });
    res.json({ success: true });
  } catch (err) {
    logger.error("Cloudinary delete failed", { error: err.message, publicId });
    res.status(500).json({ error: "Image deletion failed." });
  }
};
