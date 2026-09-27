-- CP-168 · make every image cacheable for a year
--
-- Every object uploaded before CP-164 carries cacheControl "max-age=3600":
-- phones and the CDN edge re-download logos / reward photos every hour.
-- New uploads already get one year (CP-164 image-uploader). This brings the
-- existing 960 objects in line. Safe because every image URL the app uses
-- is unique per upload (timestamped filename and/or ?v= stamp), so a
-- replaced image always gets a new URL and never fights the cache.
--
-- Idempotent. Safe to re-run.
update storage.objects
   set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{cacheControl}', '"max-age=31536000"'::jsonb)
 where bucket_id in ('business-heroes','business-logos','folder-covers','image-library','membership-images','news-images','offer-images','reward-images')
   and coalesce(metadata->>'cacheControl', '') <> 'max-age=31536000';

select bucket_id, metadata->>'cacheControl' as cache_control, count(*)
  from storage.objects
 group by 1, 2 order by 1, 2;
