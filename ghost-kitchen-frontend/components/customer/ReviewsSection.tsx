import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Review {
  id: string;
  rating: number;
  comment: string;
  userName: string;
  createdAt: string;
}

interface ReviewsSectionProps {
  restaurantId: string;
}

export default function ReviewsSection({ restaurantId }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, [restaurantId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/reviews/restaurant/${restaurantId}`);
      setReviews(response.data.reviews);
      setAvgRating(response.data.averageRating);
      setTotalReviews(response.data.totalReviews);
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading reviews...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`h-5 w-5 ${
                i < Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
              }`}
            />
          ))}
        </div>
        <div>
          <p className="font-semibold">{avgRating.toFixed(1)} out of 5</p>
          <p className="text-sm text-gray-600">{totalReviews} reviews</p>
        </div>
      </div>

      {totalReviews === 0 ? (
        <p className="text-center py-4 text-gray-500">No reviews yet. Be the first to review!</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {reviews.map((review) => (
            <div key={review.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-500">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              {review.comment && <p className="text-sm mt-2">{review.comment}</p>}
              <p className="text-xs text-gray-500 mt-2">by {review.userName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
