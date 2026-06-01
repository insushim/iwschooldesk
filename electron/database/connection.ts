import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { runMigrations } from './migrations'
import { runDataMigrations } from './data-migrations'

let db: Database.Database | null = null
// 앱 종료 시 closeDatabase() 가 한 번 호출되면 다시는 열지 않는다.
// 종료 시퀀스(before-quit → closeDatabase)가 끝난 뒤 위젯 창 close 핸들러 등이
// getDatabase() 를 호출하면 여기서 better-sqlite3 를 '프로세스 종료 도중'에 새로 열고
// 마이그레이션까지 다시 돌려 0x80000003(STATUS_BREAKPOINT) 네이티브 crash 가 발생했었다.
let permanentlyClosed = false

export function getDatabase(): Database.Database {
  if (db) return db
  // 종료 후 재오픈 금지 — 네이티브 모듈을 teardown 중에 다시 열지 않는다.
  if (permanentlyClosed) {
    throw new Error('Database has been permanently closed (app is shutting down)')
  }

  const dbPath = path.join(app.getPath('userData'), 'schooldesk.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  runDataMigrations(db)

  return db
}

export function closeDatabase(): void {
  permanentlyClosed = true
  if (db) {
    db.close()
    db = null
  }
}
