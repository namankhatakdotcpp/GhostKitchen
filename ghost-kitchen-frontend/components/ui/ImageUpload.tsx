"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, ImageIcon } from "lucide-react";
import { api } from "@/lib/api";

interface ImageUploadProps {
  value: string;         // current image URL (from DB or previously uploaded)
  onChange: (url: string) => void;
  folder?: string;       // Cloudinary folder name
  className?: string;
  disabled?: boolean;
}

/**
 * Drop-in replacement for a plain URL <input>.
 * Supports: file picker, drag-and-drop, preview, remove, and falls back to a
 * plain URL text input when the server has no Cloudinary configured (503).
 */
export default function ImageUpload({ value, onChange, folder = "ghostkitchen", className = "", disabled = false }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [supportsUpload, setSupportsUpload] = useState<boolean | null>(null); // null = unknown
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/upload/image?folder=${folder}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
      setSupportsUpload(true);
    } catch (err: any) {
      if (err.response?.status === 503) {
        // Server has no Cloudinary — degrade to URL input
        setSupportsUpload(false);
        setError("");
      } else {
        setError(err.response?.data?.error ?? "Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  }, [folder, onChange]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  // If server doesn't support upload, render a plain URL text input
  if (supportsUpload === false) {
    return (
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
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
              onClick={() => onChange("")}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition
            ${dragging ? "border-brand bg-brand/5" : "border-border hover:border-brand/50 bg-[#FAFAFA]"}
            ${disabled ? "cursor-not-allowed opacity-50" : ""}
          `}
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              Uploading…
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
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand/50 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Choose file
              </button>
            </>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onFileChange}
        className="sr-only"
        disabled={disabled}
      />

      {/* URL fallback — always shown below the upload zone so admins can paste a URL if needed */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-secondary">or paste URL</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        disabled={disabled}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
