// Hand-written types mirroring supabase/migrations/0001_init.sql.
// If the schema changes, update this file (or regenerate with the
// Supabase CLI: `supabase gen types typescript`).

export type Role = "traveler" | "guide";
export type LocationStatus = "active" | "draft" | "archived";
export type SafetyLevel = "high" | "moderate" | "low";
export type Difficulty = "easy" | "moderate" | "hard";
export type BookingStatus = "pending" | "accepted" | "confirmed" | "declined" | "completed" | "cancelled";
export type FinalPaymentMode = "online" | "cash";
export type BuddyRequestStatus = "pending" | "accepted" | "rejected";
export type ReportStatus = "open" | "reviewed" | "dismissed";
export type NotificationType = "booking_requested" | "booking_accepted" | "booking_declined" | "booking_advance_paid" | "booking_cancelled" | "new_message";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  profile_photo_url: string | null;
  city: string | null;
  additional_cities: string[];
  languages: string[];
  specialization: string | null;
  bio: string | null;
  rating: number;
  rate_per_day: number | null;
  is_available: boolean;
  is_verified: boolean;
  is_admin: boolean;
  is_banned: boolean;
  onboarded: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  title: string;
  short_description: string;
  detailed_content: string;
  lat: number;
  lng: number;
  category: string;
  tags: string[];
  best_visiting_time: string | null;
  pricing: string | null;
  price_per_person: number | null;
  timings: string | null;
  safety_level: SafetyLevel;
  difficulty: Difficulty;
  guide_id: string;
  photos: string[];
  videos: string[];
  rating: number;
  reviews_count: number;
  status: LocationStatus;
  saves_count: number;
  views_count: number;
  created_at: string;
  updated_at: string;
  guide?: Pick<Profile, "id" | "name" | "profile_photo_url" | "city" | "rating" | "is_available" | "is_verified">;
}

export interface Booking {
  id: string;
  traveler_id: string;
  guide_id: string;
  destination: string;
  date: string;
  people: number;
  amount: number;
  status: BookingStatus;
  final_payment_mode: FinalPaymentMode | null;
  cancellation_fee: number;
  feedback: string;
  created_at: string;
  traveler?: Pick<Profile, "id" | "name" | "profile_photo_url">;
  guide?: Pick<Profile, "id" | "name" | "profile_photo_url" | "city">;
}

export interface BuddyTrip {
  id: string;
  user_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: string | null;
  description: string | null;
  created_at: string;
  user?: Pick<Profile, "id" | "name" | "profile_photo_url">;
}

export interface BuddyRequest {
  id: string;
  trip_id: string;
  traveler_id: string;
  status: BuddyRequestStatus;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  guide_id: string;
  reviewer_id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer?: Pick<Profile, "id" | "name" | "role" | "profile_photo_url">;
}

export interface LocationReview {
  id: string;
  location_id: string;
  reviewer_id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer?: Pick<Profile, "id" | "name" | "role" | "profile_photo_url">;
}

export interface SavedLocation {
  user_id: string;
  location_id: string;
  created_at: string;
  location?: Location;
}

export interface Report {
  id: string;
  location_id: string;
  reported_by: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  created_at: string;
}

export type VerificationStatus = "pending" | "approved" | "rejected";
export type VerificationDocumentType = "aadhaar" | "driving_license" | "passport" | "voter_id" | "other";

export interface VerificationRequest {
  id: string;
  guide_id: string;
  document_type: VerificationDocumentType;
  document_path: string;
  status: VerificationStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  guide?: Pick<Profile, "id" | "name" | "email" | "city" | "profile_photo_url">;
}

export interface GuideRatingStats {
  guide_id: string;
  reviews_count: number;
  avg_rating: number;
}

// Named AppNotification to avoid colliding with the DOM Notification type.
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}
