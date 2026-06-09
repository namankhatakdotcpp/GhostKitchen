// Comprehensive list of Indian cities, towns, and popular neighbourhoods
export const INDIAN_CITIES: string[] = [
  // ── Metro & Tier-1 ─────────────────────────────────────────────────────────
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata",
  "Ahmedabad", "Pune", "Surat", "Jaipur",

  // ── State capitals ─────────────────────────────────────────────────────────
  "Lucknow", "Bhopal", "Raipur", "Bhubaneswar", "Patna", "Ranchi",
  "Dehradun", "Shimla", "Chandigarh", "Gandhinagar", "Panaji", "Puducherry",
  "Dispur", "Imphal", "Shillong", "Aizawl", "Kohima", "Itanagar",
  "Gangtok", "Agartala", "Srinagar", "Jammu", "Thiruvananthapuram",

  // ── Tier-2 Cities ──────────────────────────────────────────────────────────
  "Agra", "Allahabad", "Amritsar", "Bareilly", "Bikaner", "Coimbatore",
  "Faridabad", "Ghaziabad", "Gorakhpur", "Gurgaon", "Guwahati", "Gwalior",
  "Hubballi", "Indore", "Jabalpur", "Jalandhar", "Jamnagar", "Jamshedpur",
  "Jhansi", "Jodhpur", "Kanpur", "Kochi", "Kolhapur", "Kota",
  "Kozhikode", "Ludhiana", "Madurai", "Mangaluru", "Meerut", "Moradabad",
  "Mysuru", "Nagpur", "Nashik", "Noida", "Patiala", "Rajkot",
  "Saharanpur", "Salem", "Siliguri", "Solapur", "Varanasi", "Vadodara",
  "Vijayawada", "Visakhapatnam", "Warangal",

  // ── Other notable cities ────────────────────────────────────────────────────
  "Ahmednagar", "Ajmer", "Akola", "Aligarh", "Alappuzha", "Alwar",
  "Ambala", "Amravati", "Asansol", "Aurangabad", "Bathinda", "Belagavi",
  "Bellary", "Bhagalpur", "Bharuch", "Bhavnagar", "Bhilai", "Bhilwara",
  "Bhiwandi", "Bhuj", "Bilaspur", "Bokaro", "Brahmapur", "Cuttack",
  "Davanagere", "Dhanbad", "Dhule", "Durgapur", "Eluru", "Erode",
  "Firozabad", "Gaya", "Gulbarga", "Guntur", "Haridwar", "Howrah",
  "Jabalpur", "Kakinada", "Karimnagar", "Khammam", "Korba", "Kurnool",
  "Latur", "Malegaon", "Mangaluru", "Mehsana", "Muzaffarnagar",
  "Nanded", "Navsari", "Navi Mumbai", "Nellore", "Nizamabad",
  "Prayagraj", "Rajahmundry", "Rohtak", "Rourkela", "Sangli",
  "Tirupati", "Tiruchirappalli", "Tirunelveli", "Thrissur", "Udaipur",
  "Ujjain", "Vapi", "Vasai", "Yamunanagar",

  // ── Hill stations & tourist towns ──────────────────────────────────────────
  "Manali", "Mussoorie", "Nainital", "Ooty", "Kodaikanal", "Munnar",
  "Rishikesh", "Dharamshala", "Mcleod Ganj", "Coorg",

  // ── Goa ────────────────────────────────────────────────────────────────────
  "Panaji", "Margao", "Vasco da Gama", "Calangute", "Baga", "Mapusa",

  // ── Delhi neighbourhoods ────────────────────────────────────────────────────
  "Connaught Place", "Karol Bagh", "Laxmi Nagar", "Rohini", "Dwarka",
  "Janakpuri", "Pitampura", "Saket", "Vasant Kunj", "Greater Kailash",
  "Rajouri Garden", "Preet Vihar", "Mayur Vihar", "Dilshad Garden",

  // ── Mumbai neighbourhoods ───────────────────────────────────────────────────
  "Andheri West", "Andheri East", "Bandra", "Bandra West", "Borivali",
  "Chembur", "Dadar", "Goregaon", "Juhu", "Kurla", "Malad", "Powai",
  "Worli", "Thane", "Kharghar", "Nerul", "Vashi", "Belapur",

  // ── Bengaluru neighbourhoods ────────────────────────────────────────────────
  "Whitefield", "Electronic City", "Koramangala", "Indiranagar",
  "Jayanagar", "Marathahalli", "HSR Layout", "JP Nagar", "Sarjapur",
  "Hebbal", "Yelahanka", "Bannerghatta", "BTM Layout",

  // ── Hyderabad neighbourhoods ────────────────────────────────────────────────
  "Gachibowli", "Madhapur", "HITEC City", "Banjara Hills", "Jubilee Hills",
  "Secunderabad", "Ameerpet", "Kukatpally", "LB Nagar", "Dilsukhnagar",

  // ── Chennai neighbourhoods ──────────────────────────────────────────────────
  "Anna Nagar", "T. Nagar", "Adyar", "Velachery", "Porur",
  "Tambaram", "Chromepet", "Perambur", "Nungambakkam",

  // ── Pune neighbourhoods ─────────────────────────────────────────────────────
  "Kothrud", "Viman Nagar", "Aundh", "Baner", "Hadapsar",
  "Hinjewadi", "Wakad", "Koregaon Park", "Kharadi", "Pimpri", "Chinchwad",

  // ── Kolkata neighbourhoods ──────────────────────────────────────────────────
  "Salt Lake", "New Town", "Howrah", "Dum Dum", "Behala",
  "Ballygunge", "Park Street", "Tollygunge",

  // ── Ahmedabad neighbourhoods ────────────────────────────────────────────────
  "Navrangpura", "Bodakdev", "Satellite", "Bopal", "Vastrapur",
  "Prahlad Nagar", "Maninagar", "Vejalpur",
].sort((a, b) => a.localeCompare(b));
