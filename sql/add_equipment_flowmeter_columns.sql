-- Add discharge_flowmeter and supply_flowmeter columns to businesses table
-- These columns store office-managed equipment counts that can be updated from field check data

-- Add columns if they don't exist
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS discharge_flowmeter INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS supply_flowmeter INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN businesses.discharge_flowmeter IS '배출전류계 수량 (사무실 관리 데이터)';
COMMENT ON COLUMN businesses.supply_flowmeter IS '송풍전류계 수량 (사무실 관리 데이터)';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_businesses_equipment_flowmeters
ON businesses(discharge_flowmeter, supply_flowmeter);
