import express from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { uploadImage } from "./upload.controller.js";

const router = express.Router();

// Store file in memory — passed to Cloudinary as a buffer. 5 MB limit enforced
// both here (to reject early before the buffer grows) and in the controller.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Authentication required — only logged-in users (restaurants, admins) may upload.
router.post("/image", authenticate, upload.single("file"), uploadImage);

export default router;
