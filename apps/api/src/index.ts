import http from 'http'
import crypto from 'crypto'
import { URL } from 'url'
import * as oauth from 'oauth4webapi'
import dotenv from 'dotenv'

dotenv.config()

const PORT = Number(process.env.API_PORT || 3000)
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`
const JWT_SECRET =
  process.env.GENERATEUI_JWT_SECRET ||
  'dev-secret-change-in-production'

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

const FREE_FEATURES = {
  intelligentGeneration: false,
  safeRegeneration: false,
  uiOverrides: false,
  maxGenerations: 1
}

const DEV_FEATURES = {
  intelligentGeneration: true,
  safeRegeneration: true,
  uiOverrides: true,
  maxGenerations: -1
}

type Provider = 'github' | 'google'

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

function redirect(res: http.ServerResponse, location: string) {
  res.writeHead(302, { Location: location })
  res.end()
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
    })
    req.on('end', () => resolve(data))
  })
}

function base64Url(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signHmac(input: string) {
  return base64Url(
    crypto.createHmac('sha256', JWT_SECRET).update(input).digest()
  )
}

function signToken(payload: Record<string, unknown>, expiresInSec = 30 * 24 * 60 * 60) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec
  }
  const body = base64Url(JSON.stringify(fullPayload))
  const signature = signHmac(`${header}.${body}`)
  return `${header}.${body}.${signature}`
}

function verifyToken(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = signHmac(`${header}.${body}`)
  if (expected !== signature) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf-8'
      )
    )
    const exp = payload.exp
    if (typeof exp !== 'number' || exp * 1000 <= Date.now()) return null
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

function signState(payload: Record<string, unknown>) {
  const body = base64Url(JSON.stringify(payload))
  const signature = signHmac(body)
  return `${body}.${signature}`
}

function verifyState(state: string) {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  const expected = signHmac(body)
  if (expected !== signature) return null
  try {
    return JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf-8'
      )
    )
  } catch {
    return null
  }
}

async function getAuthRedirect(provider: Provider, redirectUri: string) {
  const codeVerifier = oauth.generateRandomCodeVerifier()
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
  const nonce = provider === 'google' ? oauth.generateRandomNonce() : undefined

  const state = signState({
    provider,
    redirectUri,
    codeVerifier,
    nonce,
    state: oauth.generateRandomState()
  })

  if (provider === 'github') {
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', GITHUB_CLIENT_ID)
    url.searchParams.set('redirect_uri', `${BASE_URL}/auth/github/callback`)
    url.searchParams.set('scope', 'read:user user:email')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${BASE_URL}/auth/google/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  if (nonce) {
    url.searchParams.set('nonce', nonce)
  }
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

function getGitHubAuthorizationServer(): oauth.AuthorizationServer {
  return {
    issuer: 'https://github.com',
    authorization_endpoint: 'https://github.com/login/oauth/authorize',
    token_endpoint: 'https://github.com/login/oauth/access_token'
  }
}

function getGoogleAuthorizationServer(): oauth.AuthorizationServer {
  return {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token'
  }
}

function getGitHubClient(): oauth.Client {
  return {
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET
  }
}

function getGoogleClient(): oauth.Client {
  return {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET
  }
}

async function exchangeGitHubCode(params: URLSearchParams, codeVerifier: string, redirectUri: string) {
  const as = getGitHubAuthorizationServer()
  const client = getGitHubClient()

  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    params,
    redirectUri,
    codeVerifier
  )

  const result = await oauth.processAuthorizationCodeOAuth2Response(
    as,
    client,
    response
  )

  if (oauth.isOAuth2Error(result)) {
    throw new Error('GitHub token missing')
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${result.access_token}`,
      'User-Agent': 'GenerateUI'
    }
  })
  const user = (await userResponse.json()) as { id?: number }

  return {
    providerUserId: user.id ? `github:${user.id}` : 'github:unknown'
  }
}

async function exchangeGoogleCode(
  params: URLSearchParams,
  codeVerifier: string,
  redirectUri: string,
  nonce: string | undefined
) {
  const as = getGoogleAuthorizationServer()
  const client = getGoogleClient()

  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    params,
    redirectUri,
    codeVerifier
  )

  const result = await oauth.processAuthorizationCodeOpenIDResponse(
    as,
    client,
    response,
    nonce || oauth.expectNoNonce
  )

  if (oauth.isOAuth2Error(result)) {
    throw new Error('Google token missing')
  }

  const payload = result.id_token.split('.')[1]
  const decoded = JSON.parse(
    Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf-8'
    )
  ) as { sub?: string }

  return {
    providerUserId: decoded.sub ? `google:${decoded.sub}` : 'google:unknown'
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', BASE_URL)
  const path = requestUrl.pathname

  if (req.method === 'GET' && path === '/me') {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : ''

    if (token) {
      const payload = verifyToken(token)
      if (payload) {
        return json(res, 200, {
          plan: 'dev',
          features: DEV_FEATURES
        })
      }
    }

    return json(res, 200, {
      plan: 'free',
      features: FREE_FEATURES
    })
  }

  if (req.method === 'POST' && path === '/telemetry') {
    try {
      const body = await readBody(req)
      if (body) {
        console.log('[telemetry]', body)
      }
    } catch {
      // Telemetry should never block execution.
    }
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && path === '/auth/github') {
    const redirectUri = requestUrl.searchParams.get('redirect_uri') || ''
    if (!redirectUri) {
      return json(res, 400, { error: 'redirect_uri required' })
    }
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return json(res, 500, { error: 'GitHub OAuth not configured' })
    }
    const location = await getAuthRedirect('github', redirectUri)
    return redirect(res, location)
  }

  if (req.method === 'GET' && path === '/auth/google') {
    const redirectUri = requestUrl.searchParams.get('redirect_uri') || ''
    if (!redirectUri) {
      return json(res, 400, { error: 'redirect_uri required' })
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return json(res, 500, { error: 'Google OAuth not configured' })
    }
    const location = await getAuthRedirect('google', redirectUri)
    return redirect(res, location)
  }

  if (req.method === 'GET' && path === '/auth/github/callback') {
    const state = requestUrl.searchParams.get('state') || ''
    const payload = verifyState(state) as
      | { redirectUri?: string; codeVerifier?: string }
      | null

    if (!payload?.redirectUri || !payload.codeVerifier) {
      return json(res, 400, { error: 'Invalid callback' })
    }

    try {
      const params = oauth.validateAuthResponse(
        getGitHubAuthorizationServer(),
        getGitHubClient(),
        requestUrl,
        state
      )
      if (oauth.isOAuth2Error(params)) {
        return json(res, 400, { error: 'Invalid auth response' })
      }
      const { providerUserId } = await exchangeGitHubCode(
        params,
        payload.codeVerifier,
        `${BASE_URL}/auth/github/callback`
      )
      const token = signToken({ sub: providerUserId, plan: 'dev' })
      const expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString()
      const redirectUrl = new URL(payload.redirectUri)
      redirectUrl.searchParams.set('access_token', token)
      redirectUrl.searchParams.set('expires_at', expiresAt)
      return redirect(res, redirectUrl.toString())
    } catch (error) {
      return json(res, 500, { error: 'OAuth failed' })
    }
  }

  if (req.method === 'GET' && path === '/auth/google/callback') {
    const state = requestUrl.searchParams.get('state') || ''
    const payload = verifyState(state) as
      | { redirectUri?: string; codeVerifier?: string; nonce?: string }
      | null

    if (!payload?.redirectUri || !payload.codeVerifier) {
      return json(res, 400, { error: 'Invalid callback' })
    }

    try {
      const params = oauth.validateAuthResponse(
        getGoogleAuthorizationServer(),
        getGoogleClient(),
        requestUrl,
        state
      )
      if (oauth.isOAuth2Error(params)) {
        return json(res, 400, { error: 'Invalid auth response' })
      }
      const { providerUserId } = await exchangeGoogleCode(
        params,
        payload.codeVerifier,
        `${BASE_URL}/auth/google/callback`,
        payload.nonce
      )
      const token = signToken({ sub: providerUserId, plan: 'dev' })
      const expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString()
      const redirectUrl = new URL(payload.redirectUri)
      redirectUrl.searchParams.set('access_token', token)
      redirectUrl.searchParams.set('expires_at', expiresAt)
      return redirect(res, redirectUrl.toString())
    } catch {
      return json(res, 500, { error: 'OAuth failed' })
    }
  }

  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`API running on ${BASE_URL}`)
})
