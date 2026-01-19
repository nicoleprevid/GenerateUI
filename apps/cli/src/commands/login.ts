import http from 'http'
import { URL } from 'url'
import { createInterface } from 'readline/promises'
import { getApiBaseUrl, getWebAuthUrl } from '../runtime/config'
import { updateUserConfig } from '../runtime/user-config'
import { openBrowser } from '../runtime/open-browser'
import { saveToken } from '../license/token'
import { fetchPermissions } from '../license/permissions'
import { trackCommand, trackLogin } from '../telemetry'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export async function login(options: { telemetryEnabled: boolean }) {
  void trackCommand('login', options.telemetryEnabled)

  const token = await waitForLogin()
  saveToken(token)

  try {
    await fetchPermissions()
  } catch {
    // Cached permissions will be refreshed on next online command.
  }

  const email = await promptEmail()
  if (email) {
    updateUserConfig((config) => ({
      ...config,
      lastLoginEmail: email
    }))
  }
  await trackLogin(email, options.telemetryEnabled)

  console.log('✔ Login completo')
}

async function promptEmail(): Promise<string | null> {
  if (!process.stdin.isTTY) return null

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    const value = await rl.question('Email (optional): ')
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  } finally {
    rl.close()
  }
}

async function waitForLogin(): Promise<{
  accessToken: string
  expiresAt: string
}> {
  return new Promise((resolve, reject) => {
    let loginUrl = ''
    const server = http.createServer((req, res) => {
      const requestUrl = req.url || '/'
      if (!requestUrl.startsWith('/callback')) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      const url = new URL(requestUrl, 'http://localhost')
      const accessToken = url.searchParams.get('access_token')
      const expiresAtParam = url.searchParams.get('expires_at')

      if (!accessToken) {
        res.writeHead(400)
        res.end('Missing access token')
        return
      }

      const expiresAt =
        expiresAtParam ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GenerateUI</title>
    <style>
      :root {
        --bg: #f3e8ff;
        --card: #ffffff;
        --text: #2a1b3d;
        --muted: #6b5b7a;
        --primary: #7c3aed;
        --glow: rgba(124, 58, 237, 0.22);
      }
      * {
        box-sizing: border-box;
        font-family: "IBM Plex Serif", "Georgia", serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #f5ebff, #e9d5ff);
        color: var(--text);
      }
      main {
        background: var(--card);
        padding: 52px 48px;
        border-radius: 24px;
        box-shadow: 0 24px 70px var(--glow);
        width: min(460px, 92vw);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 30px;
      }
      p {
        margin: 0 0 24px;
        color: var(--muted);
        font-size: 16px;
      }
      .pill {
        display: inline-block;
        background: #f5e9ff;
        color: var(--primary);
        padding: 8px 14px;
        border-radius: 999px;
        font-weight: 600;
        letter-spacing: 0.2px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Let's Generate UI</h1>
      <p>Login completed successfully.</p>
      <span class="pill">You can close this window</span>
    </main>
  </body>
</html>`)

      clearTimeout(timeout)
      server.close()
      resolve({ accessToken, expiresAt })
    })

    const timeout = setTimeout(() => {
      server.close()
      const help = loginUrl
        ? ` Ensure the login page is reachable and try again: ${loginUrl}`
        : ` Ensure ${getWebAuthUrl()} and ${getApiBaseUrl()} are reachable.`
      reject(new Error(`Login timed out.${help}`))
    }, LOGIN_TIMEOUT_MS)

    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        clearTimeout(timeout)
        reject(new Error('Failed to start login server'))
        return
      }

      const redirectUri = `http://localhost:${address.port}/callback`
      const url = new URL(getWebAuthUrl())
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('api_base', getApiBaseUrl())

      loginUrl = url.toString()
      console.log(`Open this URL to finish login: ${loginUrl}`)
      openBrowser(loginUrl)
    })
  })
}
