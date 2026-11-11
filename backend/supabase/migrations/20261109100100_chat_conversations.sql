-- =============================================================================
-- Chat: an inbox with one row per conversation, keyset-paginated threads and
-- the indexes behind both, so the app never downloads a whole message history.
--
-- Both functions are SECURITY INVOKER: the messages and profiles RLS policies
-- and column grants still decide what the caller sees. created_at and is_read
-- are server-owned (clients may insert only id, sender_id, receiver_id and
-- content; see 20261109000000_security_hardening.sql), so the inbox order, the
-- thread cursor and the unread counts can be trusted.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indexes. A conversation is two directions (me -> them, them -> me); each is a
-- range of one of these indexes, already in thread order. They lead with the
-- same columns as the old single-column indexes, which they replace.
-- Unread counts only look at unread rows, which stay few.
-- -----------------------------------------------------------------------------
create index if not exists messages_sender_receiver_created_idx
  on public.messages (sender_id, receiver_id, created_at desc, id desc);
create index if not exists messages_receiver_sender_created_idx
  on public.messages (receiver_id, sender_id, created_at desc, id desc);
create index if not exists messages_unread_idx
  on public.messages (receiver_id, sender_id) where is_read is not true;

drop index if exists public.messages_sender_id_idx;
drop index if exists public.messages_receiver_id_idx;

-- -----------------------------------------------------------------------------
-- my_conversations(): one row per person the caller has exchanged messages
-- with: who they are, the latest message in either direction, and how many of
-- their messages the caller has not read. Newest conversation first.
-- -----------------------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
  partner_id uuid,
  partner_name text,
  partner_role text,
  partner_is_verified boolean,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count integer
)
language sql stable security invoker set search_path = public as $$
  with partners as (
    select m.receiver_id as partner_id from public.messages m where m.sender_id = (select auth.uid())
    union
    select m.sender_id from public.messages m where m.receiver_id = (select auth.uid())
  )
  select p.partner_id,
         pr.name,
         pr.role,
         coalesce(pr.is_verified, false),
         last_msg.id,
         last_msg.content,
         last_msg.sender_id,
         last_msg.created_at,
         (select count(*)::integer
            from public.messages u
           where u.receiver_id = (select auth.uid())
             and u.sender_id = p.partner_id
             and u.is_read is not true)
    from partners p
    cross join lateral (
      select x.id, x.content, x.sender_id, x.created_at
        from ((select m.id, m.content, m.sender_id, m.created_at
                 from public.messages m
                where m.sender_id = (select auth.uid()) and m.receiver_id = p.partner_id
                order by m.created_at desc, m.id desc
                limit 1)
              union all
              (select m.id, m.content, m.sender_id, m.created_at
                 from public.messages m
                where m.sender_id = p.partner_id and m.receiver_id = (select auth.uid())
                order by m.created_at desc, m.id desc
                limit 1)) x
       order by x.created_at desc, x.id desc
       limit 1
    ) last_msg
    left join public.profiles pr on pr.id = p.partner_id
   order by last_msg.created_at desc, last_msg.id desc;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- -----------------------------------------------------------------------------
-- conversation_messages(): a page of the caller's conversation with
-- p_partner_id, newest first. Pass the oldest message already loaded as
-- (p_before_created_at, p_before_id) for the page before it. Keyset pagination
-- stays correct while new messages arrive; at most 100 rows per page.
-- -----------------------------------------------------------------------------
create or replace function public.conversation_messages(
  p_partner_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns setof public.messages
language sql stable security invoker set search_path = public as $$
  select x.*
    from ((select m.*
             from public.messages m
            where m.sender_id = (select auth.uid()) and m.receiver_id = p_partner_id
              and (m.created_at, m.id) < (coalesce(p_before_created_at, 'infinity'),
                                          coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
            order by m.created_at desc, m.id desc
            limit least(greatest(coalesce(p_limit, 50), 1), 100))
          union all
          (select m.*
             from public.messages m
            where m.sender_id = p_partner_id and m.receiver_id = (select auth.uid())
              and (m.created_at, m.id) < (coalesce(p_before_created_at, 'infinity'),
                                          coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
            order by m.created_at desc, m.id desc
            limit least(greatest(coalesce(p_limit, 50), 1), 100))) x
   order by x.created_at desc, x.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.conversation_messages(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.conversation_messages(uuid, timestamptz, uuid, integer) to authenticated;

notify pgrst, 'reload schema';
