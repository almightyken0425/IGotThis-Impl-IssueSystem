-- 保留既有相對順序。相同位置沿用舊版的選項值排序。
-- 各工單型別的位置改為從一開始的連續整數。
WITH ranked AS (
  SELECT company_id, issue_type_id, value,
         row_number() OVER (
           PARTITION BY company_id, issue_type_id
           ORDER BY sort_order, value
         ) AS position
  FROM resolution_options
)
UPDATE resolution_options AS options
SET sort_order = ranked.position::integer
FROM ranked
WHERE options.company_id = ranked.company_id
  AND options.issue_type_id = ranked.issue_type_id
  AND options.value = ranked.value;
