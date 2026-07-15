import { readFileSync } from 'fs'
import { join } from 'path'

export async function applySchema(db: any) {
  // 単一の source of truth: マイグレーションのベースライン（旧 schema.sql を統合）
  const schemaPath = join(__dirname, '../migrations/0001_baseline.sql')
  const schemaSql = readFileSync(schemaPath, 'utf-8')
  
  // D1のバッチ処理または複数ステートメントは一気に実行できないことがあるため分割する
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  for (const stmt of statements) {
    await db.prepare(stmt).run()
  }
}
