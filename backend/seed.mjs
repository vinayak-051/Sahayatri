import { supabaseAdmin } from "./supabaseClient.js";

const DEV_PASSWORD = "Sahayatri@123";

const TRAVELERS = [
  { name: "Vinayak Sharma", email: "vinayak.traveler@sahayatri.dev" },
  { name: "Ananya Iyer", email: "ananya.traveler@sahayatri.dev" },
  { name: "Rohan Mehta", email: "rohan.traveler@sahayatri.dev" },
  { name: "Priya Nair", email: "priya.traveler@sahayatri.dev" },
  { name: "Karan Verma", email: "karan.traveler@sahayatri.dev" },
];

const GUIDES = [
  {
    name: "Sunita Devi",
    email: "guide.jaipur@sahayatri.dev",
    city: "Jaipur",
    languages: ["Hindi", "English"],
    specialization: "Heritage & Forts",
    bio: "Born and raised in the Pink City, I've spent 12 years showing travelers the forts and bazaars my grandparents grew up around.",
    ratePerDay: 2200,
  },
  {
    name: "Arjun Nambiar",
    email: "guide.kochi@sahayatri.dev",
    city: "Kochi",
    languages: ["Malayalam", "English", "Hindi"],
    specialization: "Backwaters & Cuisine",
    bio: "A former houseboat captain turned guide — I know every backwater channel and the best seafood shacks in Fort Kochi.",
    ratePerDay: 2800,
  },
  {
    name: "Tashi Dorjee",
    email: "guide.leh@sahayatri.dev",
    city: "Leh",
    languages: ["Ladakhi", "Hindi", "English"],
    specialization: "Trekking & Monasteries",
    bio: "High-altitude trekking guide for 8 years, specializing in monastery routes and safe acclimatization for first-time visitors.",
    ratePerDay: 3500,
  },
  {
    name: "Meera Pillai",
    email: "guide.varanasi@sahayatri.dev",
    city: "Varanasi",
    languages: ["Hindi", "English", "Bhojpuri"],
    specialization: "Spiritual & Ghats",
    bio: "I guide sunrise boat rides and ghat walks, sharing the rituals and history of India's oldest living city.",
    ratePerDay: 1800,
  },
  {
    name: "Vikram Singh Rathore",
    email: "guide.udaipur@sahayatri.dev",
    city: "Udaipur",
    languages: ["Hindi", "English", "Rajasthani"],
    specialization: "Palaces & Lakes",
    bio: "Local historian and licensed guide covering the City Palace, Lake Pichola, and Udaipur's royal heritage.",
    ratePerDay: 2500,
  },
  {
    name: "Lakshmi Iyer",
    email: "guide.madurai@sahayatri.dev",
    city: "Madurai",
    languages: ["Tamil", "English"],
    specialization: "Temples & Culture",
    bio: "I've guided temple tours in Madurai for a decade, with a focus on Dravidian architecture and temple traditions.",
    ratePerDay: 1500,
  },
  {
    name: "Imran Sheikh",
    email: "guide.hyderabad@sahayatri.dev",
    city: "Hyderabad",
    languages: ["Urdu", "Telugu", "Hindi", "English"],
    specialization: "Food & Nizami Heritage",
    bio: "Food-walk specialist around the Old City — biryani, Irani chai, and the stories behind Hyderabad's Nizami architecture.",
    ratePerDay: 2000,
  },
  {
    name: "Pema Lhamo",
    email: "guide.gangtok@sahayatri.dev",
    city: "Gangtok",
    languages: ["Nepali", "Hindi", "English"],
    specialization: "Mountains & Monasteries",
    bio: "Sikkim-based guide for monastery visits, mountain lake day trips, and Himalayan trekking routes near Gangtok.",
    ratePerDay: 2700,
  },
];

async function getOrCreateUser({ name, email, role, city, languages, specialization, bio }) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name,
      role,
      city,
      languages: languages?.join(","),
      specialization,
      bio,
    },
  });

  if (!error) return data.user;

  // The auth user already exists from a previous run. Their profile row may
  // or may not exist (e.g. if `profiles` was dropped/recreated by a migration
  // reset since then, since auth.users is untouched by that) — find the auth
  // user and make sure a matching profile row exists either way.
  const { data: listResult, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw listError;
  const existingUser = listResult.users.find((u) => u.email === email);
  if (!existingUser) throw error;

  const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({
    id: existingUser.id,
    email,
    name,
    role,
    city,
    languages: languages ?? [],
    specialization,
    bio,
    onboarded: true,
  });
  if (upsertError) throw upsertError;

  return existingUser;
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding travelers...");
  const travelers = [];
  for (const t of TRAVELERS) {
    const user = await getOrCreateUser({ ...t, role: "traveler" });
    travelers.push({ ...t, id: user.id });
  }

  console.log("Seeding guides...");
  const guides = [];
  for (const g of GUIDES) {
    const user = await getOrCreateUser({ ...g, role: "guide" });
    // rate_per_day isn't carried by the new-user trigger (it only reads
    // signup metadata), so set it explicitly here.
    const { error: rateError } = await supabaseAdmin.from("profiles").update({ rate_per_day: g.ratePerDay }).eq("id", user.id);
    if (rateError) throw rateError;
    guides.push({ ...g, id: user.id });
  }
  const guideByCity = Object.fromEntries(guides.map((g) => [g.city, g]));

  console.log("Seeding locations...");
  const locationSpecs = [
    { city: "Jaipur", title: "Amber Fort", short: "A majestic hilltop fort overlooking Maan Sagar Lake.", category: "Heritage", lat: 26.9855, lng: 75.8513, tags: ["fort", "heritage", "history"], price: "₹500 per person", time: "Oct - Mar" },
    { city: "Jaipur", title: "City Palace Jaipur", short: "Royal palace complex blending Rajput and Mughal architecture.", category: "Heritage", lat: 26.9258, lng: 75.8237, tags: ["palace", "royal", "museum"], price: "₹700 per person", time: "Year round" },
    { city: "Kochi", title: "Fort Kochi Beach Walk", short: "Chinese fishing nets, colonial streets, and sunset views.", category: "Cultural", lat: 9.9658, lng: 76.2422, tags: ["beach", "colonial", "walk"], price: "₹400 per person", time: "Nov - Feb" },
    { city: "Kochi", title: "Alleppey Backwaters Cruise", short: "Houseboat cruise through Kerala's tranquil backwater canals.", category: "Nature", lat: 9.4981, lng: 76.3388, tags: ["backwaters", "houseboat", "nature"], price: "₹3500 per person", time: "Sep - Mar" },
    { city: "Leh", title: "Pangong Lake Road Trip", short: "A high-altitude drive to one of the world's highest lakes.", category: "Nature", lat: 33.7592, lng: 78.6629, tags: ["lake", "mountain", "roadtrip"], price: "₹4500 per person", time: "May - Sep" },
    { city: "Leh", title: "Shanti Stupa Sunset", short: "Panoramic views of Leh town from a serene Buddhist stupa.", category: "Spiritual", lat: 34.1664, lng: 77.5732, tags: ["stupa", "sunset", "spiritual"], price: "₹300 per person", time: "May - Sep" },
    { city: "Varanasi", title: "Ganga Ghat Sunrise Boat Ride", short: "Witness morning rituals along the ghats from a wooden boat.", category: "Spiritual", lat: 25.3109, lng: 83.0107, tags: ["ganga", "boat", "sunrise"], price: "₹600 per person", time: "Oct - Mar" },
    { city: "Varanasi", title: "Sarnath Heritage Walk", short: "Ancient Buddhist ruins where Buddha gave his first sermon.", category: "Heritage", lat: 25.3811, lng: 83.0238, tags: ["buddhist", "ruins", "history"], price: "₹450 per person", time: "Year round" },
    { city: "Udaipur", title: "Lake Pichola Sunset Cruise", short: "A boat ride past the City Palace and Jag Mandir at golden hour.", category: "Nature", lat: 24.5764, lng: 73.6800, tags: ["lake", "sunset", "cruise"], price: "₹800 per person", time: "Oct - Mar" },
    { city: "Udaipur", title: "City Palace Udaipur", short: "A sprawling palace complex with courtyards, museums, and lake views.", category: "Heritage", lat: 24.5764, lng: 73.6835, tags: ["palace", "museum", "royal"], price: "₹650 per person", time: "Year round" },
    { city: "Madurai", title: "Meenakshi Amman Temple Tour", short: "A guided walk through one of India's most ornate temple complexes.", category: "Temple", lat: 9.9195, lng: 78.1193, tags: ["temple", "dravidian", "culture"], price: "₹350 per person", time: "Year round" },
    { city: "Madurai", title: "Thirumalai Nayakkar Palace", short: "A 17th-century palace showcasing Indo-Saracenic architecture.", category: "Heritage", lat: 9.9180, lng: 78.1265, tags: ["palace", "architecture", "history"], price: "₹300 per person", time: "Year round" },
    { city: "Hyderabad", title: "Charminar & Old City Food Walk", short: "Biryani, Irani chai, and centuries-old bazaars around Charminar.", category: "Cultural", lat: 17.3616, lng: 78.4747, tags: ["food", "market", "heritage"], price: "₹900 per person", time: "Nov - Feb" },
    { city: "Hyderabad", title: "Golconda Fort Sound & Light", short: "An evening show retelling the legends of the Qutb Shahi dynasty.", category: "Heritage", lat: 17.3833, lng: 78.4011, tags: ["fort", "history", "show"], price: "₹400 per person", time: "Year round" },
    { city: "Gangtok", title: "Tsomgo Lake Day Trip", short: "A glacial lake surrounded by snow peaks, 40km from Gangtok.", category: "Mountain", lat: 27.3742, lng: 88.7626, tags: ["lake", "mountain", "daytrip"], price: "₹2200 per person", time: "Mar - Jun, Sep - Dec" },
  ];

  const locations = [];
  for (const spec of locationSpecs) {
    const guide = guideByCity[spec.city];
    const { data, error } = await supabaseAdmin
      .from("locations")
      .insert({
        title: spec.title,
        short_description: spec.short,
        detailed_content: `${spec.short} Hosted by ${guide.name}, a local guide based in ${spec.city}. Booking includes a knowledgeable local companion for the full experience.`,
        lat: spec.lat,
        lng: spec.lng,
        category: spec.category,
        tags: spec.tags,
        best_visiting_time: spec.time,
        pricing: spec.price,
        timings: "9:00 AM - 6:00 PM",
        safety_level: "high",
        difficulty: "easy",
        guide_id: guide.id,
        status: "active",
      })
      .select()
      .single();
    if (error) throw error;
    locations.push(data);
  }

  console.log("Seeding bookings...");
  const bookingSpecs = [
    { traveler: travelers[0], guide: guides[0], destination: "Jaipur", date: daysFromNow(14), status: "pending", amount: 2500 },
    { traveler: travelers[1], guide: guides[1], destination: "Kochi", date: daysFromNow(21), status: "accepted", amount: 4200 },
    { traveler: travelers[2], guide: guides[2], destination: "Leh", date: daysFromNow(45), status: "accepted", amount: 6800 },
    { traveler: travelers[3], guide: guides[4], destination: "Udaipur", date: daysFromNow(10), status: "declined", amount: 3000 },
    { traveler: travelers[4], guide: guides[6], destination: "Hyderabad", date: daysFromNow(7), status: "pending", amount: 1800 },
    { traveler: travelers[0], guide: guides[3], destination: "Varanasi", date: daysFromNow(-5), status: "completed", amount: 2100 },
  ];
  for (const b of bookingSpecs) {
    const { error } = await supabaseAdmin.from("bookings").insert({
      traveler_id: b.traveler.id,
      guide_id: b.guide.id,
      destination: b.destination,
      date: b.date,
      people: 2,
      amount: b.amount,
      status: b.status,
    });
    if (error) throw error;
  }

  console.log("Seeding buddy trips...");
  const buddyTripSpecs = [
    { user: travelers[0], destination: "Leh", start: daysFromNow(40), end: daysFromNow(47), budget: "₹15000-20000", description: "Looking for 2-3 people to split a Leh-Ladakh road trip in a rented Innova." },
    { user: travelers[1], destination: "Goa", start: daysFromNow(30), end: daysFromNow(34), budget: "₹8000-12000", description: "Beach hopping and seafood in North Goa, flexible dates." },
    { user: travelers[3], destination: "Varanasi", start: daysFromNow(20), end: daysFromNow(23), budget: "₹6000-9000", description: "Want company for the sunrise boat ride and ghat walks." },
  ];
  const buddyTrips = [];
  for (const t of buddyTripSpecs) {
    const { data, error } = await supabaseAdmin
      .from("buddy_trips")
      .insert({
        user_id: t.user.id,
        destination: t.destination,
        start_date: t.start,
        end_date: t.end,
        budget: t.budget,
        description: t.description,
      })
      .select()
      .single();
    if (error) throw error;
    buddyTrips.push(data);
  }

  console.log("Seeding buddy requests...");
  const buddyRequestSpecs = [
    { trip: buddyTrips[0], traveler: travelers[2], status: "pending" },
    { trip: buddyTrips[1], traveler: travelers[4], status: "accepted" },
  ];
  for (const r of buddyRequestSpecs) {
    const { error } = await supabaseAdmin.from("buddy_requests").insert({
      trip_id: r.trip.id,
      traveler_id: r.traveler.id,
      status: r.status,
    });
    if (error) throw error;
  }

  console.log("Seeding a message thread...");
  const thread = [
    { from: travelers[0], to: guides[0], content: "Hi! Is the Amber Fort tour available next Saturday morning?" },
    { from: guides[0], to: travelers[0], content: "Yes, 9 AM works well before it gets crowded. How many people?" },
    { from: travelers[0], to: guides[0], content: "Just me and my partner. Should we book through the app?" },
    { from: guides[0], to: travelers[0], content: "Yes, go ahead and send a booking request — I'll confirm right away." },
  ];
  for (const m of thread) {
    const { error } = await supabaseAdmin.from("messages").insert({
      sender_id: m.from.id,
      receiver_id: m.to.id,
      content: m.content,
    });
    if (error) throw error;
  }

  console.log("Seeding reviews...");
  const reviewSpecs = [
    { guide: guides[1], reviewer: travelers[1], rating: 5, comment: "Arjun knew every backwater shortcut and the best seafood spot in Fort Kochi. Unforgettable trip!" },
    { guide: guides[2], reviewer: travelers[2], rating: 5, comment: "Tashi made sure we acclimatized properly before the Pangong drive. Felt safe the whole way." },
    { guide: guides[0], reviewer: travelers[0], rating: 4, comment: "Great stories about Amber Fort's history, just wished the tour was a bit longer." },
  ];
  for (const r of reviewSpecs) {
    const { error } = await supabaseAdmin
      .from("reviews")
      .upsert(
        { guide_id: r.guide.id, reviewer_id: r.reviewer.id, rating: r.rating, comment: r.comment },
        { onConflict: "guide_id,reviewer_id" }
      );
    if (error) throw error;
  }

  console.log("\nSeed complete!\n");
  console.log("Demo login credentials (all accounts use the same password):");
  console.log(`  Password: ${DEV_PASSWORD}\n`);
  console.log("  Travelers:");
  travelers.forEach((t) => console.log(`    ${t.email}`));
  console.log("  Guides:");
  guides.forEach((g) => console.log(`    ${g.email}  (${g.city})`));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err.message || err);
    process.exit(1);
  });
