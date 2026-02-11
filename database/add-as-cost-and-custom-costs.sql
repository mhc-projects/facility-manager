-- Migration: Add AS Cost and Custom Additional Costs to business_info table
-- Date: 2025-02-11
-- Description: Add as_cost and custom_additional_costs columns for flexible cost management

-- ===================================================
-- PHASE 1: Add New Columns
-- ===================================================

-- Add AS cost column (single decimal value per business)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS as_cost DECIMAL(12, 2) DEFAULT 0 CHECK (as_cost >= 0);

-- Add custom additional costs column (JSONB array for flexible cost items)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS custom_additional_costs JSONB DEFAULT '[]'::jsonb;

-- ===================================================
-- PHASE 2: Create Performance Indexes
-- ===================================================

-- Partial index for AS costs (only index non-zero values for performance)
CREATE INDEX IF NOT EXISTS idx_business_info_as_cost
ON business_info(as_cost)
WHERE as_cost > 0;

-- GIN index for custom costs JSONB operations (only index non-empty arrays)
CREATE INDEX IF NOT EXISTS idx_business_info_custom_costs
ON business_info USING GIN (custom_additional_costs)
WHERE jsonb_array_length(custom_additional_costs) > 0;

-- ===================================================
-- PHASE 3: Data Validation
-- ===================================================

-- Verify column creation
DO $$
DECLARE
    as_cost_exists BOOLEAN;
    custom_costs_exists BOOLEAN;
BEGIN
    -- Check if as_cost column exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'business_info'
        AND column_name = 'as_cost'
    ) INTO as_cost_exists;

    -- Check if custom_additional_costs column exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'business_info'
        AND column_name = 'custom_additional_costs'
    ) INTO custom_costs_exists;

    -- Report results
    IF as_cost_exists AND custom_costs_exists THEN
        RAISE NOTICE '✅ Migration successful: Both columns created';
        RAISE NOTICE '   - as_cost: DECIMAL(12,2) with DEFAULT 0 and CHECK constraint';
        RAISE NOTICE '   - custom_additional_costs: JSONB with DEFAULT []';
    ELSE
        IF NOT as_cost_exists THEN
            RAISE WARNING '❌ as_cost column creation failed';
        END IF;
        IF NOT custom_costs_exists THEN
            RAISE WARNING '❌ custom_additional_costs column creation failed';
        END IF;
    END IF;
END $$;

-- ===================================================
-- PHASE 4: Verify Indexes
-- ===================================================

-- List created indexes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'business_info'
AND (
    indexname = 'idx_business_info_as_cost'
    OR indexname = 'idx_business_info_custom_costs'
);

-- ===================================================
-- ROLLBACK SCRIPT (commented out - use only if needed)
-- ===================================================

/*
-- Remove indexes first
DROP INDEX IF EXISTS idx_business_info_as_cost;
DROP INDEX IF EXISTS idx_business_info_custom_costs;

-- Remove columns
ALTER TABLE business_info DROP COLUMN IF EXISTS as_cost;
ALTER TABLE business_info DROP COLUMN IF EXISTS custom_additional_costs;

-- Verify rollback
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'business_info'
AND column_name IN ('as_cost', 'custom_additional_costs');
*/

-- ===================================================
-- NOTES
-- ===================================================

-- Custom costs JSONB structure example:
-- [
--   {"name": "특별 수리비", "amount": 50000},
--   {"name": "긴급 출장비", "amount": 30000}
-- ]

-- Usage in queries:
-- SELECT
--   business_name,
--   as_cost,
--   custom_additional_costs,
--   (
--     SELECT COALESCE(SUM((item->>'amount')::numeric), 0)
--     FROM jsonb_array_elements(custom_additional_costs) AS item
--   ) AS total_custom_costs
-- FROM business_info
-- WHERE as_cost > 0 OR jsonb_array_length(custom_additional_costs) > 0;
