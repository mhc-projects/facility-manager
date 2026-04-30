-- 군위군 행정구역 변경: 경상북도 → 대구광역시 (2023년 7월 편입)
UPDATE business_info
SET local_government = '대구광역시 군위군'
WHERE local_government = '경상북도 군위군';
