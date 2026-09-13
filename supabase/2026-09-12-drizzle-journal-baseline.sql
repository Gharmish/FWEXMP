-- 2026-09-12 — drizzle migration journal BASELINE for the live database
-- (2026-09 engineering audit DATA-01, second-pass verification F23).
--
-- Production was built by hand-applied DDL (Supabase MCP apply_migration);
-- drizzle's own bookkeeping table never existed there, so `pnpm db:migrate`
-- against production would replay from 0000 and abort on the first
-- CREATE TYPE that already exists. This script records 0000–0032 — the
-- migrations verified as applied on 2026-09-12 — as done, using exactly the
-- hashes drizzle computes (sha256 of the file bytes) and the journal's
-- `when` millis as created_at, so the migrator continues from 0033.
--
-- Run ONCE, read-only against the schema otherwise. Idempotent: it inserts
-- nothing if the table already has rows. Then `pnpm db:migrate` applies
-- 0033–0036 (or apply them via MCP and insert their rows the same way —
-- `pnpm db:preflight` reports what is missing).
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT v.hash, v.created_at
FROM (VALUES
  ('f7419daa9eeeb46da81e4257da170b2b2b8551baf973b8e08e8afaa7effd838f', 1778860272220), -- 0000_wet_mandroid
  ('45023698b81a8b3ab7644c748fb0c2adcfa19cd34f6a3681875c58e80af5510d', 1779496634444), -- 0001_organic_warpath
  ('16f192886cc9f7b62244e09fb6010e565c2a3602a5ad086f023647f33fa9d60d', 1779528330230), -- 0002_broken_doorman
  ('456eb81192945c1d1e4c68d287eb62877421afde6b862c563f5f0110223badf0', 1779530376878), -- 0003_ordinary_captain_britain
  ('810353831bf30d42f2c5b186093032dcdc97442d6be72f68bf019e7e06ae9ca9', 1779555221498), -- 0004_jittery_bug
  ('c79e3cf4b6f1f901d6bc4c724e322b94fa11d75784828e805c0aef571f7d313e', 1779555580818), -- 0005_new_korath
  ('32788b5bfa4328f2c3c94ee17436600f34d2d5e0fc65dc3f25650761c064f0d5', 1780079192834), -- 0006_vengeful_prima
  ('619fa26741c5a53a880aab426bda17a08459a8fcd0308cf53dcf55b39d01d0c8', 1780080288851), -- 0007_high_tony_stark
  ('7dc60c764a0d7648333c27ae595a438ab464744d118fab17ace3787508914b3a', 1780082039425), -- 0008_bizarre_vin_gonzales
  ('10c07599c0955f6f95857ef9fea6cbacfdab9887b539a0ddb025754aa1d5af21', 1780094851557), -- 0009_reflective_magik
  ('69a66bc3815c01c79bd42aa02b61535a0faeffa5564234ca2e9196912ff8ef58', 1780237060242), -- 0010_even_matthew_murdock
  ('9de716f1f737ce854be3bbd939717845d26d856a097ce16b768acb3159285424', 1780249939759), -- 0011_spotty_talisman
  ('dda323cc3953a8ed17afe9e9e2b1db907d8102e698e1eb3dc92bacfcbb5ede6e', 1780293341878), -- 0012_naive_shotgun
  ('0bc2c1ea1589dbd59a455813fdace46463cdd58aaed317756c4ee4e96debc8f7', 1780294718525), -- 0013_pale_puma
  ('2be33b4699d2b0ceebe71459f9f25d93b2187b3c82fd1d7e434a770207de7e21', 1780395232663), -- 0014_perfect_hex
  ('f2b8edd7d65a8093c80a5b1a03bba4628fcaa4561af62e907e07f68d736128fc', 1780559255040), -- 0015_superb_mother_askani
  ('2a521089311e5403988a6ff4db59d8adb57017857b0b2cf3add365693e62927f', 1781016237106), -- 0016_tense_joshua_kane
  ('235b041b947f7c674cd45c2f4b541aafd72ca5b4c41e76e328785dbce53d4a4a', 1781092936554), -- 0017_smooth_thanos
  ('36c25a50651e7903b1e0e8588d92adc618cfd2f472a5f6fb886043b8a50adb43', 1781116417536), -- 0018_dusty_kronos
  ('6215916f142d16cd89a7f262bcfa39e8a33e0d399db96486cb3fe3a30f259861', 1781118060023), -- 0019_tiny_radioactive_man
  ('d09f5822810c8762f530c954bd2fbce650ffc04e8d0834ad92bffab7c5621647', 1781165598030), -- 0020_sour_stellaris
  ('717b2e954ecd48567636e34e6bb840418b7f39d9bdc7db51deb34549b687662b', 1783424014386), -- 0021_wandering_harpoon
  ('42597f27b57d5269034a1709f230920db7f63cba230dd1e523ef0e2f65303a35', 1783427407965), -- 0022_busy_harrier
  ('3d9b7576d1bec902b47e5201f705ba553a75f3b48ca3c95b5e71785607ff3f9f', 1783430757118), -- 0023_married_bloodstrike
  ('996bc2dc568c4937712fdaab104ab12a6b6350476203de038da73b3fb87450d9', 1783459021332), -- 0024_classy_morph
  ('97d8549303048cd9fee7a81190d980e9e7c5e65b1fa06f18fa5ead6142cee46a', 1783504131177), -- 0025_daffy_nextwave
  ('96b44b41ad33c376b868af955aab61edc3384bceb8bd4046b1a4014a6f732e2c', 1783509777880), -- 0026_violet_smiling_tiger
  ('990d68073eb1a9cfd18524fcb03130c7f7dc6b3306c213f432be5009052657e3', 1783547775484), -- 0027_material_juggernaut
  ('f645c031f421f8d9e373a6b6f94f6ca157fb7aa0032ad9e4553478efe65e76e0', 1783576989962), -- 0028_strong_callisto
  ('aea5062eadd2d3fe3f739542593ef7769721d94979f5e02576bfdd05a0be7802', 1784451551833), -- 0029_spicy_morg
  ('0e32e0b1788a1707fe8b4ecc27adc78177560a414ca0c9162232bb2729cdfc1a', 1784479092234), -- 0030_fantastic_bill_hollister
  ('9bb307b18266bd1ec48b23df1a290c4865a52c83ca4811c09e47e120ec0175d2', 1785644576191), -- 0031_magical_norman_osborn
  ('604848a8fbd8a2192c29e1251298c327a8a65cf82d758cebd4a5d29685cb9572', 1789126882020) -- 0032_catch_up_2026_09
) AS v(hash, created_at)
WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations");
