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
 * @prop {string} title Название канала
 * @prop {string} avatar Хеш аватарки канала
 * @prop {number} message_id ID последнего сообщения
 * @prop {string} author UUID автора последнего сообщения
 * @prop {string} username Имя автора последнего сообщения
 * @prop {string} contents Исходный код содержимого последнего сообщения
 * @prop {string} created_at Временная отметка последнего сообщения
 * @prop {number} unread Количество непрочитанных сообщений в канале
 */
/**
 * @typedef ChannelMemberProps
 * @prop {string} joined_at Временная отметка присоединения к каналу
 * 
 * Данные отдельно взятого участника канала
 * @typedef {User & ChannelMemberProps} ChannelMember
 */

