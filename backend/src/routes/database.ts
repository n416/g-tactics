import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

export const databaseApp = new Hono<{ Bindings: Bindings }>()

databaseApp.get('/units', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM units WHERE id < 9000 ORDER BY id ASC').all()
    return c.json({
      success: true,
      units: results
    })
  } catch (e: any) {
    return c.json({
      success: false,
      message: 'Failed to fetch database: ' + e.message
    }, 500)
  }
})
