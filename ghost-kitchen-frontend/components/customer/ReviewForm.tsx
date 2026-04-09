import { useState } from "react";
import { api } from "@/lib/api";
import { Star } from "lucide-react";

interface ReviewFormProps {
  orderId: string;
  onReviewSubmitted?: () => void;
}

export default function ReviewForm({ orderId, onReviewSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!rating) {
      setError("Please select a rating");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await api.post("/reviews/create", {
        orderId,
        rating,
        comment: comment || null,
      });

      setSuccess(true);
      setRating(0);
      setComment("");
      
      setTimeout(() => {
        onReviewSubmitted?.();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <p className="text-green-700 font-medium">Thank you for your review! ⭐</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Rate your order</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
              className="focus:outline-none transition-transform hover:scale-110"
            >
              <Star
                className={`h-8 w-8 ${
                  star <= (hoverRating || rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">
          Add a comment (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
          rows={3}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !rating}
        className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 font-medium transition"
      >
        {loading ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}
