import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ManualAnnouncementRequest } from '@/types/subsidy';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// PATCH - Update manual announcement
export async function PATCH(request: NextRequest) {
  console.log('[Manual Update API] Request received');

  try {
    // Get authorization token
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth_token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authorization token required' },
        { status: 401 }
      );
    }

    // Verify JWT token
    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.id || decodedToken.userId;

    // Get user data and permission
    const { data: userData, error: userError } = await supabase
      .from('employees')
      .select('permission_level, name, email')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      );
    }

    // Block guests (level 0) from editing
    if (userData.permission_level < 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: '게스트는 공고를 수정할 수 없습니다.'
          }
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Announcement ID required' },
        { status: 400 }
      );
    }

    // Check if announcement exists and is manual
    const { data: announcement, error: fetchError } = await supabase
      .from('subsidy_announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !announcement) {
      return NextResponse.json(
        { success: false, error: 'Announcement not found' },
        { status: 404 }
      );
    }

    if (!announcement.is_manual) {
      return NextResponse.json(
        { success: false, error: 'Only manual announcements can be edited' },
        { status: 403 }
      );
    }

    // Check permission: owner or super admin (permission_level 4)
    if (announcement.created_by !== userId && userData.permission_level < 4) {
      return NextResponse.json(
        { success: false, error: 'You can only edit your own announcements' },
        { status: 403 }
      );
    }

    // Update announcement
    const { data: updated, error: updateError } = await supabase
      .from('subsidy_announcements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Manual Update API] Update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update announcement', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[Manual Update API] Announcement updated successfully:', updated.id);

    return NextResponse.json({
      success: true,
      data: updated
    });

  } catch (error) {
    console.error('[Manual Update API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete manual announcement
export async function DELETE(request: NextRequest) {
  console.log('[Manual Delete API] Request received');

  try {
    // Get authorization token
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth_token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authorization token required' },
        { status: 401 }
      );
    }

    // Verify JWT token
    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.id || decodedToken.userId;

    // Get user data and permission
    const { data: userData, error: userError } = await supabase
      .from('employees')
      .select('permission_level, name, email')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      );
    }

    // Block guests (level 0) from deleting
    if (userData.permission_level < 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: '게스트는 공고를 삭제할 수 없습니다.'
          }
        },
        { status: 403 }
      );
    }

    // Get announcement ID from query params
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Announcement ID required' },
        { status: 400 }
      );
    }

    // Check if announcement exists and is manual
    const { data: announcement, error: fetchError } = await supabase
      .from('subsidy_announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !announcement) {
      return NextResponse.json(
        { success: false, error: 'Announcement not found' },
        { status: 404 }
      );
    }

    if (!announcement.is_manual) {
      return NextResponse.json(
        { success: false, error: 'Only manual announcements can be deleted' },
        { status: 403 }
      );
    }

    // Check permission: owner or super admin (permission_level 4)
    if (announcement.created_by !== userId && userData.permission_level < 4) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own announcements' },
        { status: 403 }
      );
    }

    // Delete announcement
    const { error: deleteError } = await supabase
      .from('subsidy_announcements')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[Manual Delete API] Delete failed:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete announcement', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('[Manual Delete API] Announcement deleted successfully:', id);

    return NextResponse.json({
      success: true,
      message: 'Announcement deleted successfully'
    });

  } catch (error) {
    console.error('[Manual Delete API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  console.log('[Manual Upload API] Request received');

  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth_token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    console.log('[Manual Upload API] Auth header present:', !!authHeader);
    console.log('[Manual Upload API] Cookie token present:', !!cookieToken);

    if (!token) {
      console.error('[Manual Upload API] Missing authorization token');
      return NextResponse.json(
        { success: false, error: 'Authorization token required' },
        { status: 401 }
      );
    }

    // Verify JWT token
    console.log('[Manual Upload API] Verifying JWT token...');
    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error('[Manual Upload API] JWT verification failed:', jwtError);
      return NextResponse.json(
        { success: false, error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.id || decodedToken.userId;
    console.log('[Manual Upload API] User authenticated:', userId);

    // Check permission_level (must be >= 1 for all authenticated users)
    console.log('[Manual Upload API] Checking user permission level...');

    const { data: userData, error: userError } = await supabase
      .from('employees')
      .select('permission_level, name, email')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('[Manual Upload API] User query error:', userError);
      return NextResponse.json(
        { success: false, error: 'User not found', details: userError.message },
        { status: 403 }
      );
    }

    if (!userData) {
      console.error('[Manual Upload API] User data not found');
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 403 }
      );
    }

    console.log('[Manual Upload API] User permission_level:', userData.permission_level, 'Name:', userData.name);

    if (userData.permission_level < 1) {
      console.error('[Manual Upload API] Insufficient permissions. Level:', userData.permission_level, 'Required: 1+');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: '게스트는 공고를 등록할 수 없습니다.'
          }
        },
        { status: 403 }
      );
    }

    // Parse request body
    console.log('[Manual Upload API] Parsing request body...');
    const body: ManualAnnouncementRequest = await request.json();
    console.log('[Manual Upload API] Request body:', JSON.stringify(body, null, 2));

    // Validate required fields
    if (!body.region_name || !body.title || !body.source_url) {
      console.error('[Manual Upload API] Missing required fields:', {
        region_name: !!body.region_name,
        title: !!body.title,
        source_url: !!body.source_url
      });
      return NextResponse.json(
        { success: false, error: 'region_name, title, and source_url are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.source_url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid source_url format' },
        { status: 400 }
      );
    }

    // Check for duplicate source_url (warn only, do not block)
    const { data: existingDuplicates } = await supabase
      .from('subsidy_announcements')
      .select('id, title')
      .eq('source_url', body.source_url);

    const duplicateWarning = existingDuplicates && existingDuplicates.length > 0
      ? `동일한 URL로 등록된 공고가 ${existingDuplicates.length}건 있습니다.`
      : null;

    // Get region info (or create a generic region code for manual entries)
    // Use shorter code to fit VARCHAR(10) constraint: "MAN" + last 7 digits of timestamp
    const timestamp = Date.now().toString();
    const region_code = `MAN${timestamp.slice(-7)}`;  // e.g., "MAN1885755" (10 chars)
    const region_type = 'basic'; // Default to basic for manual entries

    // Prepare announcement data
    const announcementData = {
      // Required fields
      region_code,
      region_name: body.region_name,
      region_type,
      title: body.title,
      source_url: body.source_url,

      // Optional fields from request
      content: body.content || null,
      application_period_start: body.application_period_start || null,
      application_period_end: body.application_period_end || null,
      budget: body.budget || null,
      support_amount: body.support_amount || null,
      target_description: body.target_description || null,
      published_at: body.published_at || new Date().toISOString(),
      notes: body.notes || null,

      // Auto-set fields for manual entries
      is_manual: true,
      created_by: userId,
      is_relevant: true,
      relevance_score: 1.00,  // Always 100% for manual entries
      crawled_at: null,       // Manual entries are not crawled

      // Default status
      status: 'new',
      is_read: false,
      keywords_matched: [],
    };

    // Insert into database
    console.log('[Manual Upload API] Inserting announcement into database...');
    console.log('[Manual Upload API] Announcement data:', JSON.stringify(announcementData, null, 2));

    const { data: announcement, error: insertError } = await supabase
      .from('subsidy_announcements')
      .insert(announcementData)
      .select()
      .single();

    if (insertError) {
      console.error('[Manual Upload API] Failed to insert announcement:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create announcement', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[Manual Upload API] Announcement created successfully:', announcement.id);

    return NextResponse.json({
      success: true,
      data: announcement,
      ...(duplicateWarning && { duplicate_warning: duplicateWarning })
    });

  } catch (error) {
    console.error('[Manual Upload API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
