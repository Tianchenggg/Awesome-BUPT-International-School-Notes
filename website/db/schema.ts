import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const forumThreads = sqliteTable('forum_threads', {
  id: text('id').primaryKey(), course: text('course').notNull(), kind: text('kind').notNull(),
  subject: text('subject').notNull(), message: text('message').notNull(), author: text('author').notNull(),
  ownerHash: text('owner_hash').notNull(), payloadHash: text('payload_hash').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
  deleted: integer('deleted').notNull().default(0),
}, t => [index('forum_threads_course_updated').on(t.course,t.updatedAt,t.id),index('forum_threads_updated').on(t.updatedAt,t.id)]);
export const forumReplies = sqliteTable('forum_replies', {
  id: text('id').primaryKey(), threadId: text('thread_id').notNull().references(()=>forumThreads.id),
  message: text('message').notNull(), author: text('author').notNull(), ownerHash: text('owner_hash').notNull(),
  payloadHash: text('payload_hash').notNull(), createdAt: integer('created_at').notNull(), deleted: integer('deleted').notNull().default(0),
}, t => [index('forum_replies_thread_created').on(t.threadId,t.createdAt,t.id)]);
export const forumLimits = sqliteTable('forum_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('forum_limits_expiry').on(t.expiresAt)]);
