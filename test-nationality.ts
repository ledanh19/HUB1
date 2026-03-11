import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

async function run() {
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data: page, error } = await supabase
        .from("bookings_mirror")
        .select("nationality, total_amount_net, channex_property_id, booking_date")
        .limit(10);
    console.log("Error:", error);
    console.log("Data:", page);
}
run();
