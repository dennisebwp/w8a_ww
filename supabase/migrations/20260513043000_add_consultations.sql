create table if not exists consultations (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references patients(id) on delete cascade,
    summary text,
    notes text,
    objectives jsonb not null default '{}'::jsonb,
    metrics jsonb not null default '{}'::jsonb,
    weekly_plan jsonb not null default '{}'::jsonb,
    created_by_user_id uuid,
    created_at timestamptz not null default timezone('utc', now())
);
