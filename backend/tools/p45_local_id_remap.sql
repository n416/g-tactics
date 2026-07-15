-- 【警告】このスクリプトには連鎖バグがある（旧1→新4 の後に 旧4→新24 の規則が走るため、
-- 旧1所持者が二段変換される）。実行時(2026-07-13)はローカルDBに該当行が0件だったため実害なし。
-- 再利用する場合は一時オフセット（+10000等）を挟んだ二段階変換に書き直すこと。
-- Dummy ID to New ID Migration
UPDATE characters SET weapon_id = 4 WHERE weapon_id = 1;
UPDATE characters SET item1_id = 4 WHERE item1_id = 1;
UPDATE characters SET item2_id = 4 WHERE item2_id = 1;
UPDATE item_inventory SET item_id = 4 WHERE item_id = 1;
UPDATE characters SET weapon_id = 1 WHERE weapon_id = 2;
UPDATE characters SET item1_id = 1 WHERE item1_id = 2;
UPDATE characters SET item2_id = 1 WHERE item2_id = 2;
UPDATE item_inventory SET item_id = 1 WHERE item_id = 2;
UPDATE characters SET weapon_id = 14 WHERE weapon_id = 3;
UPDATE characters SET item1_id = 14 WHERE item1_id = 3;
UPDATE characters SET item2_id = 14 WHERE item2_id = 3;
UPDATE item_inventory SET item_id = 14 WHERE item_id = 3;
UPDATE characters SET weapon_id = 24 WHERE weapon_id = 4;
UPDATE characters SET item1_id = 24 WHERE item1_id = 4;
UPDATE characters SET item2_id = 24 WHERE item2_id = 4;
UPDATE item_inventory SET item_id = 24 WHERE item_id = 4;
UPDATE characters SET weapon_id = 20 WHERE weapon_id = 5;
UPDATE characters SET item1_id = 20 WHERE item1_id = 5;
UPDATE characters SET item2_id = 20 WHERE item2_id = 5;
UPDATE item_inventory SET item_id = 20 WHERE item_id = 5;
UPDATE characters SET weapon_id = 245 WHERE weapon_id = 6;
UPDATE characters SET item1_id = 245 WHERE item1_id = 6;
UPDATE characters SET item2_id = 245 WHERE item2_id = 6;
UPDATE item_inventory SET item_id = 245 WHERE item_id = 6;
UPDATE characters SET weapon_id = 83 WHERE weapon_id = 7;
UPDATE characters SET item1_id = 83 WHERE item1_id = 7;
UPDATE characters SET item2_id = 83 WHERE item2_id = 7;
UPDATE item_inventory SET item_id = 83 WHERE item_id = 7;
UPDATE characters SET weapon_id = 86 WHERE weapon_id = 8;
UPDATE characters SET item1_id = 86 WHERE item1_id = 8;
UPDATE characters SET item2_id = 86 WHERE item2_id = 8;
UPDATE item_inventory SET item_id = 86 WHERE item_id = 8;
UPDATE characters SET weapon_id = 94 WHERE weapon_id = 9;
UPDATE characters SET item1_id = 94 WHERE item1_id = 9;
UPDATE characters SET item2_id = 94 WHERE item2_id = 9;
UPDATE item_inventory SET item_id = 94 WHERE item_id = 9;
