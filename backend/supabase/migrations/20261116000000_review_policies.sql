-- =============================================================================
-- Guide reviews: only travellers with a completed trip may review a guide.
--
-- Production carried an extra permissive policy from an older migration,
-- reviews_insert_as_traveler, which let any traveller review any guide. Because
-- permissive policies are OR'ed, it bypassed reviews_insert_completed_booking.
-- Found by comparing production's pg_policies with the tested migrations.
--
-- Converge on exactly one permissive INSERT policy on reviews, whatever earlier
-- installs called theirs, and block banned users like the other tables do.
-- Safe to re-run.
-- =============================================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'reviews' and cmd = 'INSERT'
              and permissive = 'PERMISSIVE' and policyname <> 'reviews_insert_completed_booking'
  loop
    execute format('drop policy %I on public.reviews', p.policyname);
  end loop;
end $$;

drop policy if exists "reviews_insert_completed_booking" on public.reviews;
create policy "reviews_insert_completed_booking" on public.reviews
  for insert with check (
    reviewer_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
       where b.traveler_id = (select auth.uid())
         and b.guide_id = reviews.guide_id
         and b.status = 'completed'
    )
  );

drop policy if exists "reviews_deny_banned" on public.reviews;
create policy "reviews_deny_banned" on public.reviews
  as restrictive for insert with check (not (select public.is_banned()));
