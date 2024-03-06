-- создаем базу данных и пользователя
-- вместо [DATA EXPUNGED] надо указать пароль,
-- который затем пойдет в файл .env
create database training_system_chat;
create user tsc_backend with encrypted password '[DATA EXPUNGED]';

-- некоторые типы данных
create type user_role as enum ('student', 'teacher', 'curator', 'admin');
create type scoring_system as enum ('abstract', 'points');
create type attachment_type as enum ('image', 'video', 'file', 'sticker');
create type chat_notif_type as enum ('unread', 'mention');

-- таблица пользователей
create table users (
  id uuid primary key default gen_random_uuid(),
  "login" varchar(32) not null unique,
  "password" char(60) not null,
  "role" user_role not null default 'student',
  "name" varchar(128) not null,
  balance money not null default 0.0,
  "scoring_system" scoring_system not null default 'abstract'
);

-- таблица каналов
create table channels (
  id uuid primary key default gen_random_uuid(),
  title varchar(128) not null unique,
  is_private bool not null default false,
  is_static bool not null default false
);

-- таблица сообщений
create table messages (
  id serial4 primary key,
  channel uuid not null references channels(id) on update cascade on delete cascade,
  author uuid not null references users(id) on update cascade on delete restrict,
  contents varchar(1024),
  created_at timestamptz not null default current_timestamp,
  edited_at timestamptz
);

-- таблица вложенных файлов
create table attachments (
  id uuid primary key default gen_random_uuid(),
  "type" attachment_type not null,
  "message" int4 references messages(id) on update cascade on delete set null,
  file_name varchar(128) not null,
  created_at timestamptz not null default current_timestamp
);

-- таблица уведомлений чата
create table chat_notifications (
  "user" uuid references users(id) on update cascade on delete cascade,
  channel uuid references channels(id) on update cascade on delete cascade,
  "type" chat_notif_type not null,
  "message" int4 references messages(id) on update cascade on delete cascade,
  created_at timestamptz not null default current_timestamp,

  primary key ("user", channel)
);

-- таблица меток прочитанного
create table acknowledgements (
  "user" uuid references users(id) on update cascade on delete cascade,
  channel uuid references channels(id) on update cascade on delete cascade,
  last_view timestamptz not null default current_timestamp,

  primary key ("user", channel)
);

-- таблица участников каналов
create table channel_members (
  "user" uuid references users(id) on update cascade on delete cascade,
  channel uuid references channels(id) on update cascade on delete cascade,
  joined_at timestamptz not null default current_timestamp,

  primary key ("user", channel)
);

-- раздаем разрешения
grant usage on schema public to tsc_backend;
grant all privileges on all tables in schema public to tsc_backend;
grant all privileges on sequence messages_id_seq to tsc_backend;
