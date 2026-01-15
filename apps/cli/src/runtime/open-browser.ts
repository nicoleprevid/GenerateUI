import { spawn } from 'child_process'

export function openBrowser(url: string) {
  const platform = process.platform
  let command = ''
  let args: string[] = []

  if (platform === 'darwin') {
    command = 'open'
    args = [url]
  } else if (platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    command = 'xdg-open'
    args = [url]
  }

  const child = spawn(command, args, {
    stdio: 'ignore',
    detached: true
  })

  child.unref()
}
