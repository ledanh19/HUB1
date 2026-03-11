import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Ward {
  name: string;
  code: number;
  codename: string;
  division_type: string;
  short_codename: string;
}

interface District {
  name: string;
  code: number;
  codename: string;
  division_type: string;
  short_codename: string;
  wards: Ward[];
}

interface Province {
  name: string;
  code: number;
  codename: string;
  division_type: string;
  phone_code: number;
  districts: District[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[VN Seed] Starting to fetch data from provinces.open-api.vn...');
    
    // Fetch all provinces with districts and wards (depth=3)
    const response = await fetch('https://provinces.open-api.vn/api/?depth=3');
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    
    const provinces: Province[] = await response.json();
    console.log(`[VN Seed] Fetched ${provinces.length} provinces from API`);

    // Clear existing data first (using gte to match all existing codes)
    console.log('[VN Seed] Clearing existing data...');
    const { error: wardDeleteError } = await supabase.from('vn_wards').delete().gte('code', '00000');
    if (wardDeleteError) console.log('[VN Seed] Ward delete result:', wardDeleteError);
    
    const { error: districtDeleteError } = await supabase.from('vn_districts').delete().gte('code', '000');
    if (districtDeleteError) console.log('[VN Seed] District delete result:', districtDeleteError);
    
    const { error: provinceDeleteError } = await supabase.from('vn_provinces').delete().gte('code', '00');
    if (provinceDeleteError) console.log('[VN Seed] Province delete result:', provinceDeleteError);
    
    console.log('[VN Seed] Cleared existing data');
    console.log('[VN Seed] Cleared existing data');

    // Insert provinces
    const provinceRecords = provinces.map(p => ({
      code: String(p.code).padStart(2, '0'),
      name: p.name,
      name_en: null,
      is_active: true
    }));

    console.log(`[VN Seed] Inserting ${provinceRecords.length} provinces...`);
    const { error: provinceError } = await supabase
      .from('vn_provinces')
      .insert(provinceRecords);
    
    if (provinceError) {
      console.error('[VN Seed] Province insert error:', provinceError);
      throw provinceError;
    }
    console.log(`[VN Seed] Inserted ${provinceRecords.length} provinces`);

    // Collect all districts and wards
    const districtRecords: { code: string; province_code: string; name: string; name_en: string | null; is_active: boolean }[] = [];
    const wardRecords: { code: string; district_code: string; name: string; name_en: string | null; is_active: boolean }[] = [];

    for (const province of provinces) {
      const provinceCode = String(province.code).padStart(2, '0');
      
      for (const district of province.districts || []) {
        const districtCode = String(district.code).padStart(3, '0');
        
        districtRecords.push({
          code: districtCode,
          province_code: provinceCode,
          name: district.name,
          name_en: null,
          is_active: true
        });

        for (const ward of district.wards || []) {
          const wardCode = String(ward.code).padStart(5, '0');
          
          wardRecords.push({
            code: wardCode,
            district_code: districtCode,
            name: ward.name,
            name_en: null,
            is_active: true
          });
        }
      }
    }

    console.log(`[VN Seed] Prepared ${districtRecords.length} districts and ${wardRecords.length} wards`);

    // Insert districts in batches
    const BATCH_SIZE = 500;
    console.log(`[VN Seed] Inserting districts in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < districtRecords.length; i += BATCH_SIZE) {
      const batch = districtRecords.slice(i, i + BATCH_SIZE);
      const { error: districtError } = await supabase
        .from('vn_districts')
        .insert(batch);
      
      if (districtError) {
        console.error(`[VN Seed] District insert error at batch ${i}:`, districtError);
        throw districtError;
      }
      console.log(`[VN Seed] Inserted districts batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(districtRecords.length / BATCH_SIZE)}`);
    }
    console.log(`[VN Seed] Inserted ${districtRecords.length} districts`);

    // Insert wards in batches
    console.log(`[VN Seed] Inserting wards in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < wardRecords.length; i += BATCH_SIZE) {
      const batch = wardRecords.slice(i, i + BATCH_SIZE);
      const { error: wardError } = await supabase
        .from('vn_wards')
        .insert(batch);
      
      if (wardError) {
        console.error(`[VN Seed] Ward insert error at batch ${i}:`, wardError);
        throw wardError;
      }
      console.log(`[VN Seed] Inserted wards batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(wardRecords.length / BATCH_SIZE)}`);
    }
    console.log(`[VN Seed] Inserted ${wardRecords.length} wards`);

    // Verify counts
    const { count: provinceCount } = await supabase.from('vn_provinces').select('*', { count: 'exact', head: true });
    const { count: districtCount } = await supabase.from('vn_districts').select('*', { count: 'exact', head: true });
    const { count: wardCount } = await supabase.from('vn_wards').select('*', { count: 'exact', head: true });

    const result = {
      success: true,
      message: 'Vietnam administrative data seeded successfully',
      counts: {
        provinces: provinceCount,
        districts: districtCount,
        wards: wardCount
      }
    };

    console.log('[VN Seed] Seeding completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[VN Seed] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
