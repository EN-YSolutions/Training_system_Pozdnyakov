/**
 * Группа прав пользователя чата
 * @typedef {"student" | "teacher" | "curator" | "admin"} UserRole
 */
/**
 * Пользователь чата
 * @typedef User
 * @prop {string} id UUID пользователя
 * @prop {string} avatar Хеш аватара пользователя
 * @prop {string} name Имя пользователя
 * @prop {UserRole} role Группа прав пользователя
 */
/**
 * Канал, информация о котором выдается при входе в чат
 * @typedef FeedChannel
 * @prop {string} id UUID канала
 * @prop {string} title Название канала или имя пользователя в ЛС
 * @prop {string} avatar Хеш аватарки канала
 * @prop {string?} private_id UUID собеседника в ЛС; `null`, если это канал
 * @prop {UserRole?} private_role группа прав пользователя в ЛС; `null`, если это канал
 * @prop {number?} last_id ID последнего сообщения
 * @prop {string?} last_author_id UUID автора последнего сообщения
 * @prop {string?} last_author_name Имя автора последнего сообщения
 * @prop {string?} last_content Исходный код содержимого последнего сообщения
 * @prop {string?} last_at Временная отметка последнего сообщения
 * @prop {number} unread_count Количество непрочитанных сообщений в канале
 */
/**
 * @typedef ChannelMemberProps
 * @prop {string} joined_at Временная отметка присоединения к каналу
 * 
 * Данные отдельно взятого участника канала
 * @typedef {User & ChannelMemberProps} ChannelMember
 */

