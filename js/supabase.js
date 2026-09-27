const SUPABASE_URL = "https://lsgjfkybiedflgecotlb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YXYGwQNR4VNXFiUX81jV6A_6rtfNS9x";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);



// const { data, error } = await window.supabaseClient
//     .from("brands")
//     .select("*");

// console.log("DATA:", data);
// console.log("ERROR:", error);