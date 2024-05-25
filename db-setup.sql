-- здесь надо указать пароль, совпадающий с записанным в .env
create user tsc_backend with encrypted password '...';

-- некоторые типы данных
create type user_role as enum ('student', 'teacher', 'curator', 'admin');
create type scoring_system as enum ('abstract', 'points');
create type attachment_type as enum ('image', 'video', 'file', 'sticker');
create type chat_notif_type as enum ('unread', 'mention');

-- #region ТАБЛИЦЫ
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
insert into channels values
	('10000000-0000-4000-0000-000000000000', 'Флудилка', false, true),
	('10000000-0000-4000-0000-000000000001', 'Общий канал потоков', false, true);


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

-- таблица-шаблон для фида (данных при входе в чат)
create table _feed_template (
	id uuid,
	title varchar(128),
	avatar text,
	private_role user_role,
	last_id int,
	last_content varchar(1024),
	last_at timestamptz,
	last_author_id uuid,
	last_author_name varchar(128),
	unread_count bigint
);
-- #endregion

-- #region ПРОЦЕДУРЫ
-- алиас для перевода uuid в хеш аватара
create or replace function id2hash(
	_uuid uuid
) returns text
language sql
as $$ select encode(sha256(convert_to(_uuid::text, 'UTF-8')), 'hex'); $$;

-- для создания канала
create or replace function create_channel(
	_title varchar(128),
	_users uuid[]
) returns table (
	id uuid,
	title varchar(128),
	avatar text
)
language plpgsql
as $$
declare
	chk_f int;
	chk_e int = array_length(_users, 1);
	cur_user uuid;
	new_data channels%rowtype;
begin
	select count(1) into chk_f from users u where u.id = any(_users);
	if chk_f <> chk_e then
		raise '% of % users don''t exist', chk_e - chk_f, chk_e;
	end if;

	insert into channels (title) values (_title) returning * into new_data;
	foreach cur_user in array _users loop
		insert into channel_members values (cur_user, new_data.id, 'now');
	end loop;
	return query select
		new_data.id,
		new_data.title,
		encode(sha256(convert_to(new_data.id::text, 'UTF-8')), 'hex') avatar
	;
end; $$;

-- для создания личных сообщений
create or replace function create_dm(
	_peer1 uuid,
	_peer2 uuid
) returns table (
	id uuid,
	u1_id uuid, u1_name varchar(128), u1_avatar text, u1_role user_role,
	u2_id uuid, u2_name varchar(128), u2_avatar text, u2_role user_role
)
language plpgsql
as $$
declare
	CHK_PASS constant smallint = 2;
	chk smallint;
	user1 record;
	user2 record;
	new_id uuid;
	cur_id uuid;
	test bool = false;
begin
	if _peer1 = _peer2 then
		raise 'unable to create DM with yourself';
	end if;

	select count(1) into chk from users u where u.id in (_peer1, _peer2);
	if chk <> CHK_PASS then
		raise 'one or both of the peers doesn''t exist';
	end if;

	select u.id, "name", encode(sha256(convert_to(u.id::text, 'UTF-8')), 'hex') avatar, "role" into user1
		from users u where u.id = _peer1;
	select u.id, "name", encode(sha256(convert_to(u.id::text, 'UTF-8')), 'hex') avatar, "role" into user2
		from users u where u.id = _peer2;

	select true into test from channels
		where title = concat(_peer1, '--', _peer2) or title = concat(_peer2, '--', _peer1);
	
	if test = true then
		raise 'DM between these two users already exist';
	end if;

	insert into channels as chn (title, is_private) values (concat(_peer1, '--', _peer2), true) returning chn.id into new_id;
	foreach cur_id in array array[_peer1, _peer2] loop
		insert into channel_members values (cur_id, new_id, 'now');
	end loop;

	return query select
		new_id id,
		user1.id u1_id, user1."name" u1_name, user1.avatar u1_avatar, user1."role" u1_role,
		user2.id u2_id, user2."name" u2_name, user2.avatar u2_avatar, user2."role" u2_role
	;
end; $$;

-- для сбора фида
create or replace function get_feed(
	_user uuid
) returns setof _feed_template
language plpgsql
as $$
declare
	TABLE_NAME constant text = concat('feed_', _user);
	cur refcursor;
	this record;  -- текущий канал
	spt record;   -- дополнительные данные
	stm text;     -- текст форматированного запроса
begin
	-- создаем таблицу, в которую будем компилировать данные
	-- она временная, то есть удалится сама после завершения работы
	execute format('create temp table %I on commit drop as table "_feed_template" with no data;', TABLE_NAME);

	-- выбираем все каналы пользователя
	open cur for
		select *
		from channels c
		where is_static or c.id in (select channel from channel_members cm where "user" = _user);
	-- и с помощью курсора обходим их
	loop
		fetch next from cur into this;
		exit when not found;

		-- готовим первый запрос с основными данными
		stm = format('insert into %I (id, title, avatar, private_role) values', TABLE_NAME);
		if this.is_private then  -- лс требует специфических данных
			select * from users where id = (
				select "user" from channel_members cm where "user" <> _user and channel = this.id
			) into spt;
			stm = concat(stm, format('(%L, %L, %L, %L);', this.id, spt."name", id2hash(spt.id), spt."role"));
		else  -- тут все просто
			stm = concat(stm, format('(%L, %L, %L, null)', this.id, this.title, id2hash(this.id)));
		end if;
		execute stm;  -- добавляем запись

		-- теперь нам нужно собрать данные по последнему сообщению в канале
		select * from messages m where m.channel = this.id order by m.id desc limit 1 into spt;
		if spt.id is null then  -- если его нет, просто пихаем -инфинити вместо таймштампа; все остальное остается нуллами
			execute format('update %I set last_at = %L where id = %L;', TABLE_NAME, '-Infinity', this.id);
		else
			-- записываем в шаблон полученные данные сообщения
			stm = format('update %I set last_id = %L, last_content = %L, last_at = %L,',
				TABLE_NAME, spt.id, spt.contents, spt.created_at
			);
			-- и еще автора не забудем
			select * from users u where u.id = spt.author into spt;
			stm = concat(stm, format('last_author_id = %L, last_author_name = %L where id = %L;',
				spt.id, spt."name", this.id
			));
			execute stm;  -- записываем
		end if;

		-- и наконец добавляем счетчик непрочитанного
		execute format('update %I set unread_count = (
			select count(1) from messages where created_at > coalesce(
				(select last_view from acknowledgements where "user" = %L and channel = %3$L),
				''epoch''
			) and channel = %3$L)::int;', TABLE_NAME, _user, this.id);
	end loop;
	close cur;  -- закрываем курсор

	-- сортируем и возвращаем данные
	return query execute format('select * from %I order by last_at desc, title asc;', TABLE_NAME);
end; $$;
-- #endregion

-- раздаем разрешения
grant usage on schema public to tsc_backend;
grant all privileges on all tables in schema public to tsc_backend;
grant all privileges on sequence messages_id_seq to tsc_backend;
