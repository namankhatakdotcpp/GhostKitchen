"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, ImageIcon, RefreshCw } from "lucide-react";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Drop-in replacement for a plain URL <input>.
 * Features: file picker, drag-and-drop, preview, progress bar, retry on
 * failure, deletion of replaced uploads, and graceful fallback to URL input
 * when the server has no Cloudinary configured (503).
 */
export default function ImageUpload({
  value,
  onChange,
  folder = "ghostkitchen",
  className = "",
  disabled = false,
}: ImageUploadProps) {
  const [progress, setProgress] = useState<number | null>(null); // 0–100 or null
  const [error, setError] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null); // for retry
  const [supportsUpload, setSupportsUpload] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);

  // Track the Cloudinary publicId of the currently displayed uploaded image so
  // we can delete it from storage when the user replaces it.
  const uploadedPublicId = useRef<string | null>(null);

  const getToken = (): string | null => {
    try {
      const raw = localStorage.getItem("auth-storage");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.state?.token ?? null;
    } catch {
      return null;
    }
  };

  const deleteFromCloudinary = async (publicId: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/upload/image`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicId }),
      });
    } catch { /* non-fatal — orphaned assets are acceptable, no UX impact */ }
  };

  const uploadFile = useCallback(async (file: File) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError("Only JPEG, PNG, WebP, or GIF images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }

    setError("");
    setLastFile(file);
    setProgress(0);

    const token = getToken();
    const form = new FormData();
    form.append("file", file);

    // Use XHR instead of fetch so we get granular upload progress events
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/upload/image?folder=${folder}`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        setProgress(null);
        if (xhr.status === 503) {
          setSupportsUpload(false);
          resolve();
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            // Track the previously uploaded (not yet DB-saved) publicId so we
            // can clean it up when the user explicitly removes the image.
            // We do NOT delete it here — the parent's DB save hasn't happened
            // yet, so deleting the old asset now could leave the DB pointing
            // at a Cloudinary asset that no longer exists if the save fails.
            // Orphaned session-uploads are cleaned up on explicit Remove only.
            uploadedPublicId.current = data.publicId ?? null;
            setSupportsUpload(true);
            onChange(data.url);
          } catch {
            setError("Upload failed: unexpected server response.");
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            setError(data.error ?? "Upload failed. Please try again.");
          } catch {
            setError("Upload failed. Please try again.");
          }
        }
        resolve();
      };

      xhr.onerror = () => {
        setProgress(null);
        setError("Network error. Check your connection and try again.");
        resolve();
      };

      xhr.send(form);
    });
  }, [folder, onChange]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleRemove = () => {
    if (uploadedPublicId.current) {
      deleteFromCloudinary(uploadedPublicId.current);
      uploadedPublicId.current = null;
    }
    onChange("");
    setError("");
    setLastFile(null);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;

  // If server doesn't support upload, render a plain URL text input
  if (supportsUpload === false) {
    return (
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        disabled={disabled}
        className={`w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none ${className}`}
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {value ? (
        <div className="relative h-40 w-full overflow-hidden rounded-xl border border-border">
          <Image src={value} alt="Preview" fill className="object-cover" unoptimized />
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition
            ${dragging ? "border-brand bg-brand/5" : "border-border hover:border-brand/50 bg-[#FAFAFA]"}
            ${disabled || uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
          `}
        >
          {uploading ? (
            <div className="flex w-48 flex-col items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <div className="w-full">
                <div className="mb-1 flex justify-between text-xs text-text-secondary">
                  <span>Uploading…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <p className="text-sm font-medium text-red-600">{error}</p>
              {lastFile && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); uploadFile(lastFile); }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setError(""); inputRef.current?.click(); }}
                className="text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                Choose different file
              </button>
            </div>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
                <ImageIcon className="h-5 w-5 text-brand" />
              </div>
              <p className="text-sm font-medium text-text-primary">Drop an image here</p>
              <p className="text-xs text-text-secondary">or click to browse · JPEG, PNG, WebP · max 5 MB</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand/50 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Choose file
              </button>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onFileChange}
        className="sr-only"
        disabled={disabled || uploading}
      />

      {/* URL fallback — always shown below so admins can paste a URL if needed */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-secondary">or paste URL</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        disabled={disabled}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />
    </div>
  );
}
