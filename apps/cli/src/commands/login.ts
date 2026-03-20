import http from 'http'
import { URL } from 'url'
import { execSync } from 'child_process'
import { getApiBaseUrl, getWebAuthUrl } from '../runtime/config'
import { updateUserConfig } from '../runtime/user-config'
import { openBrowser } from '../runtime/open-browser'
import { saveToken } from '../license/token'
import { fetchPermissions } from '../license/permissions'
import { trackCommand, trackLogin } from '../telemetry'
import { logDebug, logStep } from '../runtime/logger'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export async function login(options: { telemetryEnabled: boolean }) {
  void trackCommand('login', options.telemetryEnabled)

  logStep('Starting login flow')
  const token = await waitForLogin()
  saveToken(token)
  logDebug('Token saved')

  let permissionsLoaded = false
  let subscriptionReason = ''
  try {
    const permissions = await fetchPermissions()
    permissionsLoaded = true
    subscriptionReason = String(
      permissions.subscription.reason ?? ''
    ).trim()
  } catch {
    console.warn(
      '⚠ Não foi possível validar a licença agora. Verifique sua conexão e rode o comando novamente se necessário.'
    )
  }

  const email = resolveLoginEmail()
  if (email) {
    updateUserConfig((config) => ({
      ...config,
      lastLoginEmail: email
    }))
  }
  await trackLogin(email, options.telemetryEnabled)

  console.log(
    permissionsLoaded
      ? '✔ Login completo'
      : '✔ Login completo (verificação pendente)'
  )
  if (permissionsLoaded && subscriptionReason) {
    console.log(`ℹ Subscription: ${subscriptionReason}`)
  }
}

function resolveLoginEmail(): string | null {
  const envEmail =
    process.env.GIT_AUTHOR_EMAIL ||
    process.env.GIT_COMMITTER_EMAIL ||
    process.env.EMAIL

  if (envEmail && envEmail.trim().length) {
    return envEmail.trim()
  }

  try {
    const output = execSync('git config --get user.email', {
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim()
    return output.length ? output : null
  } catch {
    return null
  }
}

async function waitForLogin(): Promise<{
  accessToken: string
  expiresAt: string
}> {
  return new Promise((resolve, reject) => {
    let loginUrl = ''
    let settled = false
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
        normalizeExpiresAt(expiresAtParam) ||
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
        --bg-1: #f9f5ea;
        --bg-2: #eef7f4;
        --card: #ffffff;
        --text: #39455f;
        --muted: #76819a;
        --accent: #6fd3c0;
        --accent-2: #9fd8ff;
        --border: #e1e7f2;
        --shadow: rgba(76, 88, 120, 0.14);
      }
      * {
        box-sizing: border-box;
        font-family: "Manrope", "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 15% 0%, #fff3c8 0%, var(--bg-1) 36%, transparent 60%),
          radial-gradient(circle at 85% 0%, #e6f7ff 0%, var(--bg-2) 40%, transparent 70%),
          linear-gradient(135deg, #fdfbf6, #f3f7fb);
        color: var(--text);
      }
      main {
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.98));
        padding: 44px;
        border-radius: 28px;
        border: 1px solid var(--border);
        box-shadow: 0 24px 60px var(--shadow);
        width: min(520px, 92vw);
        text-align: left;
        position: relative;
        overflow: hidden;
      }
      main::before {
        content: "";
        position: absolute;
        inset: -40% 25% auto auto;
        width: 280px;
        height: 280px;
        background: radial-gradient(circle, rgba(111,211,192,0.35), transparent 70%);
        pointer-events: none;
      }
      .label {
        letter-spacing: 0.22em;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
      }
      h1 {
        margin: 10px 0 12px;
        font-size: 30px;
        letter-spacing: 0.02em;
      }
      p {
        margin: 0 0 24px;
        color: var(--muted);
        line-height: 1.5;
      }
      .pill {
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.65);
        border: 1px solid var(--border);
        font-size: 12px;
        color: var(--muted);
      }
      .footer {
        margin-top: 12px;
        font-size: 13px;
        color: var(--muted);
      }
      @media (max-width: 520px) {
        main {
          padding: 32px 24px;
          text-align: center;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="label">Generated UI</div>
      <h1>Login completed</h1>
      <p>You can now return to the terminal.</p>
      <div class="footer">
        <span class="pill">You can close this window</span>
      </div>
    </main>
  </body>
</html>`)

      clearTimeout(timeout)
      server.close()
      settled = true
      process.off('SIGINT', handleSigint)
      process.off('SIGTERM', handleSigint)
      resolve({ accessToken, expiresAt })
    })

    const handleSigint = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      server.close()
      reject(new Error('Login canceled by user (SIGINT).'))
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      server.close()
      process.off('SIGINT', handleSigint)
      process.off('SIGTERM', handleSigint)
      const help = loginUrl
        ? ` Ensure the login page is reachable and try again: ${loginUrl}`
        : ` Ensure ${getWebAuthUrl()} and ${getApiBaseUrl()} are reachable.`
      reject(new Error(`Login timed out.${help}`))
    }, LOGIN_TIMEOUT_MS)

    process.on('SIGINT', handleSigint)
    process.on('SIGTERM', handleSigint)

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
      logDebug(`Login callback listening on ${redirectUri}`)
      openBrowser(loginUrl)
    })
  })
}

function normalizeExpiresAt(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.length) return null

  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber)) {
    const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber
    return new Date(ms).toISOString()
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}
