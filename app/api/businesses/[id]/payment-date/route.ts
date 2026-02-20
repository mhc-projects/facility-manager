import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PATCH /api/businesses/[id]/payment-date
 *
 * Updates the payment_scheduled_date for a specific business
 * Supports bidirectional sync between revenue table and business modal
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { payment_scheduled_date } = await request.json();

    // Validate date format (YYYY-MM-DD or null)
    if (payment_scheduled_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(payment_scheduled_date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Expected YYYY-MM-DD or null' },
        { status: 400 }
      );
    }

    // Update payment scheduled date in database
    const { data, error } = await supabase
      .from('businesses')
      .update({ payment_scheduled_date })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[API] Payment date update error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ [API] Payment date updated for business ${params.id.slice(0, 8)}...`);

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        payment_scheduled_date: data.payment_scheduled_date
      }
    });

  } catch (error) {
    console.error('[API] Payment date update exception:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
