// Verify business_info table schema
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySchema() {
  console.log('🔍 Checking business_info table schema...\n');

  try {
    // Try to query the table with new columns
    const { data, error } = await supabase
      .from('business_info')
      .select('id, business_name, as_cost, custom_additional_costs')
      .limit(1);

    if (error) {
      if (error.message.includes('column "as_cost" does not exist') ||
          error.message.includes('column "custom_additional_costs" does not exist')) {
        console.log('❌ Migration needed: Columns do not exist yet\n');
        console.log('📋 Next steps:');
        console.log('1. Open Supabase Dashboard: https://app.supabase.com');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Run the migration script from: database/add-as-cost-and-custom-costs.sql\n');
        return false;
      } else {
        console.error('❌ Error querying table:', error.message);
        return false;
      }
    }

    console.log('✅ Columns exist! Schema verification successful\n');
    console.log('Sample data:', JSON.stringify(data, null, 2));
    return true;

  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
    return false;
  }
}

verifySchema()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
