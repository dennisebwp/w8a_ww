create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$ language plpgsql;

create table if not exists admins (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    full_name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists patients (
    id uuid primary key default gen_random_uuid(),
    whatsapp_number text not null unique,
    full_name text,
    status text not null default 'active',
    latest_profile jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists question_flows (
    id text primary key,
    sort_order integer not null unique,
    prompt text not null,
    field_key text not null,
    input_type text not null,
    validation jsonb not null default '{}'::jsonb,
    branch_map jsonb not null default '{}'::jsonb,
    next_question_id text references question_flows(id),
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists bot_sessions (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete set null,
    whatsapp_number text not null,
    current_question_id text references question_flows(id),
    status text not null default 'in_progress',
    answers jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    completed_at timestamptz
);

create index if not exists idx_bot_sessions_number_status on bot_sessions (whatsapp_number, status);

drop trigger if exists set_patients_updated_at on patients;
create trigger set_patients_updated_at
before update on patients
for each row
execute function set_updated_at();

drop trigger if exists set_question_flows_updated_at on question_flows;
create trigger set_question_flows_updated_at
before update on question_flows
for each row
execute function set_updated_at();

create table if not exists diets (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references patients(id) on delete cascade,
    title text not null,
    summary text,
    meals jsonb not null default '{}'::jsonb,
    calories_target integer,
    starts_on date,
    ends_on date,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists appointments (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references patients(id) on delete cascade,
    scheduled_for timestamptz not null,
    status text not null default 'scheduled',
    location text,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists progress_logs (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references patients(id) on delete cascade,
    weight numeric(6,2),
    body_fat_percentage numeric(5,2),
    waist_cm numeric(6,2),
    notes text,
    recorded_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now())
);

insert into admins (email, full_name)
values ('admin@example.com', 'Nutrition Admin')
on conflict (email) do nothing;

insert into question_flows (
    id,
    sort_order,
    prompt,
    field_key,
    input_type,
    validation,
    branch_map,
    next_question_id,
    is_active
) values
    ('full_name', 1, '📝 *Escribe tu nombre completo*', 'full_name', 'text', '{"required": true}'::jsonb, '{}'::jsonb, 'age', true),
    ('age', 2, '🎂 *¿Cuál es tu edad?*', 'age', 'number', '{"required": true, "min": 1, "max": 120}'::jsonb, '{}'::jsonb, 'max_weight', true),
    ('max_weight', 3, '📏 *¿Cuál ha sido tu peso máximo alcanzado?* (Especifica si son kilogramos o libras)', 'max_weight', 'text', '{"required": true}'::jsonb, '{}'::jsonb, 'current_weight', true),
    ('current_weight', 4, '⚖️ *¿Cuál es tu peso actual?* (Especifica si son kilogramos o libras)', 'current_weight', 'text', '{"required": true}'::jsonb, '{}'::jsonb, 'height_cm', true),
    ('height_cm', 5, '📐 *¿Cuál es tu estatura?* (En centímetros)', 'height_cm', 'number', '{"required": true, "min": 50, "max": 260}'::jsonb, '{}'::jsonb, 'daily_routine', true),
    ('daily_routine', 6, '🕒 *Define tu rutina diaria* (Desde que te levantas hasta que te duermes)', 'daily_routine', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'does_exercise', true),
    ('does_exercise', 7, '🏃‍♂️ *¿Realizas alguna actividad física?* (Responde Sí o No)', 'does_exercise', 'choice', '{"required": true, "allowedValues": ["si", "sí", "no"]}'::jsonb, '{"si": "training_time", "sí": "training_time", "no": "meals_per_day"}'::jsonb, null, true),
    ('training_time', 8, '⏳ *¿Cuánto tiempo llevas entrenando?* (Especifica en meses o años)', 'training_time', 'text', '{"required": true}'::jsonb, '{}'::jsonb, 'training_type', true),
    ('training_type', 9, '🏋️‍♀️ *¿Qué tipo de entreno o actividad física realizas?*', 'training_type', 'text', '{"required": true}'::jsonb, '{}'::jsonb, 'training_frequency', true),
    ('training_frequency', 10, '📅 *¿Cuántas veces por semana lo realizas?*', 'training_frequency', 'number', '{"required": true, "min": 0, "max": 14}'::jsonb, '{}'::jsonb, 'meals_per_day', true),
    ('meals_per_day', 11, '🍽️ *¿Cuántas comidas realizas al día?*', 'meals_per_day', 'number', '{"required": true, "min": 1, "max": 12}'::jsonb, '{}'::jsonb, 'breakfast', true),
    ('breakfast', 12, '🍳 *¿Qué comes usualmente en el desayuno?*', 'breakfast', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'lunch', true),
    ('lunch', 13, '🥗 *¿Qué comes usualmente en el almuerzo?*', 'lunch', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'dinner', true),
    ('dinner', 14, '🍽️ *¿Qué comes usualmente en la cena?*', 'dinner', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'snacks', true),
    ('snacks', 15, '🍪 *Si haces snacks, especifica qué comes usualmente en ellos*', 'snacks', 'textarea', '{"required": false}'::jsonb, '{}'::jsonb, 'restricted_foods', true),
    ('restricted_foods', 16, '🚫 *Menciona los alimentos que no consumes ya sea por alergias o por preferencia*', 'restricted_foods', 'textarea', '{"required": false}'::jsonb, '{}'::jsonb, 'uses_supplements', true),
    ('uses_supplements', 17, '💊 *¿Has utilizado suplementos?* (Responde Sí o No)', 'uses_supplements', 'choice', '{"required": true, "allowedValues": ["si", "sí", "no"]}'::jsonb, '{"si": "supplements_used", "sí": "supplements_used", "no": "medical_conditions"}'::jsonb, null, true),
    ('supplements_used', 18, '📦 *¿Qué suplementos has utilizado?*', 'supplements_used', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'medical_conditions', true),
    ('medical_conditions', 19, '⚕️ *¿Tienes alguna patología especial?* (Especifica)', 'medical_conditions', 'textarea', '{"required": false}'::jsonb, '{}'::jsonb, 'goals', true),
    ('goals', 20, '🎯 *¿Cuáles son tus objetivos?* (Pérdida de peso, ganar masa muscular, etc.)', 'goals', 'textarea', '{"required": true}'::jsonb, '{}'::jsonb, 'country', true),
    ('country', 21, '🌍 *¿En qué país resides?*', 'country', 'text', '{"required": true}'::jsonb, '{}'::jsonb, null, true)
on conflict (id) do update set
    sort_order = excluded.sort_order,
    prompt = excluded.prompt,
    field_key = excluded.field_key,
    input_type = excluded.input_type,
    validation = excluded.validation,
    branch_map = excluded.branch_map,
    next_question_id = excluded.next_question_id,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());
