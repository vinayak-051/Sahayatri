-- =============================================================================
-- Admin tools: dashboard totals computed in the database (instead of the
-- browser downloading whole tables), and audited moderation of guide reviews
-- (public.reviews) and spot reviews (public.location_reviews).
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Overview totals for the admin dashboard, in one call. Admin accounts are not
-- counted as travellers or guides. Money, in rupees:
--   gross_booking_value        full amount of completed trips. Most of it is
--                              the guides' money, so it is not revenue.
--   commission_revenue         platform commission from guide_ledger. It is
--                              stored there as a negative debit; reported here
--                              as a positive number.
--   cancellation_fees          fees kept from late cancellations. They never
--                              reach guide_ledger (see the payments section of
--                              the baseline migration).
--   platform_revenue           commission_revenue + cancellation_fees.
--   outstanding_guide_balances what the platform still owes guides: the sum of
--                              every positive guide_ledger balance.
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_users record;
  v_bookings record;
  v_commission numeric;
  v_outstanding numeric;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select count(*) filter (where p.role = 'traveler')                  as travelers,
         count(*) filter (where p.role = 'guide')                     as guides,
         count(*) filter (where p.role = 'guide' and p.is_verified)   as verified_guides
    into v_users
    from public.profiles p
   where not p.is_admin
     and not exists (select 1 from public.admin_lookup a where a.user_id = p.id);

  select count(*)                                                     as total,
         count(*) filter (where status = 'pending')                   as pending,
         count(*) filter (where status = 'accepted')                  as accepted,
         count(*) filter (where status = 'confirmed')                 as confirmed,
         count(*) filter (where status = 'completed')                 as completed,
         count(*) filter (where status = 'declined')                  as declined,
         count(*) filter (where status = 'cancelled')                 as cancelled,
         coalesce(sum(amount) filter (where status = 'completed'), 0) as gross_value,
         coalesce(sum(cancellation_fee) filter (where status = 'cancelled'), 0) as cancellation_fees
    into v_bookings
    from public.bookings;

  select coalesce(-sum(amount), 0) into v_commission
    from public.guide_ledger
   where type = 'commission';

  select coalesce(sum(balance), 0) into v_outstanding
    from (select sum(amount) as balance from public.guide_ledger group by guide_id) balances
   where balance > 0;

  return jsonb_build_object(
    'travelers',             v_users.travelers,
    'guides',                v_users.guides,
    'verified_guides',       v_users.verified_guides,
    'bookings', jsonb_build_object(
      'total',     v_bookings.total,
      'pending',   v_bookings.pending,
      'accepted',  v_bookings.accepted,
      'confirmed', v_bookings.confirmed,
      'completed', v_bookings.completed,
      'declined',  v_bookings.declined,
      'cancelled', v_bookings.cancelled
    ),
    'buddy_trips',           (select count(*) from public.buddy_trips),
    'open_reports',          (select count(*) from public.reports where status = 'open'),
    'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'gross_booking_value',        v_bookings.gross_value,
    'commission_revenue',         v_commission,
    'cancellation_fees',          v_bookings.cancellation_fees,
    'platform_revenue',           v_commission + v_bookings.cancellation_fees,
    'outstanding_guide_balances', v_outstanding
  );
end $$;

revoke all on function public.admin_overview_stats() from public, anon;
grant execute on function public.admin_overview_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- Review moderation. p_kind is 'guide' (public.reviews) or 'spot'
-- (public.location_reviews). The audit row keeps what was removed, who wrote
-- it and why. The existing rating triggers (sync_guide_rating,
-- sync_location_rating) re-compute the average after the delete.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_review(p_kind text, p_review_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_target_id uuid;
  v_target_name text;
  v_reviewer_id uuid;
  v_rating int;
  v_comment text;
  v_created_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('guide', 'spot') then
    raise exception 'Review kind must be guide or spot' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for removing this review' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;

  if p_kind = 'guide' then
    delete from public.reviews where id = p_review_id
    returning guide_id, reviewer_id, rating, comment, created_at
         into v_target_id, v_reviewer_id, v_rating, v_comment, v_created_at;
  else
    delete from public.location_reviews where id = p_review_id
    returning location_id, reviewer_id, rating, comment, created_at
         into v_target_id, v_reviewer_id, v_rating, v_comment, v_created_at;
  end if;

  if not found then
    raise exception 'Review not found. It may already have been removed.';
  end if;

  if p_kind = 'guide' then
    select name into v_target_name from public.profiles where id = v_target_id;
  else
    select title into v_target_name from public.locations where id = v_target_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_id, details)
  values (auth.uid(), 'delete_review', p_review_id, jsonb_build_object(
    'kind',              p_kind,
    'target_id',         v_target_id,
    'target_name',       v_target_name,
    'reviewer_id',       v_reviewer_id,
    'reviewer_name',     (select name from public.profiles where id = v_reviewer_id),
    'rating',            v_rating,
    'comment',           v_comment,
    'review_created_at', v_created_at,
    'reason',            v_reason
  ));
end $$;

revoke all on function public.admin_delete_review(text, uuid, text) from public, anon;
grant execute on function public.admin_delete_review(text, uuid, text) to authenticated;

-- Admins could delete spot reviews directly, which left no audit trail. Every
-- review deletion now goes through admin_delete_review.
drop policy if exists "location_reviews_delete_admin" on public.location_reviews;

-- The Reviews tab lists the newest reviews first.
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists location_reviews_created_at_idx on public.location_reviews (created_at desc);

notify pgrst, 'reload schema';
