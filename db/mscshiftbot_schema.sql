    created_at timestamp with time zone DEFAULT now() NOT NULL
COPY public.hold_photos (id, shift_id, hold_id, telegram_file_id, disk_path, disk_public_url, created_at) FROM stdin;

-- Таблица сопоставления трюмов и идентификаторов папок Directus
CREATE TABLE IF NOT EXISTS public.hold_directus_folders (
    shift_id integer NOT NULL,
    hold_id integer NOT NULL,
    directus_folder_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hold_directus_folders_pkey PRIMARY KEY (shift_id, hold_id)
);
