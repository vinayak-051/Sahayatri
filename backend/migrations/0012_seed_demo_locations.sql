-- Seed 5 demo locations using the admin account as guide.
-- Run this in the Supabase SQL editor (bypasses RLS).
-- Replace the email below if your admin account uses a different address.

do $$
declare
  v_guide_id uuid;
begin
  select id into v_guide_id from public.profiles where email = 'sahayatri.admin@gmail.com' limit 1;

  if v_guide_id is null then
    raise exception 'Admin profile not found. Create the admin account first, then re-run this script.';
  end if;

  insert into public.locations (title, short_description, detailed_content, lat, lng, category, tags, best_visiting_time, pricing, price_per_person, timings, safety_level, difficulty, photos, status, guide_id)
  values
  (
    'Hampi Virupaksha Temple',
    'Ancient Dravidian temple and the living heart of the Hampi UNESCO World Heritage Site.',
    'The Virupaksha Temple is one of the oldest functioning temples in India, dedicated to Lord Shiva. Rising 50 metres above the main bazaar, it has been in continuous worship since the 7th century. The surrounding ruins of the Vijayanagara Empire stretch for kilometres — carved boulders, elephant stables, and royal enclosures. Best explored on foot or bicycle at sunrise before the crowds arrive.',
    15.3350, 76.4600,
    'Heritage',
    ARRAY['ruins', 'temple', 'UNESCO', 'history'],
    'Oct – Feb (avoid summer heat)',
    '₹500 per person',
    500,
    '2 days',
    'high',
    'easy',
    ARRAY[]::text[],
    'active',
    v_guide_id
  ),
  (
    'Dudhsagar Waterfalls Trek',
    'Four-tiered waterfall on the Goa–Karnataka border — one of India''s tallest at 310 m.',
    'Dudhsagar (Sea of Milk) thunders down through the Western Ghats, best seen just after the monsoon when the flow is at its peak. The trek winds through Bhagwan Mahavir Wildlife Sanctuary, crossing the famous railway bridge with the falls in the background. The route is moderate — 11 km one way — through dense jungle with stream crossings. A local guide is essential; the trail is unmarked and flash floods are possible.',
    15.3144, 74.3144,
    'Nature',
    ARRAY['waterfall', 'trekking', 'jungle', 'monsoon'],
    'Oct – Jan (post-monsoon peak flow)',
    '₹800 per person',
    800,
    '1 day',
    'moderate',
    'moderate',
    ARRAY[]::text[],
    'active',
    v_guide_id
  ),
  (
    'Old Goa Basilica Walk',
    'Baroque churches, Portuguese colonial architecture, and the relics of St. Francis Xavier.',
    'Old Goa was once the capital of Portuguese India and rivalled Lisbon in grandeur. This guided walk covers the Basilica of Bom Jesus (housing St. Francis Xavier''s remains), Se Cathedral (the largest church in Asia), and the Church of St. Cajetan. Narrow lanes hide spice merchants, tile-fronted houses, and Indo-Portuguese mansions. The walk ends at the river promenade as the sun sets over the Mandovi.',
    15.5009, 73.9116,
    'Heritage',
    ARRAY['churches', 'colonial', 'heritage', 'architecture'],
    'Nov – Mar (dry and pleasant)',
    '₹600 per person',
    600,
    '1 day',
    'high',
    'easy',
    ARRAY[]::text[],
    'active',
    v_guide_id
  ),
  (
    'Spiti Valley High-Altitude Circuit',
    'Remote Buddhist monasteries and lunar landscapes at 4,200 m in the Trans-Himalaya.',
    'Spiti is one of the most isolated inhabited valleys on earth — cold desert, ancient gompas, and villages that see snow 8 months a year. Key stops include Key Monastery (perched at 4,166 m), Chandratal Lake (a crater-blue alpine lake), and the fossil-rich Langza village. Roads are unpaved and altitude sickness is real — acclimatise in Kaza for two nights before attempting higher passes. A guide who knows the local terrain and homestay network is essential.',
    32.2432, 78.0413,
    'Mountain',
    ARRAY['himalaya', 'monastery', 'high-altitude', 'offbeat'],
    'Jun – Sep (road open)',
    '₹2500 per person',
    2500,
    '5 days',
    'moderate',
    'hard',
    ARRAY[]::text[],
    'active',
    v_guide_id
  ),
  (
    'Varanasi Ghats at Dawn',
    'Sacred cremation ghats, boat ride on the Ganga, and the ancient lanes of Kashi.',
    'Varanasi is one of the world''s oldest continuously inhabited cities, and the Ganga ghats are its soul. A pre-dawn boat ride lets you witness the morning aarti, sadhus at prayer, and the burning ghats in the soft light of sunrise. The narrow lanes (galis) behind the ghats are a labyrinth of silk weavers, chai shops, and 2,000-year-old temples. An expert local guide is the difference between a surface visit and a deep encounter with the city''s living traditions.',
    25.3176, 83.0107,
    'Spiritual',
    ARRAY['ghats', 'Ganga', 'sunrise', 'spiritual', 'boat-ride'],
    'Oct – Mar (cooler; avoid July–Aug floods)',
    '₹700 per person',
    700,
    '2 days',
    'high',
    'easy',
    ARRAY[]::text[],
    'active',
    v_guide_id
  );

  raise notice 'Inserted 5 demo locations for guide %', v_guide_id;
end $$;
