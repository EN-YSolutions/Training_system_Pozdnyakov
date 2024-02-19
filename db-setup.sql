create user backend with encrypted password '[DATA EXPUNGED]';

create type user_role as enum ('student', 'teacher', 'curator', 'admin');
create type scoring_system as enum ('abstract', 'points');
create type attachment_type as enum ('image', 'video', 'file', 'sticker');
create type chat_notif_type as enum ('unread', 'mention');

create table users (
  id uuid primary key default gen_random_uuid(),
  login varchar(32) not null unique,
  "password" char(60) not null,
  "role" user_role not null default 'student',
  "name" varchar(128) not null,
  balance money not null default 0.0,
  "scoring_system" scoring_system not null default 'abstract'
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  title varchar(128) not null unique,
  is_private bool not null default false,
  is_static bool not null default false
);

create table messages (
  id serial4 primary key,
  channel uuid not null,
  author uuid not null,
  contents varchar(1024),
  created_at timestamptz not null default current_timestamp,
  
  constraint fk_channel foreign key (channel) references channels(id) on update cascade on delete cascade,
  constraint fk_author foreign key (author) references users(id) on update cascade on delete restrict
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  "type" attachment_type not null,
  message int4,
  file_name varchar(128) not null,
  
  constraint fk_message foreign key (message) references messages(id) on update cascade on delete set null
);

create table chat_notifications (
  "user" uuid,
  channel uuid,
  "type" chat_notif_type not null,
  message int4,
  created_at timestamptz not null default current_timestamp,
  
  primary key ("user", channel),
  constraint fk_user foreign key ("user") references users(id) on update cascade on delete cascade,
  constraint fk_channel foreign key (channel) references channels(id) on update cascade on delete cascade,
  constraint fk_message foreign key (message) references messages(id) on update cascade on delete cascade
);

create table acknowledgements (
  "user" uuid,
  channel uuid,
  last_view timestamptz not null default current_timestamp,
  
  primary key ("user", channel),
  constraint fk_user foreign key ("user") references users(id) on update cascade on delete cascade,
  constraint fk_channel foreign key (channel) references channels(id) on update cascade on delete cascade
);

create table channel_members (
  "user" uuid,
  channel uuid,
  joined_at timestamptz not null default current_timestamp,
  
  primary key ("user", channel),
  constraint fk_user foreign key ("user") references users(id) on update cascade on delete cascade,
  constraint fk_channel foreign key (channel) references channels(id) on update cascade on delete cascade
);

grant all privileges on all tables in schema public to backend;
grant all privileges on sequence messages_id_seq to backend;
