-- TODO: Review for merge — исправляем схему таблицы hold_photos для Блока 8
ALTER TABLE public.hold_photos ADD COLUMN IF NOT EXISTS disk_path text;
ALTER TABLE public.hold_photos ADD COLUMN IF NOT EXISTS disk_public_url text;
ALTER TABLE public.hold_photos ADD COLUMN IF NOT EXISTS directus_file_id uuid;
ALTER TABLE public.hold_photos ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- TODO: Review for merge — наполняем отсутствующие значения для совместимости
UPDATE public.hold_photos SET created_at = now() WHERE created_at IS NULL;
UPDATE public.hold_photos SET disk_path = '' WHERE disk_path IS NULL;

-- TODO: Review for merge — выставляем безопасные дефолты и ограничения
ALTER TABLE public.hold_photos ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.hold_photos ALTER COLUMN disk_path SET NOT NULL;
ALTER TABLE public.hold_photos ALTER COLUMN created_at SET NOT NULL;
