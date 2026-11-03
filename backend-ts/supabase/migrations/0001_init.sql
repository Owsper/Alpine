create table jobs (
	id uuid primary key,
	user_id uuid not null,
	description text not null,
	company_name text,
	company_url text check (company_url ~* '^https?://'),
	company_key text,
	role_title text,
	demo boolean not null default false,
	created_at timestamptz not null default now()
);
create index jobs_user_idx on jobs(user_id);

create table company_facts (
	id uuid primary key default gen_random_uuid(),
	job_id uuid not null references jobs(id) on delete cascade,
	company_key text,
	claim text not null,
	source_url text not null check (source_url ~* '^https?://'),
	retrieved_at timestamptz not null
);
create index company_facts_key_idx on company_facts(company_key,retrieved_at desc);
create index company_facts_job_idx on company_facts(job_id);

create table sessions (
	id uuid primary key,
	user_id uuid not null,
	job_id uuid not null references jobs(id) on delete cascade,
	number int not null check (number > 0),
	status text not null default 'created' check (status in ('created','in_progress','completed','graded')),
	questions jsonb not null,
	flow jsonb not null,
	interviewer_instructions text not null,
	transcript jsonb,
	grading_started_at timestamptz(3),
	source_session_id uuid references sessions(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz(3) not null default now(),
	constraint sessions_job_number_key unique(job_id,number)
);
create index sessions_user_idx on sessions(user_id);
create index sessions_source_idx on sessions(source_session_id);

create table scores (
	session_id uuid primary key references sessions(id) on delete cascade,
	scores jsonb not null,
	strengths jsonb not null,
	weakest jsonb not null,
	progress jsonb,
	fallback boolean not null default false,
	graded_at timestamptz not null default now()
);

create table plans (
	id uuid primary key,
	session_id uuid not null unique references sessions(id) on delete cascade,
	next_session_id uuid not null references sessions(id) on delete cascade,
	weakest jsonb not null,
	composition jsonb not null,
	created_at timestamptz not null default now()
);
create index plans_next_idx on plans(next_session_id);

alter table jobs enable row level security;
alter table company_facts enable row level security;
alter table sessions enable row level security;
alter table scores enable row level security;
alter table plans enable row level security;

-- new tables are no longer exposed by default, without this every store call fails with 42501. anon and authenticated get nothing
grant select,insert,update,delete on all tables in schema public to service_role;
