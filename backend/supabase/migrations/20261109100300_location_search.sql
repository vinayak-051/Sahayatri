-- =============================================================================
-- Spot search for Explore: full-text search with prefix matching, category and
-- price filters, relevance or newest-first ordering, keyset pagination and a
-- total match count. Safe to re-run.
-- =============================================================================

-- The search document of a spot. The 'simple' configuration lower-cases words
-- but never stems them, so place names such as Jaipur, Leh or Kochi stay intact.
-- Title and city weigh most (A), then category and tags (B), then the short
-- description (C). A function because array_to_string() is only STABLE, which a
-- generated column does not accept; for text[] it is in fact immutable.
create or replace function public.location_search_document(
  p_title text,
  p_city text,
  p_category text,
  p_tags text[],
  p_short_description text
)
returns tsvector
language sql immutable parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('simple', coalesce(p_title, '') || ' ' || coalesce(p_city, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(p_category, '') || ' ' || coalesce(array_to_string(p_tags, ' '), '')), 'B')
      || setweight(to_tsvector('simple', coalesce(p_short_description, '')), 'C')
$$;

-- Generated columns are computed with the privileges of whoever writes the row,
-- so guides (authenticated) and the seed script (service_role) need EXECUTE.
revoke all on function public.location_search_document(text, text, text, text[], text) from public, anon;
grant execute on function public.location_search_document(text, text, text, text[], text)
  to authenticated, service_role;

alter table public.locations
  add column if not exists search_vector tsvector
  generated always as (public.location_search_document(title, city, category, tags, short_description)) stored;

create index if not exists locations_search_vector_idx on public.locations using gin (search_vector);

-- Turns text typed by a traveller into a prefix query: every word must match the
-- start of a word in the spot ('jai' finds Jaipur). The words are split by the
-- same parser that builds search_vector and each one is quoted, so tsquery
-- syntax in the input (& | ! ( ) : * ' \) is plain text and never an error.
-- At most 8 words of the first 200 characters are used. Returns null when the
-- text contains no searchable words.
create or replace function public.location_search_query(p_query text)
returns tsquery
language sql immutable parallel safe
set search_path = ''
as $$
  select string_agg(
           '''' || replace(replace(w.lexeme, E'\\', E'\\\\'), '''', '''''') || ''':*',
           ' & ' order by w.first_position
         )::tsquery
    from (
      select v.lexeme, v.positions[1] as first_position
        from unnest(to_tsvector('simple', left(coalesce(p_query, ''), 200))) as v
       order by v.positions[1]
       limit 8
    ) as w
$$;

revoke all on function public.location_search_query(text) from public, anon;
grant execute on function public.location_search_query(text) to authenticated, service_role;

-- Active spots of verified, unbanned guides, with the guide's public fields.
--
-- * p_query: free text, prefix-matched per word; blank means "browse".
-- * p_category: exact category, or null for all.
-- * p_min_price is inclusive and p_max_price exclusive, so adjacent price bands
--   never overlap. Spots without a price only appear when no price is given.
-- * Ordered by relevance (rank) when searching, newest first otherwise; ties are
--   broken by created_at and id. rank is 0 when browsing.
-- * Keyset pagination: pass the last row's rank, created_at and id as p_after_*
--   to get the next page. Unlike offsets, pages never repeat or skip spots when
--   spots are added or removed in between.
-- * total_count is the number of spots matching the filters (ignores the cursor).
--
-- SECURITY INVOKER: rows are read through the caller's RLS policies and column
-- grants. Signed-in users only, as guide profiles are hidden from anonymous
-- visitors (profiles_select_guides).
create or replace function public.search_locations(
  p_query text default null,
  p_category text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_after_rank numeric default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  title text,
  short_description text,
  city text,
  category text,
  tags text[],
  photos text[],
  price_per_person numeric,
  rating numeric,
  reviews_count integer,
  created_at timestamptz,
  guide jsonb,
  rank numeric,
  total_count bigint
)
language plpgsql stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_searching boolean := coalesce(btrim(p_query), '') <> '';
  v_query tsquery := public.location_search_query(p_query);
  v_category text := nullif(btrim(p_category), '');
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
begin
  if p_after_id is not null and (p_after_rank is null or p_after_created_at is null) then
    raise exception 'Invalid search cursor' using errcode = '22023';
  end if;
  if v_searching and v_query is null then
    return;   -- only punctuation was typed, so nothing can match
  end if;

  return query
  with matches as (
    select l.id,
           coalesce(l.created_at, '-infinity'::timestamptz) as sort_created_at,
           case when v_searching then round(ts_rank(l.search_vector, v_query)::numeric, 6) else 0 end as rank
      from public.locations l
      join public.profiles p on p.id = l.guide_id
     where l.status = 'active'
       and p.is_verified
       and not p.is_banned
       and (not v_searching or l.search_vector @@ v_query)
       and (v_category is null or l.category = v_category)
       and (p_min_price is null or l.price_per_person >= p_min_price)
       and (p_max_price is null or l.price_per_person < p_max_price)
  ),
  page as (
    select m.id, m.sort_created_at, m.rank
      from matches m
     where p_after_id is null
        or (m.rank, m.sort_created_at, m.id) < (p_after_rank, p_after_created_at, p_after_id)
     order by m.rank desc, m.sort_created_at desc, m.id desc
     limit v_limit
  )
  select l.id, l.title, l.short_description, l.city, l.category, l.tags, l.photos,
         l.price_per_person, l.rating, l.reviews_count, pg.sort_created_at,
         jsonb_build_object('id', p.id, 'name', p.name, 'profile_photo_url', p.profile_photo_url,
                            'city', p.city, 'rating', p.rating),
         pg.rank,
         (select count(*) from matches)
    from page pg
    join public.locations l on l.id = pg.id
    join public.profiles p on p.id = l.guide_id
   order by pg.rank desc, pg.sort_created_at desc, pg.id desc;
end $$;

revoke all on function public.search_locations(text, text, numeric, numeric, numeric, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.search_locations(text, text, numeric, numeric, numeric, timestamptz, uuid, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
