import Database from 'better-sqlite3'

export class D1Mock {
  db: any

  constructor() {
    this.db = new Database(':memory:')
  }

  prepare(query: string) {
    let stmt: any
    try {
      stmt = this.db.prepare(query)
    } catch (e: any) {
      throw new Error(`SQL Prepare Error: ${e.message}\nQuery: ${query}`)
    }

    const boundParams: any[] = []

    const execute = {
      bind: (...params: any[]) => {
        boundParams.push(...params)
        return execute
      },
      first: async () => {
        return stmt.get(...boundParams) || null
      },
      all: async () => {
        const results = stmt.all(...boundParams)
        return { success: true, results }
      },
      run: async () => {
        const info = stmt.run(...boundParams)
        return { 
          success: true, 
          meta: {
            last_row_id: info.lastInsertRowid,
            changes: info.changes
          } 
        }
      }
    }

    return execute
  }
}
