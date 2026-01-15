import http from 'http'
import fs from 'fs'
import path from 'path'
import url from 'url'

const PORT = Number(process.env.WEB_AUTH_PORT || 3001)
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/')
  const pathname = parsed.pathname || '/'

  const filePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const fullPath = path.join(PUBLIC_DIR, filePath)

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const ext = path.extname(fullPath)
    const contentType = ext === '.html' ? 'text/html' : 'text/plain'
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Web auth UI running on http://localhost:${PORT}`)
})
