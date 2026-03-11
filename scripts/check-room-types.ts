#!/usr/bin/env npx tsx
/**
 * Script to check room_type and rate_plan distribution in booking_room_lines_mirror
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://qqokzjrffjvpdrcoxjec.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxb2t6anJmZmp2cGRyY294amVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNjQ3ODMsImV4cCI6MjA1NDc0MDc4M30.aA0LJulHLHl_3PgL5aqYDH2g8ioTSC5JOHkXRmJh0fk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Checking room_type and rate_plan distribution...\n');

  // Check future bookings (from today onwards)
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('booking_room_lines_mirror')
    .select('room_type, rate_plan')
    .gte('check_in_date', today)
    .limit(100);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data?.length || 0} future booking lines\n`);

  // Count room_type values
  const roomTypeCounts: Record<string, number> = {};
  const ratePlanCounts: Record<string, number> = {};

  data?.forEach(row => {
    const rt = row.room_type || 'NULL';
    const rp = row.rate_plan || 'NULL';
    roomTypeCounts[rt] = (roomTypeCounts[rt] || 0) + 1;
    ratePlanCounts[rp] = (ratePlanCounts[rp] || 0) + 1;
  });

  console.log('room_type distribution:');
  Object.entries(roomTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });

  console.log('\nrate_plan distribution:');
  Object.entries(ratePlanCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });

  // Show sample rows
  console.log('\nSample rows:');
  data?.slice(0, 10).forEach((row, i) => {
    console.log(`  ${i + 1}. room_type: "${row.room_type || 'NULL'}", rate_plan: "${row.rate_plan || 'NULL'}"`);
  });
}

main();
