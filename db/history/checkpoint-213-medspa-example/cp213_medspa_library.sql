-- CP-213 · Med spa image library: replace the old Pexels set with Dermis-approved photos.
-- The files ship with the app in /public/medspa-example, so run this AFTER the CP-213 push is live.
-- Only the library catalog rows are removed; the old storage files stay (the /med-spas site still uses some).
begin;
delete from public.image_library where industry = 'medspa';
insert into public.image_library (industry, category, title, tags, storage_path, public_url, credit, width, height, sort_order) values
  ('medspa','hero','Glowing skin, eyes closed','{glow,skin,portrait}','static/medspa-example/hero-glow.jpg','https://www.atlas-engine.app/medspa-example/hero-glow.jpg','Dermis (approved)',1280,720,0),
  ('medspa','hero','Radiant skin profile','{skin,glow,profile}','static/medspa-example/t-morpheus8.jpg','https://www.atlas-engine.app/medspa-example/t-morpheus8.jpg','Dermis (approved)',1200,675,1),
  ('medspa','hero','Ageless skin, hands on face','{anti-aging,lift,skin}','static/medspa-example/t-emface.jpg','https://www.atlas-engine.app/medspa-example/t-emface.jpg','Dermis (approved)',1200,675,2),
  ('medspa','hero','Confident smile outdoors','{lifestyle,confidence}','static/medspa-example/lib-mood.jpg','https://www.atlas-engine.app/medspa-example/lib-mood.jpg','Dermis (approved)',1280,720,3),
  ('medspa','reward','Facial glow portrait','{hydrafacial,facial,glow}','static/medspa-example/t-hydrafacial.jpg','https://www.atlas-engine.app/medspa-example/t-hydrafacial.jpg','Dermis (approved)',1200,675,4),
  ('medspa','reward','Clear, even skin tone','{laser,pigmentation,skin}','static/medspa-example/t-alma-harmony.jpg','https://www.atlas-engine.app/medspa-example/t-alma-harmony.jpg','Dermis (approved)',1200,675,5),
  ('medspa','reward','Vitamin C serum bottle','{serum,skincare,product}','static/medspa-example/t-ce-ferulic.jpg','https://www.atlas-engine.app/medspa-example/t-ce-ferulic.jpg','Dermis (approved)',1200,675,6),
  ('medspa','reward','Gentle cleanser bottle','{cleanser,skincare,product}','static/medspa-example/t-alastin-cleanser.jpg','https://www.atlas-engine.app/medspa-example/t-alastin-cleanser.jpg','Dermis (approved)',1200,675,7),
  ('medspa','offer','Smooth skin, gentle touch','{botox,injectables,skin}','static/medspa-example/t-botox.jpg','https://www.atlas-engine.app/medspa-example/t-botox.jpg','Dermis (approved)',1200,675,8),
  ('medspa','offer','Lifted jawline','{tightening,lift,skin}','static/medspa-example/t-sofwave.jpg','https://www.atlas-engine.app/medspa-example/t-sofwave.jpg','Dermis (approved)',1200,675,9),
  ('medspa','offer','Natural skin close-up','{skin,eyes,natural}','static/medspa-example/lib-eyes.jpg','https://www.atlas-engine.app/medspa-example/lib-eyes.jpg','Dermis (approved)',1280,720,10),
  ('medspa','offer','Neck and jawline','{tightening,neck,body}','static/medspa-example/lib-tightening.jpg','https://www.atlas-engine.app/medspa-example/lib-tightening.jpg','Dermis (approved)',1280,720,11);
commit;
