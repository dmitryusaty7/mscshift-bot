    created_at timestamp with time zone DEFAULT now() NOT NULL
COPY public.hold_photos (id, shift_id, hold_id, telegram_file_id, disk_path, disk_public_url, created_at) FROM stdin;
