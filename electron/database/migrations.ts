import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: Record<string, unknown>) => r.name as string)
  )

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.transaction(() => {
        db.exec(migration.sql)
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name)
      })()
    }
  }
}

const migrations = [
  {
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        start_date TEXT NOT NULL,
        end_date TEXT,
        all_day INTEGER DEFAULT 0,
        color TEXT DEFAULT '#2563EB',
        category TEXT DEFAULT '일반',
        location TEXT DEFAULT '',
        reminder_minutes INTEGER DEFAULT 10,
        recurrence TEXT DEFAULT NULL,
        recurrence_end TEXT DEFAULT NULL,
        is_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        priority INTEGER DEFAULT 2,
        status TEXT DEFAULT 'todo',
        category TEXT DEFAULT '일반',
        due_date TEXT DEFAULT NULL,
        due_time TEXT DEFAULT NULL,
        tags TEXT DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        parent_id TEXT DEFAULT NULL,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT DEFAULT '',
        content TEXT DEFAULT '',
        color TEXT DEFAULT '#FEF3C7',
        is_pinned INTEGER DEFAULT 0,
        category TEXT DEFAULT '일반',
        tags TEXT DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS timetable_slots (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        day_of_week INTEGER NOT NULL,
        period INTEGER NOT NULL,
        subject TEXT NOT NULL,
        class_name TEXT DEFAULT '',
        teacher TEXT DEFAULT '',
        room TEXT DEFAULT '',
        color TEXT DEFAULT '#2563EB',
        memo TEXT DEFAULT '',
        semester TEXT DEFAULT '1',
        timetable_set TEXT DEFAULT 'default',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(day_of_week, period, timetable_set)
      );

      CREATE TABLE IF NOT EXISTS timetable_periods (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        period INTEGER NOT NULL UNIQUE,
        label TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_break INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        color TEXT DEFAULT '#2563EB',
        is_template INTEGER DEFAULT 0,
        category TEXT DEFAULT '일반',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS checklist_items (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        checklist_id TEXT NOT NULL,
        content TEXT NOT NULL,
        is_checked INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        due_date TEXT DEFAULT NULL,
        assignee TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dday_events (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        target_date TEXT NOT NULL,
        color TEXT DEFAULT '#F59E0B',
        emoji TEXT DEFAULT '📅',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS widget_positions (
        widget_id TEXT PRIMARY KEY,
        widget_type TEXT NOT NULL,
        x INTEGER DEFAULT 100,
        y INTEGER DEFAULT 100,
        width INTEGER DEFAULT 350,
        height INTEGER DEFAULT 400,
        is_visible INTEGER DEFAULT 0,
        is_locked INTEGER DEFAULT 0,
        opacity REAL DEFAULT 0.95,
        always_on_top INTEGER DEFAULT 1,
        config TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(start_date);
      CREATE INDEX IF NOT EXISTS idx_schedules_category ON schedules(category);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_memos_pinned ON memos(is_pinned);
      CREATE INDEX IF NOT EXISTS idx_timetable_set ON timetable_slots(timetable_set);
      CREATE INDEX IF NOT EXISTS idx_checklist_items ON checklist_items(checklist_id);
    `
  },
  {
    name: '002_seed_data',
    sql: `
      INSERT OR IGNORE INTO timetable_periods (id, period, label, start_time, end_time, is_break) VALUES
        ('p0', 0, '아침활동', '08:40', '09:00', 0),
        ('p1', 1, '1교시', '09:00', '09:40', 0),
        ('b1', -1, '쉬는시간', '09:40', '09:50', 1),
        ('p2', 2, '2교시', '09:50', '10:30', 0),
        ('b2', -2, '쉬는시간', '10:30', '10:40', 1),
        ('p3', 3, '3교시', '10:40', '11:20', 0),
        ('b3', -3, '쉬는시간', '11:20', '11:30', 1),
        ('p4', 4, '4교시', '11:30', '12:10', 0),
        ('lunch', -4, '점심시간', '12:10', '13:10', 1),
        ('p5', 5, '5교시', '13:10', '13:50', 0),
        ('b5', -5, '쉬는시간', '13:50', '14:00', 1),
        ('p6', 6, '6교시', '14:00', '14:40', 0);

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('theme', '"system"'),
        ('language', '"ko"'),
        ('auto_start', 'true'),
        ('notification_enabled', 'true'),
        ('notification_sound', 'true'),
        ('pomodoro_work', '25'),
        ('pomodoro_break', '5'),
        ('pomodoro_long_break', '15'),
        ('current_timetable_set', '"default"'),
        ('current_semester', '"1"'),
        ('school_name', '""'),
        ('teacher_name', '""'),
        ('class_name', '""'),
        ('backup_path', '""'),
        ('widget_theme', '"glassmorphism"');
    `
  },
  {
    name: '003_timetable_overrides',
    sql: `
      CREATE TABLE IF NOT EXISTS timetable_overrides (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        date TEXT NOT NULL,
        period INTEGER NOT NULL,
        subject TEXT NOT NULL,
        teacher TEXT DEFAULT '',
        room TEXT DEFAULT '',
        color TEXT DEFAULT '#8B5CF6',
        memo TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(date, period)
      );
      CREATE INDEX IF NOT EXISTS idx_timetable_overrides_date ON timetable_overrides(date);
    `
  },
  {
    name: '004_bell_settings',
    sql: `INSERT OR IGNORE INTO settings (key, value) VALUES ('bell_settings', '{}');`
  },
  {
    name: '005_specialist_column',
    sql: `
      ALTER TABLE timetable_slots ADD COLUMN is_specialist INTEGER DEFAULT 0;
      ALTER TABLE timetable_slots ADD COLUMN specialist_teacher TEXT DEFAULT '';
    `
  },
  {
    name: '006_sections',
    sql: `
      CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3B82F6',
        icon TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      ALTER TABLE tasks ADD COLUMN section_id TEXT DEFAULT NULL;
      ALTER TABLE checklists ADD COLUMN section_id TEXT DEFAULT NULL;

      CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
      CREATE INDEX IF NOT EXISTS idx_checklists_section ON checklists(section_id);

      INSERT INTO sections (id, name, color, icon, sort_order) VALUES
        ('sec_recovery',   '회수',     '#EF4444', '📥', 1),
        ('sec_notice',     '안내장',   '#F59E0B', '📄', 2),
        ('sec_work',       '업무',     '#2563EB', '💼', 3),
        ('sec_budget',     '예산',     '#10B981', '💰', 4),
        ('sec_student',    '학생',     '#14B8A6', '👦', 5),
        ('sec_schedule',   '일정',     '#8B5CF6', '📅', 6),
        ('sec_attendance', '출결',     '#6366F1', '🕘', 7),
        ('sec_documents',  '서류',     '#F97316', '📑', 8),
        ('sec_academic',   '학사일정', '#EC4899', '🎓', 9),
        ('sec_school',     '학교정보', '#84CC16', '🏫', 10);
    `
  },
  {
    name: '007_checklist_checked_at',
    // 체크리스트 항목에 체크 시각 기록. 24시간 지나면 자동 삭제용.
    sql: `
      ALTER TABLE checklist_items ADD COLUMN checked_at TEXT DEFAULT NULL;
    `
  },
  {
    name: '008_widget_font_scale',
    // 위젯별 글씨 크기 배율 (Electron webContents.zoomFactor)
    sql: `
      ALTER TABLE widget_positions ADD COLUMN font_scale REAL DEFAULT 1.0;
    `
  },
  {
    name: '009_routines',
    // 루틴(매일 반복 체크) + 날짜별 완료 기록
    sql: `
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        color TEXT DEFAULT '#8B5CF6',
        icon TEXT DEFAULT '🔁',
        sort_order INTEGER DEFAULT 0,
        start_date TEXT DEFAULT (date('now','localtime')),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS routine_items (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        routine_id TEXT NOT NULL,
        content TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS routine_completions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        item_id TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(item_id, date),
        FOREIGN KEY (item_id) REFERENCES routine_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_routine_items ON routine_items(routine_id);
      CREATE INDEX IF NOT EXISTS idx_routine_completions ON routine_completions(item_id, date);
    `
  },
  {
    name: '010_class_goals',
    // 우리반 목표 — 학생에게 항상 보여줄 한 줄 가치 문장들
    sql: `
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        content TEXT NOT NULL,
        emoji TEXT DEFAULT '🎯',
        color TEXT DEFAULT '#2563EB',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );
    `
  },
  {
    name: '011_routine_kind',
    // 루틴 용도 분기: personal(개인) / classroom(학급 공용 체크)
    sql: `
      ALTER TABLE routines ADD COLUMN kind TEXT DEFAULT 'personal';
    `
  },
  {
    name: '012_widget_wallpaper_mode',
    // 배경화면 모드: 1=클릭 통과+z-order 최하단 고정, 0=일반 위젯
    sql: `
      ALTER TABLE widget_positions ADD COLUMN wallpaper_mode INTEGER DEFAULT 0;
    `
  },
  {
    name: '013_student_records',
    // 학생 기록 + append-only 해시체인 로그 (법원 증거능력 목적)
    //  - student_records : 현재 상태(soft-delete via is_deleted)
    //  - student_record_logs : append-only. 각 로그는 SHA-256 해시체인으로 변조 탐지
    //      hash = SHA-256(record_id|action|student_name|content_after|tag_after|timestamp|prev_hash)
    //      prev_hash 는 이전 로그 한 행의 hash. 중간 행을 바꾸면 이후 체인이 전부 무효가 됨.
    sql: `
      CREATE TABLE IF NOT EXISTS student_records (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        student_name TEXT NOT NULL,
        content TEXT NOT NULL,
        tag TEXT DEFAULT '',
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS student_record_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('create','update','delete')),
        student_name TEXT NOT NULL,
        content_before TEXT,
        content_after TEXT,
        tag_before TEXT,
        tag_after TEXT,
        timestamp TEXT NOT NULL,
        prev_hash TEXT,
        hash TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_student_records_name ON student_records(student_name);
      CREATE INDEX IF NOT EXISTS idx_student_records_deleted ON student_records(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_student_record_logs_record ON student_record_logs(record_id, id);
    `
  },
  {
    name: '014_override_kind',
    // 시간표 Override의 종류 구분:
    //   'instructor'     — 외부 강사 수업 (기본값, 기존 데이터)
    //   'extracurricular' — 비교과(보건/상담/영양/기타) — 내부 선생님이지만 일회성/간헐
    sql: `
      ALTER TABLE timetable_overrides ADD COLUMN kind TEXT DEFAULT 'instructor';
    `
  }
]
