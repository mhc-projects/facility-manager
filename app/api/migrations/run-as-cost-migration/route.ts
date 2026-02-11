// Temporary API endpoint for AS Cost and Custom Costs migration
// DELETE THIS FILE AFTER SUCCESSFUL MIGRATION
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting AS Cost and Custom Costs migration...');

    // Step 1: Add as_cost column
    console.log('📝 Adding as_cost column...');
    const { error: asCostError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        ALTER TABLE business_info
        ADD COLUMN IF NOT EXISTS as_cost DECIMAL(12, 2) DEFAULT 0 CHECK (as_cost >= 0);
      `
    });

    if (asCostError) {
      console.error('❌ as_cost column creation failed:', asCostError);
      // Try direct query if rpc fails
      const { error: directError1 } = await supabaseAdmin
        .from('business_info')
        .select('as_cost')
        .limit(1);

      if (directError1 && directError1.message.includes('column "as_cost" does not exist')) {
        return NextResponse.json({
          success: false,
          message: 'Failed to add as_cost column. Please run migration in Supabase SQL Editor.',
          error: asCostError.message
        }, { status: 500 });
      }
    }

    // Step 2: Add custom_additional_costs column
    console.log('📝 Adding custom_additional_costs column...');
    const { error: customCostsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        ALTER TABLE business_info
        ADD COLUMN IF NOT EXISTS custom_additional_costs JSONB DEFAULT '[]'::jsonb;
      `
    });

    if (customCostsError) {
      console.error('❌ custom_additional_costs column creation failed:', customCostsError);
      const { error: directError2 } = await supabaseAdmin
        .from('business_info')
        .select('custom_additional_costs')
        .limit(1);

      if (directError2 && directError2.message.includes('column "custom_additional_costs" does not exist')) {
        return NextResponse.json({
          success: false,
          message: 'Failed to add custom_additional_costs column. Please run migration in Supabase SQL Editor.',
          error: customCostsError.message
        }, { status: 500 });
      }
    }

    // Step 3: Create indexes
    console.log('📝 Creating indexes...');
    const { error: indexError1 } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_business_info_as_cost
        ON business_info(as_cost)
        WHERE as_cost > 0;
      `
    });

    if (indexError1) {
      console.warn('⚠️ as_cost index creation warning:', indexError1);
    }

    const { error: indexError2 } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_business_info_custom_costs
        ON business_info USING GIN (custom_additional_costs)
        WHERE jsonb_array_length(custom_additional_costs) > 0;
      `
    });

    if (indexError2) {
      console.warn('⚠️ custom_costs index creation warning:', indexError2);
    }

    // Step 4: Verify columns exist
    console.log('🔍 Verifying migration...');
    const { data: testData, error: verifyError } = await supabaseAdmin
      .from('business_info')
      .select('id, as_cost, custom_additional_costs')
      .limit(1);

    if (verifyError) {
      return NextResponse.json({
        success: false,
        message: 'Migration verification failed',
        error: verifyError.message
      }, { status: 500 });
    }

    console.log('✅ Migration completed successfully!');

    return NextResponse.json({
      success: true,
      message: 'AS Cost and Custom Costs migration completed successfully',
      data: {
        columnsVerified: true,
        sampleData: testData
      }
    });

  } catch (error: any) {
    console.error('🔴 Migration error:', error);
    return NextResponse.json({
      success: false,
      message: 'Migration failed with exception',
      error: error.message
    }, { status: 500 });
  }
}
