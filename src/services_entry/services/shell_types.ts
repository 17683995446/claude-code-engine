export type ShellCommand = {
  command: string
  timeout_ms: number
}

export type ShellResult = {
  exit_code: number
  stdout: string
  stderr: string
}
