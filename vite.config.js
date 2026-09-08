import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const JSON_FILE_PATH = path.resolve(__dirname, 'data_scan.json')

function jsonStoragePlugin() {
  return {
    name: 'json-storage-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/scans' && req.method === 'GET') {
          try {
            if (!fs.existsSync(JSON_FILE_PATH)) {
              fs.writeFileSync(JSON_FILE_PATH, '[]', 'utf-8')
            }
            const data = fs.readFileSync(JSON_FILE_PATH, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data || '[]')
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        if (req.url === '/api/scans' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const newScan = JSON.parse(body)
              let list = []
              if (fs.existsSync(JSON_FILE_PATH)) {
                try {
                  list = JSON.parse(fs.readFileSync(JSON_FILE_PATH, 'utf-8'))
                } catch {
                  list = []
                }
              }
              if (!Array.isArray(list)) list = []
              
              // Tambahkan ke paling depan
              list.unshift(newScan)
              fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8')
              
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, count: list.length }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        if (req.url === '/api/scans/delete' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { id } = JSON.parse(body)
              let list = []
              if (fs.existsSync(JSON_FILE_PATH)) {
                try {
                  list = JSON.parse(fs.readFileSync(JSON_FILE_PATH, 'utf-8'))
                } catch {
                  list = []
                }
              }
              if (!Array.isArray(list)) list = []
              list = list.filter(item => item.id !== id)
              fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, count: list.length }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        if (req.url === '/api/scans/clear' && req.method === 'POST') {
          try {
            fs.writeFileSync(JSON_FILE_PATH, '[]', 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), jsonStoragePlugin()],
})
