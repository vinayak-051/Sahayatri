// Hand-written types mirroring supabase/migrations/0001_init.sql.
// If the schema changes, update this file (or regenerate with the
// Supabase CLI: `supabase gen types typescript`).

export type Role = "traveler" | "guide";
export type LocationStatus = "active" | "draft" | "archived";
export type SafetyLevel = "high" | "moderate" | "low";
export type Difficulty = "easy" | "moderate" | "hard";
export type BookingStatus = "pending" | "accepted" | "declined" | "completed" | "cancelled";
export type BuddyRequestStatus = "pending" | "accepted" | "rejected";
export type ReportStatus = "open" | "reviewed" | "dismissed";

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
  guide?: Pick<Profile, "id" | "name" | "profile_photo_url" | "city" | "rating" | "is_available">;
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

export interface Report {
  id: string;
  location_id: string;
  reported_by: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  created_at: string;
}

export interface GuideRatingStats {
  guide_id: string;
  reviews_count: number;
  avg_rating: number;
}
